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
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Settings</h2>
            <p className="mt-1 text-sm text-slate-500">
              Defaults follow the assignment cadence: roughly 30s transcript and suggestion refreshes.
            </p>
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
          <div className="grid gap-5">
            <SettingsSection title="Groq API" description="Session-only key. The app never exports or persists it.">
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

            <SettingsSection
              title="Timing"
              description="Transcripts update quickly; suggestions wait for enough context."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <NumberField
                  label="Transcript segment"
                  helper="Default 30000ms. Lower this for faster demos."
                  suffix="ms"
                  value={draft.chunkIntervalMs}
                  onChange={(value) => update("chunkIntervalMs", value)}
                  min={8000}
                />
                <NumberField
                  label="Suggestion refresh"
                  helper="Default 30000ms. Manual reload can force sooner."
                  suffix="ms"
                  value={draft.suggestionRefreshIntervalMs}
                  onChange={(value) => update("suggestionRefreshIntervalMs", value)}
                  min={16000}
                />
              </div>
            </SettingsSection>

            <SettingsSection title="Context" description="Controls what transcript context the model sees. Time windows are capped by characters for latency and focus.">
              <div className="grid gap-4 md:grid-cols-3">
                <NumberField
                  label="Suggestion context"
                  helper="Recent transcript used for live cards."
                  suffix="min"
                  value={draft.suggestionContextMinutes}
                  onChange={(value) => update("suggestionContextMinutes", value)}
                  min={1}
                />
                <NumberField
                  label="Suggestion cap"
                  helper="Default 4500 chars from the latest transcript."
                  suffix="chars"
                  value={draft.suggestionContextChars}
                  onChange={(value) => update("suggestionContextChars", value)}
                  min={3000}
                />
                <NumberField
                  label="Answer context"
                  helper="Larger window for clicked-card answers."
                  suffix="min"
                  value={draft.expandedAnswerContextMinutes}
                  onChange={(value) => update("expandedAnswerContextMinutes", value)}
                  min={1}
                />
                <NumberField
                  label="Answer cap"
                  helper="Default 10000 chars for grounded expansion."
                  suffix="chars"
                  value={draft.expandedAnswerContextChars}
                  onChange={(value) => update("expandedAnswerContextChars", value)}
                  min={8000}
                />
                <NumberField
                  label="Previous batches"
                  helper="Used to reduce repeated suggestions."
                  value={draft.previousSuggestionBatches}
                  onChange={(value) => update("previousSuggestionBatches", value)}
                  min={0}
                />
              </div>
            </SettingsSection>

            <SettingsSection title="Audio Gate" description="Skips unusable silent chunks without interrupting the session.">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex min-h-24 items-center gap-3 rounded-md border border-slate-800 bg-slate-900 px-3 py-2">
                  <input
                    checked={draft.silenceGateEnabled}
                    type="checkbox"
                    onChange={(event) => update("silenceGateEnabled", event.target.checked)}
                    className="h-4 w-4 accent-blue-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-300">Skip silent segments</span>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Recommended for demos with pauses or music.</p>
                  </div>
                </label>
                <NumberField
                  label="Voice threshold"
                  helper="Higher skips more background noise."
                  value={draft.voiceActivityThreshold}
                  onChange={(value) => update("voiceActivityThreshold", value)}
                  min={0}
                  step={0.001}
                />
                <NumberField
                  label="Minimum voice"
                  helper="Required speech activity per segment."
                  suffix="ms"
                  value={draft.minVoiceMs}
                  onChange={(value) => update("minVoiceMs", value)}
                  min={0}
                />
              </div>
            </SettingsSection>

            <SettingsSection title="Prompts" description="Advanced tuning. Defaults are optimized for this assignment.">
              <div className="grid gap-4">
                <PromptField
                  label="Live suggestion prompt"
                  helper="Generates exactly 3 concise, useful cards."
                  value={draft.liveSuggestionPrompt}
                  onChange={(value) => update("liveSuggestionPrompt", value)}
                />
                <PromptField
                  label="Clicked suggestion answer prompt"
                  helper="Expands a card into a 10-20 second skimmable answer."
                  value={draft.expandedAnswerPrompt}
                  onChange={(value) => update("expandedAnswerPrompt", value)}
                />
                <PromptField
                  label="Direct chat prompt"
                  helper="Used when the user types a question directly."
                  value={draft.chatPrompt}
                  onChange={(value) => update("chatPrompt", value)}
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
        rows={7}
        className="resize-y rounded-md border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-blue-400"
      />
    </label>
  );
}
