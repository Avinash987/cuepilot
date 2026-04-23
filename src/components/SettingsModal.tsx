import { FormEvent, ReactNode, useState } from "react";
import { maskGroqApiKey, normalizeGroqApiKey } from "@/lib/groq";
import type { AppSettings } from "@/lib/types";

type SettingsModalProps = {
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
};

export function SettingsModal({ settings, onClose, onSave }: SettingsModalProps) {
  const [draft, setDraft] = useState(settings);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      ...draft,
      groqApiKey: normalizeGroqApiKey(draft.groqApiKey),
    });
  }

  async function testKey() {
    const apiKey = normalizeGroqApiKey(draft.groqApiKey);

    if (!apiKey) {
      setTestStatus("error");
      setTestMessage("Paste a Groq API key first.");
      return;
    }

    setTestStatus("testing");
    setTestMessage("Testing Groq key...");

    try {
      const response = await fetch("/api/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; detail?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.error || result.detail || "Groq key test failed.");
      }

      setDraft((current) => ({ ...current, groqApiKey: apiKey }));
      setTestStatus("ok");
      setTestMessage(`Groq accepted ${maskGroqApiKey(apiKey)}.`);
    } catch (error) {
      setTestStatus("error");
      setTestMessage(error instanceof Error ? error.message : "Groq key test failed.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Settings</h2>
            <p className="mt-1 text-sm text-slate-500">Tune how the copilot listens, reasons, and answers.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4">
            <SettingsSection
              title="Groq connection"
              description="Used for Whisper transcription and GPT-OSS suggestions/chat. Stored in sessionStorage only."
            >
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">API key</span>
                <div className="flex gap-2">
                  <input
                    value={draft.groqApiKey}
                    type="password"
                    autoComplete="off"
                    onChange={(event) => {
                      setTestStatus("idle");
                      setTestMessage("");
                      update("groqApiKey", event.target.value);
                    }}
                    onBlur={() => update("groqApiKey", normalizeGroqApiKey(draft.groqApiKey))}
                    placeholder="gsk_..."
                    className="min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
                  />
                  <button
                    type="button"
                    onClick={() => void testKey()}
                    disabled={testStatus === "testing"}
                    className="rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {testStatus === "testing" ? "Testing..." : "Test key"}
                  </button>
                </div>
                <p
                  className={`text-xs ${
                    testStatus === "ok"
                      ? "text-emerald-300"
                      : testStatus === "error"
                        ? "text-red-300"
                        : "text-slate-500"
                  }`}
                >
                  {testMessage || `Saved as ${maskGroqApiKey(draft.groqApiKey)} after normalization.`}
                </p>
              </label>
            </SettingsSection>

            <SettingsSection title="Prompts" description="Control what the model optimizes for in each part of the app.">
              <div className="grid gap-4">
                <PromptField
                  label="Live suggestion prompt"
                  helper="Controls the 3 cards in the middle column: card mix, grounding, urgency, and non-repetition."
                  value={draft.liveSuggestionPrompt}
                  onChange={(value) => update("liveSuggestionPrompt", value)}
                />
                <PromptField
                  label="Clicked suggestion answer prompt"
                  helper="Controls the streamed expansion after a card click. Keep this skimmable and meeting-ready."
                  value={draft.expandedAnswerPrompt}
                  onChange={(value) => update("expandedAnswerPrompt", value)}
                />
                <PromptField
                  label="Direct chat prompt"
                  helper="Controls typed questions in the chat panel, including recommendations and wording to say out loud."
                  value={draft.chatPrompt}
                  onChange={(value) => update("chatPrompt", value)}
                />
              </div>
            </SettingsSection>

            <SettingsSection
              title="Context"
              description="Choose how much transcript the model can see. Character caps keep latency predictable."
            >
              <div className="grid gap-3 md:grid-cols-3">
                <NumberField
                  label="Suggestion window"
                  helper="Recent minutes used for live cards. Larger is better for continuity, smaller stays focused."
                  suffix="min"
                  value={draft.suggestionContextMinutes}
                  onChange={(value) => update("suggestionContextMinutes", value)}
                  min={1}
                />
                <NumberField
                  label="Suggestion cap"
                  helper="Recent characters sent to the suggestion model. Default balances relevance and speed."
                  suffix="chars"
                  value={draft.suggestionContextChars}
                  onChange={(value) => update("suggestionContextChars", value)}
                  min={3000}
                />
                <NumberField
                  label="Prior batches"
                  helper="Recent card batches included so the model avoids repeating the same idea."
                  value={draft.previousSuggestionBatches}
                  onChange={(value) => update("previousSuggestionBatches", value)}
                  min={0}
                />
                <NumberField
                  label="Answer window"
                  helper="Minutes available when expanding a clicked card or answering direct chat."
                  suffix="min"
                  value={draft.expandedAnswerContextMinutes}
                  onChange={(value) => update("expandedAnswerContextMinutes", value)}
                  min={1}
                />
                <NumberField
                  label="Answer cap"
                  helper="More context gives better grounding; too much can slow first tokens."
                  suffix="chars"
                  value={draft.expandedAnswerContextChars}
                  onChange={(value) => update("expandedAnswerContextChars", value)}
                  min={8000}
                />
              </div>
            </SettingsSection>

            <SettingsSection
              title="Timing"
              description="Higher values reduce API calls and repetition. Lower values make demos feel more immediate."
            >
              <div className="grid gap-3 md:grid-cols-2">
                <NumberField
                  label="Transcript segment"
                  helper="How often a complete mic segment is sent to Whisper."
                  suffix="ms"
                  value={draft.chunkIntervalMs}
                  onChange={(value) => update("chunkIntervalMs", value)}
                  min={8000}
                />
                <NumberField
                  label="Suggestion refresh"
                  helper="How often fresh cards are generated when new transcript exists. Manual reload can force sooner."
                  suffix="ms"
                  value={draft.suggestionRefreshIntervalMs}
                  onChange={(value) => update("suggestionRefreshIntervalMs", value)}
                  min={16000}
                />
              </div>
            </SettingsSection>

            <SettingsSection title="Audio processing" description="Skip low-signal chunks that would create empty transcript lines or media errors.">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex min-h-24 items-center gap-3 rounded-md border border-slate-800 bg-slate-900 px-3 py-2">
                  <input
                    checked={draft.silenceGateEnabled}
                    type="checkbox"
                    onChange={(event) => update("silenceGateEnabled", event.target.checked)}
                    className="h-4 w-4 accent-blue-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-300">Skip low-signal segments</span>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Keeps pauses, silence, and background audio from interrupting the session.
                    </p>
                  </div>
                </label>
                <NumberField
                  label="Voice threshold"
                  helper="Higher values ignore more background noise. Lower values capture softer speakers."
                  value={draft.voiceActivityThreshold}
                  onChange={(value) => update("voiceActivityThreshold", value)}
                  min={0}
                  step={0.001}
                />
                <NumberField
                  label="Minimum voice"
                  helper="Required speech-like audio per segment before sending it to Whisper."
                  suffix="ms"
                  value={draft.minVoiceMs}
                  onChange={(value) => update("minVoiceMs", value)}
                  min={0}
                />
              </div>
            </SettingsSection>
          </div>
        </div>

        <footer className="flex justify-end gap-3 border-t border-slate-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500"
          >
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-slate-950">
            Save settings
          </button>
        </footer>
      </form>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950">
      <div className="border-b border-slate-800 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-100">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function NumberField({
  label,
  helper,
  suffix,
  value,
  min,
  step,
  onChange,
}: {
  label: string;
  helper?: string;
  suffix?: string;
  value: number;
  min: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2 rounded-md border border-slate-800 bg-slate-900 p-3">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <input
          value={value}
          type="number"
          min={min}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
        />
        {suffix ? <span className="w-8 text-xs font-semibold uppercase text-slate-500">{suffix}</span> : null}
      </div>
      {helper ? <span className="text-xs leading-5 text-slate-500">{helper}</span> : null}
    </label>
  );
}

function PromptField({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <div>
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</span>
        <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="max-h-72 resize-y rounded-md border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-blue-400"
      />
    </label>
  );
}
