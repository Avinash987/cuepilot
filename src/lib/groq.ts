import { CHAT_MODEL, TRANSCRIPTION_MODEL } from "./defaults";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

// Evaluators often paste keys from docs, env files, or Authorization headers.
// Normalize those forms once so every API route can use the same value.
export function normalizeGroqApiKey(apiKey: string) {
  const cleaned = apiKey
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  const match = cleaned.match(/gsk_[A-Za-z0-9_-]+/);

  if (match) {
    return match[0];
  }

  return cleaned
    .replace(/^Authorization:\s*/i, "")
    .replace(/^Bearer\s+/i, "")
    .replace(/^GROQ_API_KEY\s*=\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

export function maskGroqApiKey(apiKey: string) {
  const normalized = normalizeGroqApiKey(apiKey);

  if (!normalized) {
    return "No key saved";
  }

  if (normalized.length <= 12) {
    return `${normalized.slice(0, 4)}...`;
  }

  return `${normalized.slice(0, 7)}...${normalized.slice(-4)} (${normalized.length} chars)`;
}

export function groqErrorMessage(status: number, detail: string) {
  if (status === 401) {
    return "Groq rejected the API key. Check that the key is valid and paste only the key value, not the full Authorization header.";
  }

  if (status === 429) {
    return "Groq rate-limited the request. Wait briefly and try again.";
  }

  return detail || `Groq request failed with ${status}`;
}

export async function groqChatCompletion(
  apiKey: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    responseFormat?: Record<string, unknown>;
  },
) {
  return fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${normalizeGroqApiKey(apiKey)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_completion_tokens: options?.maxTokens ?? 1200,
      stream: options?.stream ?? false,
      ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
    }),
  });
}

export async function groqTranscription(apiKey: string, formData: FormData) {
  formData.set("model", TRANSCRIPTION_MODEL);
  formData.set("response_format", "json");
  formData.set("temperature", "0");

  return fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${normalizeGroqApiKey(apiKey)}`,
    },
    body: formData,
  });
}
