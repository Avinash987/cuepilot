"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ApiKeyGate } from "@/components/ApiKeyGate";
import { ChatPanel } from "@/components/ChatPanel";
import { SettingsModal } from "@/components/SettingsModal";
import { SuggestionsPanel } from "@/components/SuggestionsPanel";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { LOCAL_SETTINGS_KEY, SESSION_API_KEY } from "@/lib/defaults";
import { audioExtensionFromMimeType, getSupportedAudioMimeType } from "@/lib/audio";
import { downloadSessionExport } from "@/lib/exportSession";
import { normalizeGroqApiKey } from "@/lib/groq";
import { appReducer, createId, createInitialState } from "@/lib/reducer";
import { getTranscriptWindowWithCap } from "@/lib/transcript";
import type { AppSettings, ChatMessage, Suggestion, SuggestionBatch, TranscriptChunk } from "@/lib/types";

type AudioJob = {
  blob: Blob;
  startedAt: string;
  endedAt: string;
  manual: boolean;
  mimeType: string;
  voiceMs: number;
};

// Whisper is much more reliable with complete media files than with arbitrary
// MediaRecorder timeslice fragments, so the app rotates full recorder segments.
const MIN_AUDIO_CHUNK_BYTES = 2048;
const MIN_AUDIO_CHUNK_MS = 1200;
const VAD_SAMPLE_INTERVAL_MS = 250;
const MIN_TRANSCRIPT_SEGMENT_MS = 8000;
const MIN_SUGGESTION_REFRESH_MS = 16000;

type VadStats = {
  voiceSamples: number;
};

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    groqApiKey: normalizeGroqApiKey(settings.groqApiKey),
    chunkIntervalMs: Math.max(MIN_TRANSCRIPT_SEGMENT_MS, settings.chunkIntervalMs || MIN_TRANSCRIPT_SEGMENT_MS),
    suggestionRefreshIntervalMs: Math.max(
      MIN_SUGGESTION_REFRESH_MS,
      settings.suggestionRefreshIntervalMs || MIN_SUGGESTION_REFRESH_MS,
    ),
    suggestionContextMinutes: Math.max(1, settings.suggestionContextMinutes || 10),
    expandedAnswerContextMinutes: Math.max(1, settings.expandedAnswerContextMinutes || 25),
    suggestionContextChars: Math.max(3000, settings.suggestionContextChars || 4500),
    expandedAnswerContextChars: Math.max(8000, settings.expandedAnswerContextChars || 10000),
    previousSuggestionBatches: Math.max(0, settings.previousSuggestionBatches ?? 3),
    voiceActivityThreshold: Math.max(0, settings.voiceActivityThreshold ?? 0.012),
    minVoiceMs: Math.max(0, settings.minVoiceMs ?? 500),
  };
}

export function AppShell() {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nextSuggestionDueAt, setNextSuggestionDueAt] = useState<number | null>(null);
  const stateRef = useRef(state);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentBlobsRef = useRef<Blob[]>([]);
  const queueRef = useRef<AudioJob[]>([]);
  const processingRef = useRef(false);
  const pendingManualFlushRef = useRef(false);
  const recordingActiveRef = useRef(false);
  const currentMimeTypeRef = useRef("");
  const vadStatsRef = useRef<VadStats>({ voiceSamples: 0 });
  const stopRequestedRef = useRef(false);
  const startRecorderSegmentRef = useRef<() => void>(() => {});
  const lastSuggestionRefreshAtRef = useRef(0);
  const lastSuggestedTranscriptIdRef = useRef("");

  // Async browser callbacks should always read current state, not the render
  // snapshot captured when the callback was created.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const persisted = localStorage.getItem(LOCAL_SETTINGS_KEY);
    const apiKey = sessionStorage.getItem(SESSION_API_KEY) ?? "";
    let settings = normalizeSettings({ ...stateRef.current.settings, groqApiKey: apiKey });

    if (persisted) {
      try {
        settings = normalizeSettings({
          ...stateRef.current.settings,
          ...JSON.parse(persisted),
          groqApiKey: apiKey,
        });
      } catch {
        localStorage.removeItem(LOCAL_SETTINGS_KEY);
      }
    }

    dispatch({ type: "hydrate_settings", settings });
  }, []);

  useEffect(() => {
    return () => {
      if (segmentTimerRef.current) {
        clearTimeout(segmentTimerRef.current);
      }
      if (vadTimerRef.current) {
        clearInterval(vadTimerRef.current);
      }
      if (suggestionTimerRef.current) {
        clearTimeout(suggestionTimerRef.current);
      }
      recorderRef.current?.stop();
      audioSourceRef.current?.disconnect();
      void audioContextRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const panelErrors = useMemo(
    () => ({
      transcript: state.errors.filter((error) => error.panel === "transcript"),
      suggestions: state.errors.filter((error) => error.panel === "suggestions"),
      chat: state.errors.filter((error) => error.panel === "chat"),
    }),
    [state.errors],
  );

  const generateSuggestions = useCallback(async (chunks: TranscriptChunk[], latestChunk?: TranscriptChunk) => {
    const current = stateRef.current;
    const apiKey = normalizeGroqApiKey(current.settings.groqApiKey);

    if (!apiKey) {
      dispatch({ type: "add_error", panel: "settings", message: "Paste a Groq API key before using the app." });
      setSettingsOpen(true);
      return false;
    }

    if (chunks.length === 0) {
      dispatch({ type: "add_error", panel: "suggestions", message: "No transcript is available yet." });
      return false;
    }

    dispatch({ type: "clear_panel_errors", panel: "suggestions" });
    dispatch({ type: "set_work_status", area: "suggestions", status: "generating" });

    try {
      const transcriptWindow = getTranscriptWindowWithCap(
        chunks,
        current.settings.suggestionContextMinutes,
        current.settings.suggestionContextChars,
      );
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          transcriptWindow,
          latestChunk: latestChunk ?? transcriptWindow[transcriptWindow.length - 1],
          previousBatches: current.suggestionBatches.slice(0, current.settings.previousSuggestionBatches),
          settings: {
            liveSuggestionPrompt: current.settings.liveSuggestionPrompt,
          },
        }),
      });

      const result = (await response.json()) as { batch?: SuggestionBatch; error?: string; detail?: string };

      if (!response.ok || !result.batch) {
        throw new Error(result.error || result.detail || "Suggestion request failed.");
      }

      dispatch({ type: "add_suggestion_batch", batch: result.batch });
      dispatch({ type: "set_work_status", area: "suggestions", status: "idle" });
      return true;
    } catch (error) {
      dispatch({ type: "set_work_status", area: "suggestions", status: "error" });
      dispatch({
        type: "add_error",
        panel: "suggestions",
        message: error instanceof Error ? error.message : "Could not generate suggestions.",
      });
      return false;
    }
  }, []);

  const maybeGenerateSuggestions = useCallback(
    async (chunks: TranscriptChunk[], latestChunk?: TranscriptChunk, force = false) => {
      const current = stateRef.current;
      const latestId = latestChunk?.id ?? chunks[chunks.length - 1]?.id ?? "";
      const now = Date.now();
      const elapsed = now - lastSuggestionRefreshAtRef.current;
      const hasNewTranscript = latestId && latestId !== lastSuggestedTranscriptIdRef.current;
      const isDue =
        !lastSuggestionRefreshAtRef.current || elapsed >= current.settings.suggestionRefreshIntervalMs;

      // Live suggestions should feel fresh, but repeated ASR chunks should not
      // spam the middle column with near-duplicate batches.
      if (!force && (!hasNewTranscript || !isDue)) {
        return false;
      }

      const attemptedAt = Date.now();
      lastSuggestionRefreshAtRef.current = attemptedAt;
      setNextSuggestionDueAt(attemptedAt + current.settings.suggestionRefreshIntervalMs);

      const ok = await generateSuggestions(chunks, latestChunk);

      if (ok) {
        lastSuggestedTranscriptIdRef.current = latestId;
      }

      return ok;
    },
    [generateSuggestions],
  );

  const processAudioJob = useCallback(
    async (job: AudioJob) => {
      const current = stateRef.current;
      const apiKey = normalizeGroqApiKey(current.settings.groqApiKey);

      if (!apiKey) {
        dispatch({ type: "add_error", panel: "settings", message: "Paste a Groq API key before recording." });
        setSettingsOpen(true);
        return;
      }

      dispatch({ type: "clear_panel_errors", panel: "transcript" });
      dispatch({ type: "set_work_status", area: "transcript", status: "transcribing" });

      try {
        const durationMs = new Date(job.endedAt).getTime() - new Date(job.startedAt).getTime();
        const isTooSmallForWhisper = job.blob.size < MIN_AUDIO_CHUNK_BYTES || durationMs < MIN_AUDIO_CHUNK_MS;
        const isLowSignal =
          current.settings.silenceGateEnabled && job.voiceMs < current.settings.minVoiceMs && !job.manual;

        // Silent/short chunks are expected during real meetings. Treat them as
        // non-events instead of surfacing errors or adding empty transcript rows.
        if (isTooSmallForWhisper || isLowSignal) {
          dispatch({ type: "set_work_status", area: "transcript", status: "idle" });

          if (job.manual && stateRef.current.transcriptChunks.length > 0) {
            await maybeGenerateSuggestions(
              stateRef.current.transcriptChunks,
              stateRef.current.transcriptChunks[stateRef.current.transcriptChunks.length - 1],
              true,
            );
          }

          return;
        }

        const extension = audioExtensionFromMimeType(job.mimeType);
        const formData = new FormData();
        formData.append("apiKey", apiKey);
        formData.append("audio", job.blob, `chunk.${extension}`);
        formData.append("filename", `chunk.${extension}`);
        formData.append("startedAt", job.startedAt);
        formData.append("endedAt", job.endedAt);

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        const result = (await response.json()) as { text?: string; error?: string; detail?: string };

        if (!response.ok) {
          const message = result.error || result.detail || "Transcription failed.";

          if (message.toLowerCase().includes("valid media file")) {
            dispatch({ type: "set_work_status", area: "transcript", status: "idle" });

            if (job.manual && stateRef.current.transcriptChunks.length > 0) {
              await maybeGenerateSuggestions(
                stateRef.current.transcriptChunks,
                stateRef.current.transcriptChunks[stateRef.current.transcriptChunks.length - 1],
                true,
              );
            }

            return;
          }

          throw new Error(message);
        }

        const text = (result.text ?? "").trim();
        dispatch({ type: "set_work_status", area: "transcript", status: "idle" });

        if (!text) {
          if (job.manual && stateRef.current.transcriptChunks.length > 0) {
            await maybeGenerateSuggestions(
              stateRef.current.transcriptChunks,
              stateRef.current.transcriptChunks[stateRef.current.transcriptChunks.length - 1],
              true,
            );
          }
          return;
        }

        const chunk: TranscriptChunk = {
          id: createId("transcript"),
          text,
          startedAt: job.startedAt,
          endedAt: job.endedAt,
          durationMs,
        };
        const updatedChunks = [...stateRef.current.transcriptChunks, chunk];

        dispatch({ type: "add_transcript_chunk", chunk });
        await maybeGenerateSuggestions(updatedChunks, chunk);
      } catch (error) {
        dispatch({ type: "set_work_status", area: "transcript", status: "error" });
        dispatch({
          type: "add_error",
          panel: "transcript",
          message: error instanceof Error ? error.message : "Could not transcribe audio.",
        });
      }
    },
    [maybeGenerateSuggestions],
  );

  const drainQueue = useCallback(async () => {
    if (processingRef.current) {
      return;
    }

    processingRef.current = true;

    try {
      // Keep transcription sequential so chunks append in the same order they
      // were recorded, even if a later request would finish faster.
      while (queueRef.current.length > 0) {
        const job = queueRef.current.shift();

        if (job) {
          await processAudioJob(job);
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [processAudioJob]);

  const enqueueAudioJob = useCallback(
    (job: AudioJob) => {
      queueRef.current.push(job);
      void drainQueue();
    },
    [drainQueue],
  );

  const clearSegmentTimer = useCallback(() => {
    if (segmentTimerRef.current) {
      clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
  }, []);

  const resetVadStats = useCallback(() => {
    vadStatsRef.current = { voiceSamples: 0 };
  }, []);

  const cleanupAudioResources = useCallback(() => {
    clearSegmentTimer();

    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }

    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;
    analyserRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    segmentBlobsRef.current = [];
  }, [clearSegmentTimer]);

  const setupVoiceActivity = useCallback((stream: MediaStream) => {
    const AudioContextConstructor =
      window.AudioContext ?? (window as AudioWindow).webkitAudioContext;

    if (!AudioContextConstructor) {
      return;
    }

    const audioContext = new AudioContextConstructor();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    const samples = new Uint8Array(analyser.fftSize);

    analyser.fftSize = 2048;
    source.connect(analyser);
    audioContextRef.current = audioContext;
    audioSourceRef.current = source;
    analyserRef.current = analyser;

    // This is intentionally lightweight VAD. It only decides whether a segment
    // has enough speech-like signal to be worth sending to Whisper.
    vadTimerRef.current = setInterval(() => {
      analyser.getByteTimeDomainData(samples);

      let squareSum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        squareSum += centered * centered;
      }

      const rms = Math.sqrt(squareSum / samples.length);
      const threshold = stateRef.current.settings.voiceActivityThreshold;
      const current = vadStatsRef.current;
      vadStatsRef.current = {
        voiceSamples: current.voiceSamples + (rms >= threshold ? 1 : 0),
      };
    }, VAD_SAMPLE_INTERVAL_MS);
  }, []);

  const rotateRecorderSegment = useCallback(() => {
    const recorder = recorderRef.current;

    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }, []);

  const startRecorderSegment = useCallback(() => {
    const stream = streamRef.current;

    if (!stream || !recordingActiveRef.current || stopRequestedRef.current) {
      return;
    }

    const mimeType = currentMimeTypeRef.current;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const startedAt = new Date().toISOString();

    recorderRef.current = recorder;
    segmentBlobsRef.current = [];
    resetVadStats();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        segmentBlobsRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      clearSegmentTimer();
      const endedAt = new Date().toISOString();
      const manual = pendingManualFlushRef.current;
      const blobs = segmentBlobsRef.current;
      const vadStats = vadStatsRef.current;

      pendingManualFlushRef.current = false;
      segmentBlobsRef.current = [];

      if (blobs.length > 0) {
        enqueueAudioJob({
          blob: new Blob(blobs, { type: recorder.mimeType || mimeType || "audio/webm" }),
          startedAt,
          endedAt,
          manual,
          mimeType: recorder.mimeType || mimeType || "audio/webm",
          voiceMs: vadStats.voiceSamples * VAD_SAMPLE_INTERVAL_MS,
        });
      } else if (manual && stateRef.current.transcriptChunks.length > 0) {
        void maybeGenerateSuggestions(
          stateRef.current.transcriptChunks,
          stateRef.current.transcriptChunks[stateRef.current.transcriptChunks.length - 1],
          true,
        );
      }

      if (recordingActiveRef.current && !stopRequestedRef.current) {
        queueMicrotask(() => startRecorderSegmentRef.current());
      } else {
        recordingActiveRef.current = false;
        stopRequestedRef.current = false;
        cleanupAudioResources();
        dispatch({ type: "set_mic_status", status: "paused" });
      }
    };

    recorder.start();
    segmentTimerRef.current = setTimeout(() => {
      rotateRecorderSegment();
    }, stateRef.current.settings.chunkIntervalMs);
  }, [
    cleanupAudioResources,
    clearSegmentTimer,
    enqueueAudioJob,
    maybeGenerateSuggestions,
    resetVadStats,
    rotateRecorderSegment,
  ]);

  useEffect(() => {
    startRecorderSegmentRef.current = startRecorderSegment;
  }, [startRecorderSegment]);

  useEffect(() => {
    if (suggestionTimerRef.current) {
      clearTimeout(suggestionTimerRef.current);
      suggestionTimerRef.current = null;
    }

    if (state.status.mic !== "recording" || state.transcriptChunks.length === 0) {
      return;
    }

    if (state.status.suggestions === "generating" || state.status.transcript === "transcribing") {
      return;
    }

    const intervalMs = state.settings.suggestionRefreshIntervalMs;
    const dueAt = lastSuggestionRefreshAtRef.current
      ? lastSuggestionRefreshAtRef.current + intervalMs
      : Date.now() + intervalMs;
    const delayMs = Math.max(0, dueAt - Date.now());

    suggestionTimerRef.current = setTimeout(() => {
      const current = stateRef.current;
      const lastChunk = current.transcriptChunks[current.transcriptChunks.length - 1];

      if (!lastChunk) {
        return;
      }

      void maybeGenerateSuggestions(current.transcriptChunks, lastChunk, true);
    }, delayMs);

    return () => {
      if (suggestionTimerRef.current) {
        clearTimeout(suggestionTimerRef.current);
        suggestionTimerRef.current = null;
      }
    };
  }, [
    maybeGenerateSuggestions,
    state.settings.suggestionRefreshIntervalMs,
    state.status.mic,
    state.status.suggestions,
    state.status.transcript,
    state.transcriptChunks.length,
  ]);

  const startMic = useCallback(async () => {
    if (!normalizeGroqApiKey(stateRef.current.settings.groqApiKey)) {
      dispatch({ type: "add_error", panel: "settings", message: "Paste a Groq API key before recording." });
      setSettingsOpen(true);
      return;
    }

    try {
      dispatch({ type: "clear_panel_errors", panel: "transcript" });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      streamRef.current = stream;
      currentMimeTypeRef.current = mimeType;
      recordingActiveRef.current = true;
      stopRequestedRef.current = false;
      lastSuggestionRefreshAtRef.current = 0;
      setNextSuggestionDueAt(null);
      setupVoiceActivity(stream);
      startRecorderSegment();
      dispatch({ type: "set_mic_status", status: "recording" });
    } catch (error) {
      cleanupAudioResources();
      recordingActiveRef.current = false;
      dispatch({ type: "set_mic_status", status: "error" });
      dispatch({
        type: "add_error",
        panel: "transcript",
        message: error instanceof Error ? error.message : "Could not start microphone.",
      });
    }
  }, [cleanupAudioResources, setupVoiceActivity, startRecorderSegment]);

  const stopMic = useCallback(() => {
    const recorder = recorderRef.current;

    recordingActiveRef.current = false;
    stopRequestedRef.current = true;
    clearSegmentTimer();

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopRequestedRef.current = false;
      cleanupAudioResources();
    }
    setNextSuggestionDueAt(null);
    dispatch({ type: "set_mic_status", status: "paused" });
  }, [cleanupAudioResources, clearSegmentTimer]);

  const toggleMic = useCallback(() => {
    if (stateRef.current.status.mic === "recording") {
      stopMic();
      return;
    }

    void startMic();
  }, [startMic, stopMic]);

  const refreshSuggestions = useCallback(() => {
    const recorder = recorderRef.current;

    // Manual refresh should use everything said so far, including the current
    // partial segment, before asking the suggestion model for new cards.
    if (recorder && recorder.state === "recording") {
      pendingManualFlushRef.current = true;
      clearSegmentTimer();
      recorder.stop();
      return;
    }

    void maybeGenerateSuggestions(
      stateRef.current.transcriptChunks,
      stateRef.current.transcriptChunks[stateRef.current.transcriptChunks.length - 1],
      true,
    );
  }, [clearSegmentTimer, maybeGenerateSuggestions]);

  const sendChatMessage = useCallback(
    async (message: string, clickedSuggestion?: Suggestion) => {
      const current = stateRef.current;
      const apiKey = normalizeGroqApiKey(current.settings.groqApiKey);

      if (!apiKey) {
        dispatch({ type: "add_error", panel: "settings", message: "Paste a Groq API key before chatting." });
        setSettingsOpen(true);
        return;
      }

      if (current.status.chat === "streaming") {
        return;
      }

      const userMessage: ChatMessage = {
        id: createId("chat_user"),
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
        sourceSuggestionId: clickedSuggestion?.id,
        sourceSuggestionType: clickedSuggestion?.type,
        sourceSuggestionTitle: clickedSuggestion?.title,
      };
      const assistantMessage: ChatMessage = {
        id: createId("chat_assistant"),
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        sourceSuggestionId: clickedSuggestion?.id,
        sourceSuggestionType: clickedSuggestion?.type,
        sourceSuggestionTitle: clickedSuggestion?.title,
      };
      const chatHistory = [...current.chatMessages, userMessage];

      dispatch({ type: "clear_panel_errors", panel: "chat" });
      dispatch({ type: "add_chat_message", message: userMessage });
      dispatch({ type: "add_chat_message", message: assistantMessage });
      dispatch({ type: "set_work_status", area: "chat", status: "streaming" });

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            transcriptWindow: getTranscriptWindowWithCap(
              current.transcriptChunks,
              current.settings.expandedAnswerContextMinutes,
              current.settings.expandedAnswerContextChars,
            ),
            chatHistory,
            userMessage: message,
            clickedSuggestion,
            settings: {
              chatPrompt: current.settings.chatPrompt,
              expandedAnswerPrompt: current.settings.expandedAnswerPrompt,
            },
          }),
        });

        if (!response.ok || !response.body) {
          const result = (await response.json().catch(() => null)) as { error?: string; detail?: string } | null;
          throw new Error(result?.error || result?.detail || "Chat request failed.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

        while (!done) {
          const read = await reader.read();
          done = read.done;
          buffer += decoder.decode(read.value, { stream: !done });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          // The API route converts Groq's OpenAI-compatible stream into small
          // SSE delta events that are easy for the client reducer to append.
          for (const event of events) {
            const lines = event.split("\n");
            const eventName = lines
              .find((line) => line.startsWith("event:"))
              ?.slice(6)
              .trim();
            const data = lines
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");

            if (eventName === "done") {
              done = true;
              break;
            }

            if (eventName === "error") {
              const parsed = data ? (JSON.parse(data) as { error?: string }) : null;
              throw new Error(parsed?.error || "Chat stream failed.");
            }

            if (data) {
              const parsed = JSON.parse(data) as { delta?: string };

              if (parsed.delta) {
                dispatch({
                  type: "append_chat_delta",
                  messageId: assistantMessage.id,
                  delta: parsed.delta,
                });
              }
            }
          }
        }

        dispatch({ type: "set_work_status", area: "chat", status: "idle" });
      } catch (error) {
        dispatch({ type: "set_work_status", area: "chat", status: "error" });
        dispatch({
          type: "replace_chat_message",
          messageId: assistantMessage.id,
          content: "I could not stream an answer. Check the error and try again.",
        });
        dispatch({
          type: "add_error",
          panel: "chat",
          message: error instanceof Error ? error.message : "Could not stream chat answer.",
        });
      }
    },
    [],
  );

  const selectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      void sendChatMessage(suggestion.preview, suggestion);
    },
    [sendChatMessage],
  );

  const saveSettings = useCallback((settings: AppSettings) => {
    const normalizedSettings = normalizeSettings(settings);
    const { groqApiKey, ...persistable } = normalizedSettings;
    sessionStorage.setItem(SESSION_API_KEY, groqApiKey);
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(persistable));
    dispatch({ type: "hydrate_settings", settings: normalizedSettings });
    setSettingsOpen(false);
  }, []);

  const saveApiKey = useCallback(
    (apiKey: string) => {
      saveSettings({ ...stateRef.current.settings, groqApiKey: apiKey });
    },
    [saveSettings],
  );

  const hasGroqApiKey = Boolean(normalizeGroqApiKey(state.settings.groqApiKey));

  return (
    <main className="flex h-screen min-h-160 flex-col overflow-hidden bg-[#0b0d12] text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 bg-[#10131a] px-5 py-3">
        <div>
          <h1 className="text-base font-bold tracking-wide text-slate-100">CuePilot</h1>
        </div>
        <div className="flex items-center gap-2">
          {hasGroqApiKey ? (
            <button
              type="button"
              onClick={() => downloadSessionExport(state)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:border-blue-400 hover:text-white"
            >
              Export JSON
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-white"
          >
            Settings
          </button>
        </div>
      </header>

      {!hasGroqApiKey ? (
        <ApiKeyGate
          initialApiKey={state.settings.groqApiKey}
          onOpenSettings={() => setSettingsOpen(true)}
          onSaveKey={saveApiKey}
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 xl:grid-cols-[1.02fr_1fr_1.02fr]">
          <TranscriptPanel state={state} errors={panelErrors.transcript} onToggleMic={toggleMic} />
          <SuggestionsPanel
            state={state}
            errors={panelErrors.suggestions}
            nextSuggestionDueAt={nextSuggestionDueAt}
            refreshIntervalMs={state.settings.suggestionRefreshIntervalMs}
            onRefresh={refreshSuggestions}
            onSelectSuggestion={selectSuggestion}
          />
          <ChatPanel
            state={state}
            errors={panelErrors.chat}
            onSendMessage={(message) => void sendChatMessage(message)}
          />
        </div>
      )}

      {settingsOpen ? (
        <SettingsModal settings={state.settings} onClose={() => setSettingsOpen(false)} onSave={saveSettings} />
      ) : null}
    </main>
  );
}
