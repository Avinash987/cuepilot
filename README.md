# TwinMind Live Suggestions POC

A Next.js web app for the TwinMind live suggestions assignment. It records microphone audio, transcribes short complete audio segments with Groq Whisper, generates exactly 3 live suggestions from recent meeting context, and streams detailed chat answers with Groq GPT-OSS 120B.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Browser-only session state with `useReducer`
- No login, database, or server-side persistence
- Groq OpenAI-compatible APIs:
  - Transcription: `whisper-large-v3`
  - Suggestions and chat: `openai/gpt-oss-120b`

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, open Settings, and paste a Groq API key.

The API key is stored only in `sessionStorage`. Prompts and numeric settings are stored in `localStorage`.

## Product Flow

1. The browser records mic audio as complete rotating `MediaRecorder` segments.
2. The default segment size is 8 seconds for low-latency transcript updates, configurable in Settings.
3. Audio segments enter a FIFO queue.
4. One sequential pipeline runs at a time:
   `audio chunk -> transcribe -> append transcript`.
5. Suggestions run on a separate cadence, 16 seconds by default, so fast 8-second transcription does not create repetitive low-context cards.
6. Manual refresh flushes the current recorder segment and forces a suggestion refresh.
7. Very short, silent, or unusable segments are skipped safely instead of interrupting the session.
8. Each suggestion refresh creates one new batch with exactly 3 cards at the top.
9. Clicking a card adds it to the right-side chat and streams a detailed answer.
10. Export JSON includes transcript chunks, suggestion batches, chat history, settings, timestamps, and model IDs. The Groq key is excluded.

## Prompt Strategy

The live suggestion prompt is optimized for timing and usefulness instead of summaries. It asks the model to choose a mix from:

- answer
- question to ask
- talking point
- fact-check
- clarification
- risk
- next step

Each preview must be useful without clicking. The model receives the last 10 minutes of transcript, the latest chunk separately, and recent prior suggestion batches to reduce repetition. Fast transcript chunks are intentionally batched into 16-second suggestion refreshes so each batch has enough new context to be meaningfully different.

Clicked suggestions use a larger transcript window by default, 25 minutes, with a separate expanded-answer prompt. These answers are intentionally longer than the live cards and grounded in the transcript. Direct chat uses the same transcript context and one continuous chat history.

## Settings

Editable in the app:

- Groq API key
- live suggestion prompt
- expanded answer prompt
- direct chat prompt
- chunk interval
- suggestion refresh interval
- live suggestion context window
- expanded answer context window
- number of previous suggestion batches to include
- silence gate toggle, voice threshold, and minimum voice duration

## Tradeoffs

- No database or authentication because the assignment only needs a single browser session.
- Suggestions are non-streaming so the UI only renders validated JSON batches.
- Chat streams through a server-sent event response for faster perceived latency.
- There is no rolling summary yet; the default 10-minute window keeps live suggestions recent and easy to reason about.
- Markdown chat output is displayed as plain text to keep dependencies minimal.
- The recorder rotates complete media segments instead of uploading raw timeslice fragments, because browser WebM fragments are not always independently decodable by Whisper.

## Validation

```bash
npm run lint
npm run build
```
