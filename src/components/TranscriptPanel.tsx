import { useEffect, useRef } from "react";
import { formatTime } from "@/lib/transcript";
import type { AppState, PanelError } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

type TranscriptPanelProps = {
  state: AppState;
  errors: PanelError[];
  onToggleMic: () => void;
};

export function TranscriptPanel({ state, errors, onToggleMic }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isRecording = state.status.mic === "recording";
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
          <StatusBadge label={state.status.mic} tone={micTone} />
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
              {isRecording ? "Recording. Transcript updates every 8 seconds." : "Stopped. Click to resume."}
            </p>
            <p className="mt-1 text-xs text-slate-500">Live suggestions refresh every 16 seconds.</p>
          </div>
        </div>

        {errors.length > 0 ? (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {errors[0].message}
          </div>
        ) : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {state.transcriptChunks.length === 0 ? (
          <div className="rounded-md border border-blue-500/30 bg-slate-900 px-4 py-3 text-sm leading-6 text-slate-300">
            The transcript scrolls and appends new chunks every 8 seconds while recording. Paste your Groq key in
            settings, then use the mic button to start.
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
