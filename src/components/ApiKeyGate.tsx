import { FormEvent, useState } from "react";
import { maskGroqApiKey, normalizeGroqApiKey } from "@/lib/groq";

type ApiKeyGateProps = {
  initialApiKey: string;
  onOpenSettings: () => void;
  onSaveKey: (apiKey: string) => void;
};

export function ApiKeyGate({ initialApiKey, onOpenSettings, onSaveKey }: ApiKeyGateProps) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeGroqApiKey(apiKey);

    if (!normalized) {
      setStatus("error");
      setMessage("Paste a Groq API key to start.");
      return;
    }

    onSaveKey(normalized);
  }

  async function testKey() {
    const normalized = normalizeGroqApiKey(apiKey);

    if (!normalized) {
      setStatus("error");
      setMessage("Paste a Groq API key first.");
      return;
    }

    setStatus("testing");
    setMessage("Checking Groq access...");

    try {
      const response = await fetch("/api/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: normalized }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; detail?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.error || result.detail || "Groq key test failed.");
      }

      setApiKey(normalized);
      setStatus("ok");
      setMessage(`Connected with ${maskGroqApiKey(normalized)}.`);
      onSaveKey(normalized);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Groq key test failed.");
    }
  }

  return (
    <div className="grid min-h-0 flex-1 place-items-center px-4 py-8">
      <div className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-950/80 p-5 shadow-2xl">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Session setup</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-100">Connect Groq to start</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Your key stays in this browser session and is only sent to Groq API routes for transcription, suggestions,
            and chat.
          </p>
        </div>

        <form onSubmit={saveKey} className="mt-5 grid gap-3">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Groq API key</span>
            <input
              value={apiKey}
              type="password"
              autoComplete="off"
              onChange={(event) => {
                setApiKey(event.target.value);
                setStatus("idle");
                setMessage("");
              }}
              onBlur={() => setApiKey(normalizeGroqApiKey(apiKey))}
              placeholder="gsk_..."
              className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400"
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <button
              type="submit"
              className="rounded-md bg-blue-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-blue-400"
            >
              Start session
            </button>
            <button
              type="button"
              onClick={() => void testKey()}
              disabled={status === "testing"}
              className="rounded-md border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-blue-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "testing" ? "Testing..." : "Test key"}
            </button>
          </div>
        </form>

        <div className="mt-3 min-h-5">
          {message ? (
            <p
              className={`text-xs leading-5 ${
                status === "ok" ? "text-emerald-300" : status === "error" ? "text-red-300" : "text-slate-500"
              }`}
            >
              {message}
            </p>
          ) : (
            <p className="text-xs leading-5 text-slate-500">Paste only the key value, not an Authorization header.</p>
          )}
        </div>

        <div className="mt-5 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-sm font-semibold text-slate-300 underline-offset-4 hover:text-white hover:underline"
          >
            Review prompts and timing settings
          </button>
        </div>
      </div>
    </div>
  );
}
