import { useEffect, useState } from "react";
import { formatTime } from "@/lib/transcript";
import type { AppState, PanelError, Suggestion, SuggestionType } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

type SuggestionsPanelProps = {
  state: AppState;
  errors: PanelError[];
  nextSuggestionDueAt: number | null;
  refreshIntervalMs: number;
  onRefresh: () => void;
  onSelectSuggestion: (suggestion: Suggestion) => void;
};

const typeLabels: Record<SuggestionType, string> = {
  answer: "Answer",
  question_to_ask: "Question to ask",
  talking_point: "Talking point",
  fact_check: "Fact-check",
  clarification: "Clarification",
  risk: "Risk",
  next_step: "Next step",
};

const typeClasses: Record<SuggestionType, string> = {
  answer: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  question_to_ask: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  talking_point: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  fact_check: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  clarification: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  risk: "border-red-500/30 bg-red-500/10 text-red-300",
  next_step: "border-lime-500/30 bg-lime-500/10 text-lime-300",
};

export function SuggestionsPanel({
  state,
  errors,
  nextSuggestionDueAt,
  refreshIntervalMs,
  onRefresh,
  onSelectSuggestion,
}: SuggestionsPanelProps) {
  const [now, setNow] = useState(0);
  const isBusy = state.status.suggestions === "generating" || state.status.transcript === "transcribing";
  const showStatus = state.status.suggestions === "generating" || state.status.suggestions === "error";
  const tone = state.status.suggestions === "generating" ? "busy" : state.status.suggestions === "error" ? "error" : "idle";
  const refreshCadenceLabel = `~${Math.round(refreshIntervalMs / 1000)}s`;
  const remainingSeconds = nextSuggestionDueAt
    ? now
      ? Math.max(0, Math.ceil((nextSuggestionDueAt - now) / 1000))
      : Math.round(refreshIntervalMs / 1000)
    : Math.round(refreshIntervalMs / 1000);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-slate-800 bg-slate-950/70">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">2. Live Suggestions</p>
        <div className="flex items-center gap-3">
          {showStatus ? <StatusBadge label={state.status.suggestions} tone={tone} /> : null}
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {state.suggestionBatches.length} batches
          </span>
        </div>
      </header>

      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isBusy}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:border-blue-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          ↻ Reload suggestions
        </button>
        <span className="text-xs text-slate-500">
          {state.status.mic === "recording" ? `auto-refresh in ${remainingSeconds}s` : `auto-refresh ${refreshCadenceLabel}`}
        </span>
      </div>

      {errors.length > 0 ? (
        <div className="mx-5 mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {errors[0].message}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {state.suggestionBatches.length === 0 ? (
          <div className="flex h-full flex-col">
            <div className="mx-4 mt-3 rounded-md border border-blue-500/30 bg-slate-900 px-4 py-3 text-sm leading-6 text-slate-300">
              On reload or auto every {refreshCadenceLabel}, generate{" "}
              <strong className="font-semibold text-slate-100">3 fresh suggestions</strong> from recent transcript
              context. New batches appear at the top; older batches push down. Each is a tappable card: a{" "}
              <span className="text-blue-300">question to ask</span>, a{" "}
              <span className="text-violet-300">talking point</span>, an{" "}
              <span className="text-emerald-300">answer</span>, or a{" "}
              <span className="text-amber-300">fact-check</span>. The preview alone should already be useful.
            </div>
            <p className="flex flex-1 items-center justify-center text-sm font-semibold text-slate-500">
              Suggestions appear here once recording starts.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {state.suggestionBatches.map((batch, index) => (
              <div key={batch.id} className="space-y-2.5">
                {index > 0 ? (
                  <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                    <span className="h-px flex-1 bg-slate-800" />
                    <span>
                      Batch {state.suggestionBatches.length - index} - {formatTime(batch.createdAt)}
                    </span>
                    <span className="h-px flex-1 bg-slate-800" />
                  </div>
                ) : null}

                {batch.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => onSelectSuggestion(suggestion)}
                    className={`w-full rounded-lg border border-blue-500/50 bg-slate-900/80 px-3.5 py-3 text-left transition hover:border-blue-300 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      index > 0 ? "opacity-75" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.16em] ${typeClasses[suggestion.type]}`}
                      >
                        {typeLabels[suggestion.type]}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-bold leading-5 text-slate-100">{suggestion.title}</h3>
                    <p className="mt-1.5 text-sm leading-5 text-slate-300">{suggestion.preview}</p>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
