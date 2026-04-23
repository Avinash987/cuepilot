import { FormEvent, useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/transcript";
import type { AppState, PanelError, SuggestionType } from "@/lib/types";
import { MarkdownText } from "./MarkdownText";
import { StatusBadge } from "./StatusBadge";

type ChatPanelProps = {
  state: AppState;
  errors: PanelError[];
  onSendMessage: (message: string) => void;
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

export function ChatPanel({ state, errors, onSendMessage }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isStreaming = state.status.chat === "streaming";
  const showStatus = state.status.chat === "streaming" || state.status.chat === "error";
  const tone = state.status.chat === "streaming" ? "busy" : state.status.chat === "error" ? "error" : "idle";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [state.chatMessages]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();

    if (!message || isStreaming) {
      return;
    }

    setDraft("");
    onSendMessage(message);
  }

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-slate-800 bg-slate-950/70">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">3. Chat (Detailed Answers)</p>
        {showStatus ? <StatusBadge label={state.status.chat} tone={tone} /> : null}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {state.chatMessages.length === 0 ? (
          <div className="space-y-12">
            <div className="rounded-md border border-blue-500/30 bg-slate-900 px-4 py-3 text-sm leading-6 text-slate-300">
              Clicking a suggestion adds it to this chat and streams a detailed answer. You can also type questions
              directly. One continuous chat per session.
            </div>
            <p className="text-center text-sm text-slate-500">Click a suggestion or type a question below.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {state.chatMessages.map((message) => (
              <article
                key={message.id}
                className={`rounded-lg border px-3.5 py-3 ${
                  message.role === "user"
                    ? "ml-6 border-blue-500/30 bg-blue-500/10"
                    : "mr-6 border-slate-700 bg-slate-900"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {message.role === "user" ? "You" : "Assistant"}
                    {message.sourceSuggestionType ? ` · ${typeLabels[message.sourceSuggestionType]}` : ""}
                  </span>
                  <time className="text-xs text-slate-600">{formatTime(message.createdAt)}</time>
                </div>
                {message.sourceSuggestionTitle ? (
                  <p className="mb-2 text-sm font-semibold leading-5 text-slate-100">{message.sourceSuggestionTitle}</p>
                ) : null}
                <MarkdownText content={message.content} pending={message.role === "assistant" && isStreaming} />
              </article>
            ))}
          </div>
        )}

        {errors.length > 0 ? (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {errors[0].message}
          </div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-800 p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={isStreaming}
          placeholder="Ask anything..."
          className="min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isStreaming}
          className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          Send
        </button>
      </form>
    </section>
  );
}
