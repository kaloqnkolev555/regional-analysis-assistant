# Country and Regional Analysis Assistant

A three-step Angular workspace for entering a regional briefing, reviewing demonstration priorities, and viewing recommendations. Steps 1 and 2 are local frontend demonstrations; Step 3 returns clearly labeled mock recommendations by default.

## Features

- Briefing input with a fictional Solana sample.
- Editable priorities for review and approval.
- Step 3 generation through a small Angular service, with loading, error, retry, and cancellation states.
- Optional HTTP JSON mode for future backend integration.

The sample priorities are fixed demonstration content, not AI analysis of the briefing. Mock recommendations are illustrative and should not be treated as country expertise.

## Prerequisites

- Node.js `^22.22.3`, `^24.15.0`, or `>=26.0.0` (as supported by the installed Angular CLI).
- npm 10.8.2 or a compatible version.

## Install and run

From the repository root:

```sh
cd analysis-assistant
npm ci
npm run start
```

Open <http://localhost:4200/>. Mock mode is the default and requires no backend or API key.

To load the sample, select **Load Sample: Solana Briefing** on Step 1.

## Test and build

Run from `analysis-assistant/`:

```sh
npm test -- --watch=false
npm run build
```

## Technical approach and design decisions

The frontend is an Angular standalone application. Steps 1 and 2 use local timed demonstration behavior and fixed priorities. Step 3 calls one injectable Angular `HttpClient` service that returns an RxJS `Observable`; mock and HTTP modes use the same `{ "text": "..." }` response shape. The default mock response allows evaluators to run the complete frontend demonstration without server setup.

HTTP mode is enabled by changing `useValue: 'mock'` to `useValue: 'http'` in `analysis-assistant/src/app/app.config.ts`. It POSTs a JSON request to `/api/generate`; request and response types are defined in the frontend service.

**Integration trade-off:** This JSON contract is a proposed future frontend boundary, not a working integration with the current Express endpoint. The existing backend `/api/generate` requires a `runId` and returns Server-Sent Events (SSE), so it is incompatible with the frontend's JSON mode. HTTP errors remain errors; the client does not silently substitute mock data. Backend/Gemini generation is not needed for the local demo.

## Environment configuration

No environment file is required for the frontend demo. `.env.example` contains placeholders for optional server configuration. If setting up the separate Express backend, copy it to `analysis-assistant/.env` and provide a server-side Gemini API key there; never put the key in frontend code or commit `.env`. The backend still uses SSE and is not compatible with the frontend JSON generation mode.

## AI development tool

GitHub Copilot was used as the AI development tool for this project. The recommendation demo is local mock content; it is not AI-generated at runtime.
