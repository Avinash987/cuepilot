import { groqChatCompletion, groqErrorMessage, normalizeGroqApiKey } from "@/lib/groq";
import { transcriptToText } from "@/lib/transcript";
import type { AppSettings, ChatMessage, Suggestion, TranscriptChunk } from "@/lib/types";

export const runtime = "nodejs";

type ChatRequest = {
  apiKey: string;
  transcriptWindow: TranscriptChunk[];
  chatHistory: ChatMessage[];
  userMessage: string;
  clickedSuggestion?: Suggestion;
  settings: Pick<AppSettings, "chatPrompt" | "expandedAnswerPrompt">;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ChatRequest>;
  const apiKey = normalizeGroqApiKey(String(body.apiKey ?? ""));

  if (!apiKey) {
    return Response.json({ error: "Groq API key is required." }, { status: 400 });
  }

  const transcriptWindow = body.transcriptWindow ?? [];
  const chatHistory = body.chatHistory ?? [];
  const userMessage = String(body.userMessage ?? "").trim();
  const clickedSuggestion = body.clickedSuggestion;
  const settings = body.settings;

  if (!userMessage && !clickedSuggestion) {
    return Response.json({ error: "A chat message or clicked suggestion is required." }, { status: 400 });
  }

  const systemPrompt = clickedSuggestion
    ? settings?.expandedAnswerPrompt
    : settings?.chatPrompt;

  if (!systemPrompt?.trim()) {
    return Response.json({ error: "Chat prompt is empty." }, { status: 400 });
  }

  const transcriptText = transcriptWindow.length > 0 ? transcriptToText(transcriptWindow) : "No transcript yet.";
  const recentChat = chatHistory
    .slice(-12)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  const clickedSuggestionBlock = clickedSuggestion
    ? [
        "Clicked suggestion:",
        `Type: ${clickedSuggestion.type}`,
        `Title: ${clickedSuggestion.title}`,
        `Preview: ${clickedSuggestion.preview}`,
        clickedSuggestion.rationale ? `Rationale: ${clickedSuggestion.rationale}` : "",
        "",
        "For clicked suggestions, expand the card with transcript-grounded detail. Use the required Context / Key points / You could say structure. Do not say this is a detailed answer or explain your prompt.",
      ]
        .filter(Boolean)
        .join("\n")
    : "No clicked suggestion.";

  const upstream = await groqChatCompletion(
    apiKey,
    [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          "Transcript context:",
          transcriptText,
          "",
          clickedSuggestionBlock,
          "",
          "Recent chat history:",
          recentChat || "None.",
          "",
          "Current user request:",
          userMessage || "Expand the clicked suggestion.",
        ].join("\n"),
      },
    ],
    { temperature: 0.25, maxTokens: clickedSuggestion ? 900 : 1400, stream: true },
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text();
    return Response.json(
      { error: groqErrorMessage(upstream.status, detail), detail },
      { status: upstream.status || 502 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed.startsWith("data:")) {
              continue;
            }

            const data = trimmed.slice(5).trim();

            if (data === "[DONE]") {
              controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
              controller.close();
              return;
            }

            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const delta = parsed.choices?.[0]?.delta?.content;

              if (delta) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
              }
            } catch {
              controller.enqueue(
                encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "Invalid stream chunk." })}\n\n`),
              );
            }
          }
        }

        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              error: error instanceof Error ? error.message : "Unknown chat stream error.",
            })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
