export type MicStatus = "idle" | "recording" | "paused" | "error";
export type WorkStatus = "idle" | "transcribing" | "generating" | "streaming" | "error";

export type TranscriptChunk = {
  id: string;
  text: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
};

export type SuggestionType =
  | "answer"
  | "question_to_ask"
  | "talking_point"
  | "fact_check"
  | "clarification"
  | "risk"
  | "next_step";

export type SuggestionUrgency = "now" | "soon" | "later";
export type SuggestionConfidence = "low" | "medium" | "high";

export type Suggestion = {
  id: string;
  type: SuggestionType;
  title: string;
  preview: string;
  rationale?: string;
  createdAt: string;
  urgency: SuggestionUrgency;
  confidence: SuggestionConfidence;
  sourceTranscriptIds: string[];
};

export type SuggestionBatch = {
  id: string;
  createdAt: string;
  transcriptWindowStartedAt: string;
  transcriptWindowEndedAt: string;
  suggestions: [Suggestion, Suggestion, Suggestion];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  sourceSuggestionId?: string;
  sourceSuggestionType?: SuggestionType;
  sourceSuggestionTitle?: string;
};

export type PanelName = "transcript" | "suggestions" | "chat" | "settings";

export type PanelError = {
  id: string;
  panel: PanelName;
  message: string;
  createdAt: string;
};

export type AppSettings = {
  groqApiKey: string;
  chunkIntervalMs: number;
  silenceGateEnabled: boolean;
  voiceActivityThreshold: number;
  minVoiceMs: number;
  suggestionRefreshIntervalMs: number;
  suggestionContextMinutes: number;
  expandedAnswerContextMinutes: number;
  previousSuggestionBatches: number;
  liveSuggestionPrompt: string;
  expandedAnswerPrompt: string;
  chatPrompt: string;
};

export type AppState = {
  sessionId: string;
  startedAt: string;
  status: {
    mic: MicStatus;
    transcript: WorkStatus;
    suggestions: WorkStatus;
    chat: WorkStatus;
  };
  transcriptChunks: TranscriptChunk[];
  suggestionBatches: SuggestionBatch[];
  chatMessages: ChatMessage[];
  settings: AppSettings;
  errors: PanelError[];
};

export type ExportedSession = Omit<AppState, "settings"> & {
  exportedAt: string;
  models: {
    transcription: "whisper-large-v3";
    suggestions: "openai/gpt-oss-120b";
    chat: "openai/gpt-oss-120b";
  };
  settings: Omit<AppSettings, "groqApiKey">;
};
