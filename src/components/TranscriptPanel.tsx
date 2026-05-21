import { useEffect, useRef } from "react";
import { formatTime } from "@/lib/transcript";
import type { AppState, CaptureSource, PanelError } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

type TranscriptPanelProps = {
  state: AppState;
  errors: PanelError[];
  onToggleMic: () => void;
  onSelectCaptureSource: (source: CaptureSource) => void;
};

export function TranscriptPanel({ state, errors, onToggleMic, onSelectCaptureSource }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isRecording = state.status.mic === "recording";
  const captureSource = state.settings.captureSource;
  const transcriptCadenceLabel = `~${Math.round(state.settings.chunkIntervalMs / 1000)}s`;
  const micLabel = state.status.mic === "idle" ? "idle" : state.status.mic;
  const micTone =
    state.status.mic === "recording" ? "active" : state.status.mic === "error" ? "error" : "idle";
  const showTranscriptWork =
    state.status.transcript === "transcribing" || state.status.transcript === "error";
  const transcriptTone =
    state.status.transcript === "transcribing"
      ? "busy"
      : state.status.transcript === "error"
        ? "error"
        : "idle";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [state.transcriptChunks.length]);

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-slate-800 bg-slate-950/70">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">1. Mic & Transcript</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge label={micLabel} tone={micTone} />
          {showTranscriptWork ? <StatusBadge label={state.status.transcript} tone={transcriptTone} /> : null}
        </div>
      </header>

      <div className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleMic}
            className={`grid h-11 w-11 place-items-center rounded-full border transition ${
              isRecording
                ? "border-red-400 bg-red-500/90 text-white shadow-[0_0_24px_rgba(239,68,68,0.25)]"
                : "border-blue-400 bg-blue-500 text-slate-950 shadow-[0_0_24px_rgba(59,130,246,0.22)]"
            }`}
            aria-label={isRecording ? "Stop microphone" : "Start microphone"}
          >
            <span className={`block h-2.5 w-2.5 rounded-full ${isRecording ? "bg-white" : "bg-slate-950"}`} />
          </button>
          <div>
            <p className="text-sm font-semibold leading-5 text-slate-300">
              {isRecording
                ? captureSource === "tab_audio"
                  ? `Recording shared tab audio. Transcript appends every ${transcriptCadenceLabel}.`
                  : `Recording microphone. Transcript appends every ${transcriptCadenceLabel}.`
                : `Choose an input and start. Transcript appends every ${transcriptCadenceLabel}.`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {captureSource === "tab_audio"
                ? "For same-machine demos, share the meeting tab and enable tab audio."
                : "Use microphone mode when you want the app to hear nearby speech in the room."}
            </p>
          </div>
        </div>

        <div className="mt-4 inline-flex rounded-md border border-slate-800 bg-slate-900 p-1">
          <button
            type="button"
            disabled={isRecording}
            onClick={() => onSelectCaptureSource("microphone")}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
              captureSource === "microphone"
                ? "bg-blue-500 text-slate-950"
                : "text-slate-400 hover:text-slate-200"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Microphone
          </button>
          <button
            type="button"
            disabled={isRecording}
            onClick={() => onSelectCaptureSource("tab_audio")}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
              captureSource === "tab_audio"
                ? "bg-blue-500 text-slate-950"
                : "text-slate-400 hover:text-slate-200"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Tab audio
          </button>
        </div>

        {captureSource === "tab_audio" && !isRecording ? (
          <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs leading-5 text-amber-100">
            When the share picker opens, choose the Chrome tab playing the meeting and turn on tab audio sharing.
          </div>
        ) : null}

        {errors.length > 0 ? (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {errors[0].message}
          </div>
        ) : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {state.transcriptChunks.length === 0 ? (
          <div className="flex h-full flex-col">
            <div className="mx-4 mt-3 rounded-md border border-blue-500/30 bg-slate-900 px-4 py-3 text-sm leading-6 text-slate-300">
              The transcript scrolls and appends new chunks every {transcriptCadenceLabel} while recording. Use
              microphone mode for nearby speech, or tab audio mode when the meeting is playing on the same machine.
            </div>
            <p className="flex flex-1 items-center justify-center text-sm font-semibold text-slate-500">
              No transcript yet - start the mic.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {state.transcriptChunks.map((chunk) => (
              <article key={chunk.id} className="grid grid-cols-[78px_1fr] gap-3 text-sm leading-6">
                <time className="pt-0.5 text-xs font-medium text-slate-500">{formatTime(chunk.endedAt)}</time>
                <p className="text-slate-200">{chunk.text}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
