import { NextResponse } from "next/server";
import { GROQ_BASE_URL, groqErrorMessage, normalizeGroqApiKey } from "@/lib/groq";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { apiKey?: string };
  const apiKey = normalizeGroqApiKey(String(body.apiKey ?? ""));

  if (!apiKey) {
    return NextResponse.json({ error: "Groq API key is required." }, { status: 400 });
  }

  const upstream = await fetch(`${GROQ_BASE_URL}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const detail = await upstream.text();

  if (!upstream.ok) {
    return NextResponse.json(
      { error: groqErrorMessage(upstream.status, detail), detail },
      { status: upstream.status },
    );
  }

  return NextResponse.json({ ok: true });
}
