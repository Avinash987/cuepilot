import type { TranscriptChunk } from "./types";

export function getTranscriptWindow(chunks: TranscriptChunk[], minutes: number) {
  if (chunks.length === 0) {
    return [];
  }

  const latestMs = new Date(chunks[chunks.length - 1].endedAt).getTime();
  const cutoff = latestMs - minutes * 60 * 1000;

  return chunks.filter((chunk) => new Date(chunk.endedAt).getTime() >= cutoff);
}

export function capTranscriptWindowByChars(chunks: TranscriptChunk[], maxChars: number) {
  if (maxChars <= 0 || chunks.length === 0) {
    return chunks;
  }

  const selected: TranscriptChunk[] = [];
  let totalChars = 0;

  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const chunk = chunks[index];
    const chunkChars = transcriptToText([chunk]).length + 1;

    if (selected.length > 0 && totalChars + chunkChars > maxChars) {
      break;
    }

    selected.unshift(chunk);
    totalChars += chunkChars;
  }

  return selected;
}

export function getTranscriptWindowWithCap(chunks: TranscriptChunk[], minutes: number, maxChars: number) {
  return capTranscriptWindowByChars(getTranscriptWindow(chunks, minutes), maxChars);
}

export function transcriptToText(chunks: TranscriptChunk[]) {
  return chunks
    .map((chunk) => {
      const timestamp = new Date(chunk.endedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
      return `[${timestamp}] (${chunk.id}) ${chunk.text}`;
    })
    .join("\n");
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const keep = Math.max(4, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}
