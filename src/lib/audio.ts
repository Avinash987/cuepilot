export function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

export function audioExtensionFromMimeType(mimeType: string) {
  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  if (mimeType.includes("mp4")) {
    return "m4a";
  }

  return "webm";
}
