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
2. The default segment size is 30 seconds to match the assignment cadence, configurable in Settings.
3. Audio segments enter a FIFO queue.
4. One sequential pipeline runs at a time:
   `audio chunk -> transcribe -> append transcript`.
5. Suggestions run on a separate cadence, 30 seconds by default. Settings allow lower values for demos, but the shipped default follows the assignment.
6. Manual refresh flushes the current recorder segment and forces a suggestion refresh.
7. Very short, silent, or unusable segments are skipped safely instead of interrupting the session.
8. Each suggestion refresh creates one new batch with exactly 3 cards at the top.
9. Clicking a card adds it to the right-side chat and streams a detailed answer.
10. Export JSON includes transcript chunks, suggestion batches, chat history, settings, timestamps, and model IDs. The Groq key is excluded.

## Prompt Strategy

The live suggestion prompt is optimized for timing and usefulness instead of summaries. It first asks the model to silently infer the conversation mode, then choose the best mix of cards for that moment:

- **Setup**: clarify topic, goal, agenda, stakeholders, and success criteria
- **Discovery**: uncover missing inputs, compare options, and answer active questions
- **Tradeoff**: pressure-test costs, risks, assumptions, and decision criteria
- **Handoff**: turn the discussion into owners, next steps, deadlines, and open risks

The available card types are:

- answer
- question to ask
- talking point
- fact-check
- clarification
- risk
- next step

Each preview must be useful without clicking. The suggestion model receives the last 10 minutes of transcript capped to 4,500 recent characters, the latest chunk separately, and recent prior suggestion batches to reduce repetition. The prompt also tells the model to treat repeated ASR chunks, partial sentences, and noisy audio as lower-confidence context, and to avoid precise external facts unless the transcript supports them or the card explicitly frames the item as something to verify. Transcript and suggestion refreshes default to roughly 30 seconds to match the assignment while still allowing faster demo tuning in Settings.

Suggestions use Groq structured outputs with a JSON schema, then the app validates the returned batch before rendering. The fallback parser remains in place so a transient formatting issue does not break the live session.

Clicked suggestions use a larger transcript window by default, 25 minutes capped to 10,000 recent characters, with a separate expanded-answer prompt. The answer uses a fixed structure: **Context**, **Key points**, and **You could say:**. This keeps answers grounded, skimmable, and directly usable in the meeting rather than turning the chat panel into a long report. Direct chat uses the same transcript context and one continuous chat history.

## Settings

Editable in the app:

- Groq API key
- live suggestion prompt
- expanded answer prompt
- direct chat prompt
- chunk interval
- suggestion refresh interval
- live suggestion context window
- live suggestion character cap
- expanded answer context window
- expanded answer character cap
- number of previous suggestion batches to include
- silence gate toggle, voice threshold, and minimum voice duration

## Tradeoffs

- No database or authentication because the assignment only needs a single browser session.
- Suggestions are non-streaming so the UI only renders validated JSON batches.
- Chat streams through a server-sent event response for faster perceived latency.
- There is no rolling summary yet; the time window plus character cap keeps context recent, bounded, and easy to reason about.
- Chat markdown is rendered with a small local renderer instead of a large dependency.
- The recorder rotates complete media segments instead of uploading raw timeslice fragments, because browser WebM fragments are not always independently decodable by Whisper.

## Validation

```bash
npm run lint
npm run build
```
