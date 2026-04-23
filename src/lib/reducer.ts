import { DEFAULT_SETTINGS } from "./defaults";
import type {
  AppSettings,
  AppState,
  ChatMessage,
  PanelError,
  PanelName,
  SuggestionBatch,
  TranscriptChunk,
  WorkStatus,
  MicStatus,
} from "./types";

export type AppAction =
  | { type: "hydrate_settings"; settings: Partial<AppSettings> }
  | { type: "set_mic_status"; status: MicStatus }
  | { type: "set_work_status"; area: "transcript" | "suggestions" | "chat"; status: WorkStatus }
  | { type: "add_transcript_chunk"; chunk: TranscriptChunk }
  | { type: "add_suggestion_batch"; batch: SuggestionBatch }
  | { type: "add_chat_message"; message: ChatMessage }
  | { type: "append_chat_delta"; messageId: string; delta: string }
  | { type: "replace_chat_message"; messageId: string; content: string }
  | { type: "add_error"; panel: PanelName; message: string }
  | { type: "clear_panel_errors"; panel: PanelName };

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createInitialState(): AppState {
  return {
    sessionId: createId("session"),
    startedAt: new Date().toISOString(),
    status: {
      mic: "idle",
      transcript: "idle",
      suggestions: "idle",
      chat: "idle",
    },
    transcriptChunks: [],
    suggestionBatches: [],
    chatMessages: [],
    settings: DEFAULT_SETTINGS,
    errors: [],
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "hydrate_settings":
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.settings,
        },
      };

    case "set_mic_status":
      return {
        ...state,
        status: {
          ...state.status,
          mic: action.status,
        },
      };

    case "set_work_status":
      return {
        ...state,
        status: {
          ...state.status,
          [action.area]: action.status,
        },
      };

    case "add_transcript_chunk":
      return {
        ...state,
        transcriptChunks: [...state.transcriptChunks, action.chunk],
      };

    case "add_suggestion_batch":
      return {
        ...state,
        suggestionBatches: [action.batch, ...state.suggestionBatches],
      };

    case "add_chat_message":
      return {
        ...state,
        chatMessages: [...state.chatMessages, action.message],
      };

    case "append_chat_delta":
      return {
        ...state,
        chatMessages: state.chatMessages.map((message) =>
          message.id === action.messageId
            ? { ...message, content: `${message.content}${action.delta}` }
            : message,
        ),
      };

    case "replace_chat_message":
      return {
        ...state,
        chatMessages: state.chatMessages.map((message) =>
          message.id === action.messageId ? { ...message, content: action.content } : message,
        ),
      };

    case "add_error": {
      const error: PanelError = {
        id: createId("error"),
        panel: action.panel,
        message: action.message,
        createdAt: new Date().toISOString(),
      };

      return {
        ...state,
        errors: [error, ...state.errors].slice(0, 12),
      };
    }

    case "clear_panel_errors":
      return {
        ...state,
        errors: state.errors.filter((error) => error.panel !== action.panel),
      };

    default:
      return state;
  }
}
