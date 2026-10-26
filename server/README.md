# speech2speechAI · Web app

The browser interface for the [speech2speechAI](../README.md) voice assistant:
a full-screen orb UI (vanilla ES modules, no framework) plus a small FastAPI
server that hosts it and keeps the browser-facing secrets and handshakes
server-side.

## What the server does

- Serves the static front-end (`index.html`, `main.js`, `style.css`, `ui/`, `ws/`, `worklets/`).
- `POST /api/search` — same-origin Google search proxy; the Serper key (if any) never reaches the browser.
- `GET/POST/DELETE /api/voices` — stores your cloned voices (WAV + transcript) for the TTS voice-clone feature.
- `POST /api/calls` — relays WebRTC SDP offers to the realtime server.
- `GET /api/config` — client bootstrap (which capabilities this deploy has).

The audio itself never goes through this server: the browser dials the
realtime server (`ws://…/v1/realtime`) directly. Set
`SPEECH_TO_SPEECH_URL=ws://127.0.0.1:8765/v1/realtime` when the deploy doesn't
let the user pick the server URL in Settings.

## Quick start (local)

You need [uv](https://docs.astral.sh/uv/getting-started/installation/), Node.js/npm, and the
realtime server running (see the [main README](../README.md)).

```bash
npm ci --prefix server
uv pip install -r server/requirements.txt
export SPEECH_TO_SPEECH_URL=ws://localhost:8765/v1/realtime
uv run uvicorn --app-dir server server:app --reload --port 7860
```

Then open <http://127.0.0.1:7860>.

The `start-speech2speechAI.sh` script at the repo root starts this app (and
the rest of the stack) for you.

## Docker

```bash
docker build -t speech2speechai-web server/
docker run -p 7860:7860 -e SPEECH_TO_SPEECH_URL=ws://host.docker.internal:8765/v1/realtime speech2speechai-web
```

(On Linux, replace `host.docker.internal` with your host address.)

## Voice cloning storage

Recorded clones are written to `server/voices/` (created on first save,
git-ignored). Each voice is `<id>.wav` plus an `<id>.json` sidecar holding the
display name and the transcript the user read. The realtime server's qwen3 TTS
handler resolves the wav path and clones from it — so this feature works when
the web app and the realtime server run on the same machine (the default local
setup).

## Front-end structure

| File | Role |
|---|---|
| `main.js` | App shell: state machine, settings, tools, connection |
| `s2s-realtime-client.js` | Adapter around one Agents SDK `RealtimeSession` (WS or WebRTC transport) |
| `ui/` | Chat panel, account chip, voice-clone recorder, DOM helpers |
| `ws/` | Local VAD ducking, orb visualizer, sent-audio recorder |
| `worklets/` | AudioWorklets: mic capture (resample + noise gate) and playback queue |
| `tests/` | Node test suites (`npm test`) |

## Tests

```bash
npm --prefix server run test:agents:adapter   # client/adapter unit tests
npm --prefix server run test:agents:ws        # end-to-end over WebSocket
npm --prefix server run test:agents:webrtc    # end-to-end over WebRTC
```
