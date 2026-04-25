import { NextResponse } from "next/server";
import { groqChatCompletion, groqErrorMessage, normalizeGroqApiKey } from "@/lib/groq";
import { parsePossiblyLooseJson } from "@/lib/jsonRepair";
import { transcriptToText } from "@/lib/transcript";
import type {
  AppSettings,
  Suggestion,
  SuggestionBatch,
  SuggestionConfidence,
  SuggestionType,
  SuggestionUrgency,
  TranscriptChunk,
} from "@/lib/types";

export const runtime = "nodejs";

const VALID_TYPES = new Set<SuggestionType>([
  "answer",
  "question_to_ask",
  "talking_point",
  "fact_check",
  "clarification",
  "risk",
  "next_step",
]);

const VALID_URGENCY = new Set<SuggestionUrgency>(["now", "soon", "later"]);
const VALID_CONFIDENCE = new Set<SuggestionConfidence>(["low", "medium", "high"]);

// Structured output is the primary contract for the suggestions UI. The parser
// fallback below is only defensive, not the normal path.
const suggestionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "live_suggestion_batch",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["suggestions"],
      properties: {
        suggestions: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "type",
              "title",
              "preview",
              "rationale",
              "urgency",
              "confidence",
              "sourceTranscriptIds",
            ],
            properties: {
              type: {
                type: "string",
                enum: [
                  "answer",
                  "question_to_ask",
                  "talking_point",
                  "fact_check",
                  "clarification",
                  "risk",
                  "next_step",
                ],
              },
              title: { type: "string" },
              preview: { type: "string" },
              rationale: { type: "string" },
              urgency: { type: "string", enum: ["now", "soon", "later"] },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              sourceTranscriptIds: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

type SuggestionRequest = {
  apiKey: string;
  transcriptWindow: TranscriptChunk[];
  latestChunk?: TranscriptChunk;
  previousBatches: SuggestionBatch[];
  settings: Pick<AppSettings, "liveSuggestionPrompt">;
};

type ModelSuggestion = Partial<Omit<Suggestion, "id" | "createdAt">>;

type ModelSuggestionResponse = {
  suggestions?: ModelSuggestion[];
};

function buildSuggestionMessages(
  prompt: string,
  transcriptWindow: TranscriptChunk[],
  latestChunk: TranscriptChunk | undefined,
  previousSuggestionText: string,
) {
  return [
    {
      role: "system" as const,
      content: prompt,
    },
    {
      role: "user" as const,
      content: [
        "Recent transcript window:",
        transcriptToText(transcriptWindow),
        "",
        "Latest chunk to prioritize:",
        latestChunk ? transcriptToText([latestChunk]) : "No latest chunk provided.",
        "",
        "Recent suggestions to avoid repeating:",
        previousSuggestionText || "None.",
        "",
        "Decision task:",
        "- Produce exactly 3 fresh cards for what the user should know, ask, or say next.",
        "- If the latest transcript repeats older content, advance the discussion with sharper questions, risks, or decision criteria.",
        "- Avoid the same tool/vendor/example/recommendation unless the latest transcript clearly asks for it.",
        "- Return strict JSON only.",
      ].join("\n"),
    },
  ];
}

async function requestSuggestionContent(
  apiKey: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  structured: boolean,
) {
  const response = await groqChatCompletion(apiKey, messages, {
    temperature: structured ? 0.3 : 0.2,
    maxTokens: 1200,
    ...(structured ? { responseFormat: suggestionResponseFormat } : {}),
  });
  const raw = await response.text();

  if (!response.ok) {
    return {
      ok: false as const,
      raw,
      error: groqErrorMessage(response.status, raw),
      status: response.status,
    };
  }

  const completion = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return {
    ok: true as const,
    content: completion.choices?.[0]?.message?.content ?? "",
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<SuggestionRequest>;
  const apiKey = normalizeGroqApiKey(String(body.apiKey ?? ""));
  const transcriptWindow = body.transcriptWindow ?? [];
  const latestChunk = body.latestChunk;
  const previousBatches = body.previousBatches ?? [];
  const prompt = body.settings?.liveSuggestionPrompt ?? "";

  if (!apiKey) {
    return NextResponse.json({ error: "Groq API key is required." }, { status: 400 });
  }

  if (!prompt.trim()) {
    return NextResponse.json({ error: "Live suggestion prompt is empty." }, { status: 400 });
  }

  if (transcriptWindow.length === 0) {
    return NextResponse.json(
      { error: "Transcript context is required before generating suggestions." },
      { status: 400 },
    );
  }

  const transcriptIds = new Set(transcriptWindow.map((chunk) => chunk.id));
  const previousSuggestionText = previousBatches
    .flatMap((batch) => batch.suggestions)
    .map((suggestion) => `- ${suggestion.type}: ${suggestion.title} - ${suggestion.preview}`)
    .join("\n");
  const messages = buildSuggestionMessages(prompt, transcriptWindow, latestChunk, previousSuggestionText);

  try {
    let result = await requestSuggestionContent(apiKey, messages, true);

    if (!result.ok && result.status === 400 && result.raw.includes("json_validate_failed")) {
      const fallbackMessages = [
        ...messages,
        {
          role: "user" as const,
          content:
            "Your last answer failed schema validation. Retry with only raw JSON, valid escaping, and no commentary.",
        },
      ];
      result = await requestSuggestionContent(apiKey, fallbackMessages, false);
    }

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, detail: result.raw },
        { status: result.status },
      );
    }

    const content = result.content;
    const parsed = parsePossiblyLooseJson<ModelSuggestionResponse>(content);
    const modelSuggestions = parsed.suggestions;

    if (!Array.isArray(modelSuggestions) || modelSuggestions.length < 3) {
      return NextResponse.json(
        { error: "Model did not return exactly 3 suggestions.", detail: content },
        { status: 502 },
      );
    }

    const createdAt = new Date().toISOString();
    const urgencyOrder: Record<SuggestionUrgency, number> = { now: 0, soon: 1, later: 2 };
    const confidenceOrder: Record<SuggestionConfidence, number> = { high: 0, medium: 1, low: 2 };

    const normalized = modelSuggestions.slice(0, 3).map((suggestion, index) => {
      const type = VALID_TYPES.has(suggestion.type as SuggestionType)
        ? (suggestion.type as SuggestionType)
        : "talking_point";
      const urgency = VALID_URGENCY.has(suggestion.urgency as SuggestionUrgency)
        ? (suggestion.urgency as SuggestionUrgency)
        : index === 0
          ? "now"
          : "soon";
      const confidence = VALID_CONFIDENCE.has(suggestion.confidence as SuggestionConfidence)
        ? (suggestion.confidence as SuggestionConfidence)
        : "medium";
      const sourceTranscriptIds = Array.isArray(suggestion.sourceTranscriptIds)
        ? suggestion.sourceTranscriptIds.filter((id) => transcriptIds.has(id))
        : [];

      // Never trust model-provided ids blindly. Unknown ids are replaced with
      // the latest available transcript chunk so export grounding stays valid.
      return {
        id: `suggestion_${crypto.randomUUID()}`,
        type,
        title: String(suggestion.title ?? "Useful meeting move").slice(0, 120),
        preview: String(suggestion.preview ?? "Ask for the concrete decision, owner, and next step.").slice(
          0,
          320,
        ),
        rationale: suggestion.rationale ? String(suggestion.rationale).slice(0, 240) : undefined,
        createdAt,
        urgency,
        confidence,
        sourceTranscriptIds:
          sourceTranscriptIds.length > 0
            ? sourceTranscriptIds
            : latestChunk
              ? [latestChunk.id]
              : [transcriptWindow[transcriptWindow.length - 1].id],
      };
    });

    const sorted = normalized
      .sort((left, right) => {
        const urgencyDiff = urgencyOrder[left.urgency] - urgencyOrder[right.urgency];
        if (urgencyDiff !== 0) {
          return urgencyDiff;
        }

        const confidenceDiff = confidenceOrder[left.confidence] - confidenceOrder[right.confidence];
        if (confidenceDiff !== 0) {
          return confidenceDiff;
        }

        return left.createdAt.localeCompare(right.createdAt);
      })
      .slice(0, 3) as [Suggestion, Suggestion, Suggestion];

    const batch: SuggestionBatch = {
      id: `batch_${crypto.randomUUID()}`,
      createdAt,
      transcriptWindowStartedAt: transcriptWindow[0].startedAt,
      transcriptWindowEndedAt: transcriptWindow[transcriptWindow.length - 1].endedAt,
      suggestions: sorted,
    };

    return NextResponse.json({ batch });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not parse model suggestions as valid JSON.",
        detail: error instanceof Error ? error.message : "Suggestion JSON parse failed.",
      },
      { status: 502 },
    );
  }
}
