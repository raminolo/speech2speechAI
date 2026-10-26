# speech2speechAI

A real-time voice assistant that runs **entirely on your own machine** — no cloud APIs, no keys. Tap the orb, talk, and it answers in any voice you like, including **your own cloned voice** recorded straight from your microphone.

```
you speak → VAD (silero) → STT → local LLM (Gemma) → TTS (Qwen3) → the orb replies
```

The server speaks the **OpenAI Realtime protocol** over WebSocket (and WebRTC), so it works as a drop-in realtime endpoint for your own apps too.

## Highlights

- **Voice cloning from the browser** — record a ~15-second sample in Settings, and the assistant speaks with that voice. Save multiple clones and switch between them anytime (per-voice, applied live mid-conversation).
- **100% local** — speech detection, transcription, the LLM, and synthesis all run on your machine. Nothing leaves it.
- **Realtime protocol** — OpenAI Realtime events over WebSocket/WebRTC; clients built for OpenAI's Realtime API can point here instead.
- **Responsive UI** — a full-screen orb interface that works on desktop, tablet, and phone.
- **Swappable pipeline** — every stage (VAD, STT, LLM, TTS) is pluggable via CLI flags.

## Quick start (Apple Silicon macOS)

`start-speech2speechAI.sh` launches the three pieces and keeps them running:

1. a local **Gemma** LLM served by `llama-server` (port 8080),
2. the **speech-to-speech realtime server** (port 8765),
3. the **web app** (port 7860).

```bash
./start-speech2speechAI.sh          # start (or status / stop)
open https://127.0.0.1:7860
```

The script expects:

- [`uv`](https://docs.astral.sh/uv/getting-started/installation/) and `llama-server` from llama.cpp (`brew install uv llama.cpp`)
- a Python venv for the backend at `~/venvs/speech-to-speech` and one for the web app at `~/speech-to-speech-demo/.venv`
- a Gemma GGUF + mmproj on disk (adjust the `MODEL`/`MMPROJ` paths at the top of the script)

The first start downloads the TTS model (~1–2 GB). Use headphones so the assistant doesn't hear itself.

### From your phone

The app is served over **https** with a self-signed certificate (generated on
first start), which browsers require before granting microphone access. On the
first visit your phone will warn about the certificate — accept it (Show
Details → Visit Website). Then open **`https://<mac-ip>:7860`** (the exact URL
is printed by the start script) and everything — mic, voice cloning, cloning
playback — works over your Wi-Fi. The realtime audio is relayed same-origin
through the web app, so no other configuration is needed.

## Cloning your voice

1. Open **Settings → Voice cloning**.
2. Read the shown sentence aloud while recording, then **Save voice** and give it a name.
3. Pick it under **Voice → Your cloned voices**. It applies live if a conversation is running.

Clones are stored on disk next to the web app (`server/voices/`, git-ignored) and never leave your machine. Voice cloning requires the **Base** TTS model (the start script already configures it); the built-in preset voices need the CustomVoice model instead.

## Manual setup

Run each piece yourself instead of the start script:

```bash
# 1. LLM backend (llama-server with any GGUF model)
llama-server --model <gguf> --mmproj <mmproj> --port 8080

# 2. Realtime server
uv run speech-to-speech serve \
  --stt none --llm_backend chat-completions --tts qwen3 \
  --responses_api_base_url "http://127.0.0.1:8080/v1" --responses_api_stream \
  --qwen3_tts_mlx_quantization 4bit \
  --qwen3_tts_model_name "Qwen/Qwen3-TTS-12Hz-1.7B-Base" \
  --qwen3_tts_ref_audio src/speech_to_speech/TTS/ref_audio.wav \
  --qwen3_tts_ref_text "The transcript of that reference audio."

# 3. Web app
npm ci --prefix server
uv pip install -r server/requirements.txt
uvicorn --app-dir server server:app --port 7860
```

All model backends (STT/LLM/TTS) and their flags are documented in [`src/speech_to_speech/TTS/README.md`](src/speech_to_speech/TTS/README.md) and the rest of [`src/`](src/speech_to_speech/).

## Project layout

| Path | What it is |
|---|---|
| `start-speech2speechAI.sh` | One-command launcher for the full local stack |
| `src/speech_to_speech/` | The realtime pipeline server (VAD, STT, LLM, TTS handlers) |
| `server/` | The web app: front-end + its small FastAPI (search proxy, voice-clone storage) |
| `tests/` | Python and Node test suites |

## Development

```bash
uv sync --python 3.11            # backend deps
uv run pytest tests/ -q          # Python tests
npm ci --prefix server
npm --prefix server run test:agents:adapter   # Node tests (also :ws and :webrtc)
```

## License

Licensed under the **Apache License 2.0** — see [LICENSE](./LICENSE).

This project builds on the open-source
[huggingface/speech-to-speech](https://github.com/huggingface/speech-to-speech)
framework, which inspired this work; the UI, voice-cloning workflow, and local
deployment setup were designed and built on top of it.
