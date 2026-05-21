import { CHAT_MODEL, TRANSCRIPTION_MODEL } from "./defaults";
import type { AppState, ExportedSession } from "./types";

export function buildExport(state: AppState): ExportedSession {
  const safeSettings = {
    captureSource: state.settings.captureSource,
    chunkIntervalMs: state.settings.chunkIntervalMs,
    silenceGateEnabled: state.settings.silenceGateEnabled,
    voiceActivityThreshold: state.settings.voiceActivityThreshold,
    minVoiceMs: state.settings.minVoiceMs,
    suggestionRefreshIntervalMs: state.settings.suggestionRefreshIntervalMs,
    suggestionContextMinutes: state.settings.suggestionContextMinutes,
    suggestionContextChars: state.settings.suggestionContextChars,
    expandedAnswerContextMinutes: state.settings.expandedAnswerContextMinutes,
    expandedAnswerContextChars: state.settings.expandedAnswerContextChars,
    previousSuggestionBatches: state.settings.previousSuggestionBatches,
    liveSuggestionPrompt: state.settings.liveSuggestionPrompt,
    expandedAnswerPrompt: state.settings.expandedAnswerPrompt,
    chatPrompt: state.settings.chatPrompt,
  };

  return {
    ...state,
    exportedAt: new Date().toISOString(),
    models: {
      transcription: TRANSCRIPTION_MODEL,
      suggestions: CHAT_MODEL,
      chat: CHAT_MODEL,
    },
    settings: safeSettings,
  };
}

export function downloadSessionExport(state: AppState) {
  const exported = buildExport(state);
  const blob = new Blob([JSON.stringify(exported, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cuepilot-session-${state.sessionId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
