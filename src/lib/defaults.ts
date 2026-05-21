import type { AppSettings } from "./types";
import {
  DEFAULT_CHAT_PROMPT,
  DEFAULT_EXPANDED_ANSWER_PROMPT,
  DEFAULT_LIVE_SUGGESTION_PROMPT,
} from "./prompts";

export const TRANSCRIPTION_MODEL = "whisper-large-v3" as const;
export const CHAT_MODEL = "openai/gpt-oss-120b" as const;

export const DEFAULT_SETTINGS: AppSettings = {
  groqApiKey: "",
  chunkIntervalMs: 30000,
  silenceGateEnabled: true,
  voiceActivityThreshold: 0.012,
  minVoiceMs: 500,
  suggestionRefreshIntervalMs: 30000,
  suggestionContextMinutes: 10,
  suggestionContextChars: 4500,
  expandedAnswerContextMinutes: 25,
  expandedAnswerContextChars: 10000,
  previousSuggestionBatches: 3,
  liveSuggestionPrompt: DEFAULT_LIVE_SUGGESTION_PROMPT,
  expandedAnswerPrompt: DEFAULT_EXPANDED_ANSWER_PROMPT,
  chatPrompt: DEFAULT_CHAT_PROMPT,
};

export const LOCAL_SETTINGS_KEY = "cuepilot.settings.v1";
export const SESSION_API_KEY = "cuepilot.groqApiKey.v1";
