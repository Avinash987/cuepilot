import { NextResponse } from "next/server";
import { groqErrorMessage, groqTranscription, normalizeGroqApiKey } from "@/lib/groq";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const apiKey = normalizeGroqApiKey(String(formData.get("apiKey") ?? ""));
  const audio = formData.get("audio");
  const filename = String(formData.get("filename") ?? "chunk.webm");

  if (!apiKey) {
    return NextResponse.json({ error: "Groq API key is required." }, { status: 400 });
  }

  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "A non-empty audio file is required." }, { status: 400 });
  }

  const upstreamData = new FormData();
  upstreamData.append("file", audio, filename);

  const upstream = await groqTranscription(apiKey, upstreamData);
  const text = await upstream.text();

  if (!upstream.ok) {
    return NextResponse.json(
      { error: groqErrorMessage(upstream.status, text), detail: text },
      { status: upstream.status },
    );
  }

  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json({ text });
  }
}
