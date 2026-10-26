#!/bin/bash
# Start the local speech-to-speech interview pipeline on macOS.
# Existing services on expected ports are left running; this script won't duplicate them.

set -u
PROJECT="/Volumes/JullSSD/speech-to-speech"
MODEL="/Volumes/JullSSD/models/gemma-4-E4B-it-Q4_0.gguf"
MMPROJ="/Volumes/JullSSD/models/mmproj-gemma-4-E4B-it-BF16.gguf"
SPEECH_VENV="$HOME/venvs/speech-to-speech"
DEMO_VENV="$HOME/speech-to-speech-demo/.venv"
LOG_DIR="$HOME/Library/Logs/speech-to-speech"
PID_DIR="$HOME/Library/Application Support/speech-to-speech/pids"
LLAMA_BIN="/opt/homebrew/bin/llama-server"
UV_BIN="/opt/homebrew/bin/uv"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
mkdir -p "$LOG_DIR" "$PID_DIR"

# macOS Finder copies to the exFAT volume leave AppleDouble junk files (._*)
# next to real files; mlx-audio walks the model folders and tries to load
# them, which silently breaks the speech tokenizer (no TTS audio). Purge them
# before any model loads.
find /Volumes/JullSSD/Models /Volumes/JullSSD/models -name '._*' -delete 2>/dev/null || true

# Phones can only use the microphone from an https page, so the web app is
# served over TLS with a self-signed certificate (generated once, reused).
# Expect your browser to warn about the untrusted certificate — accept it; it
# only exists so the browser grants a "secure context" on the local network.
CERT_DIR="$HOME/Library/Application Support/speech-to-speech/dev-cert"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"
if [[ ! -f "$CERT_FILE" || ! -f "$KEY_FILE" ]]; then
  echo "[CERT] Generating self-signed certificate for local https ..."
  mkdir -p "$CERT_DIR"
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 825 \
    -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -subj "/CN=speech2speechAI local" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${LAN_IP}" \
    >/dev/null 2>&1 || echo "[WARN] Certificate generation failed; the web app will stay on plain http."
fi

port_is_listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

show_status() {
  echo "Local speech-to-speech pipeline:"
  for item in "8080:Gemma llama-server" "8765:Speech-to-speech server" "7860:Web app"; do
    port="${item%%:*}"; name="${item#*:}"
    if port_is_listening "$port"; then
      printf "  [RUNNING] %s on %s:%s\n" "$name" "$(lan_host)" "$port"
    else
      printf "  [STOPPED] %s on %s:%s\n" "$name" "$(lan_host)" "$port"
    fi
  done
}

# LAN address of this Mac, so the web app can be opened from a phone.
lan_host() {
  local ip
  ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  echo "${ip:-127.0.0.1}"
}

wait_for_port() {
  local port="$1" name="$2" tries="${3:-60}" i
  for ((i=1; i<=tries; i++)); do
    if port_is_listening "$port"; then
      echo "[OK] $name is listening on port $port."
      return 0
    fi
    sleep 1
  done
  echo "[ERROR] $name did not start on port $port."
  return 1
}

stop_pipeline() {
  echo "Stopping only services launched and tracked by this script..."
  for port in 7860 8765 8080; do
    pidfile="$PID_DIR/$port.pid"
    if [[ -f "$pidfile" ]]; then
      pid="$(cat "$pidfile")"
      if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
        echo "Stopping PID $pid (port $port)..."
        kill "$pid" 2>/dev/null || true
      fi
      rm -f "$pidfile"
    else
      echo "No tracked process for port $port; leaving it untouched."
    fi
  done
  echo "Stop signals sent. Check status with: $0 status"
}

case "${1:-start}" in
  status) show_status; exit 0 ;;
  stop) stop_pipeline; exit 0 ;;
  start) ;;
  *) echo "Usage: $0 [start|status|stop]"; exit 2 ;;
esac

echo "=== Checking prerequisites ==="
[[ -d "$PROJECT" ]] || { echo "[ERROR] Project directory not found: $PROJECT"; exit 1; }
[[ -f "$MODEL" && -f "$MMPROJ" ]] || { echo "[ERROR] Gemma model or mmproj file missing. Expected: $MODEL and $MMPROJ"; exit 1; }
[[ -x "$LLAMA_BIN" ]] || { echo "[ERROR] llama-server not found at $LLAMA_BIN"; exit 1; }
[[ -x "$UV_BIN" ]] || { echo "[ERROR] uv not found at $UV_BIN"; exit 1; }
[[ -f "$SPEECH_VENV/bin/activate" ]] || { echo "[ERROR] Speech venv not found: $SPEECH_VENV"; exit 1; }
[[ -d "$DEMO_VENV" ]] || { echo "[ERROR] Demo venv not found: $DEMO_VENV"; exit 1; }

echo "Logs: $LOG_DIR"
echo ""

# 1. Local LLM
if ! port_is_listening 8080; then
  echo "[START] Gemma llama-server ..."
  nohup "$LLAMA_BIN" \
    --model "$MODEL" \
    --mmproj "$MMPROJ" \
    --ctx-size 4096 \
    --parallel 1 \
    --n-gpu-layers 99 \
    --flash-attn on \
    --host 127.0.0.1 \
    --port 8080 >>"$LOG_DIR/llama-server.log" 2>&1 &
  echo "$!" > "$PID_DIR/8080.pid"
  wait_for_port 8080 "Gemma llama-server" 90 || { tail -40 "$LOG_DIR/llama-server.log"; exit 1; }
else
  echo "[SKIP] Port 8080 is already in use; leaving its service untouched."
fi

# 2. Speech-to-speech backend
if ! port_is_listening 8765; then
  echo "[START] Speech-to-speech server ..."
  nohup /bin/bash -c '
    cd /Volumes/JullSSD/speech-to-speech || exit 1
    source "$HOME/venvs/speech-to-speech/bin/activate"
    exec /opt/homebrew/bin/uv run --active speech-to-speech serve \
      --host 0.0.0.0 \
      --stt none --llm_backend chat-completions --tts qwen3 \
      --model_name "ggml-org/gemma-4-E4B-it-GGUF" \
      --responses_api_base_url "http://127.0.0.1:8080/v1" \
      --responses_api_api_key "" \
      --responses_api_audio_content_type input_audio \
      --responses_api_stream \
      --qwen3_tts_mlx_quantization 4bit \
      --qwen3_tts_model_name "Qwen/Qwen3-TTS-12Hz-1.7B-Base" \
      --qwen3_tts_ref_audio "src/speech_to_speech/TTS/ref_audio.wav" \
      --qwen3_tts_ref_text "I'\''m confused why some people have super short timelines, yet at the same time are bullish on scaling up reinforcement learning atop LLMs. If we'\''re actually close to a human-like learner, then this whole approach of training on verifiable outcomes." \
      --min_silence_ms 300
  ' >>"$LOG_DIR/speech-server.log" 2>&1 &
  echo "$!" > "$PID_DIR/8765.pid"
  wait_for_port 8765 "Speech-to-speech server" 120 || { tail -50 "$LOG_DIR/speech-server.log"; exit 1; }
else
  echo "[SKIP] Port 8765 is already in use; leaving its service untouched."
fi

# 3. Browser demo
if ! port_is_listening 7860; then
  echo "[START] Browser demo ..."
  nohup /bin/bash -c '
    cd /Volumes/JullSSD/speech-to-speech || exit 1
    export UV_PROJECT_ENVIRONMENT="$HOME/speech-to-speech-demo/.venv"
    export UV_LINK_MODE=copy
    exec /opt/homebrew/bin/uv run --python 3.13 --active --with-requirements server/requirements.txt \
      uvicorn --app-dir server server:app --host 0.0.0.0 --port 7860 \
      --ssl-certfile "$HOME/Library/Application Support/speech-to-speech/dev-cert/cert.pem" \
      --ssl-keyfile "$HOME/Library/Application Support/speech-to-speech/dev-cert/key.pem"
  ' >>"$LOG_DIR/browser-demo.log" 2>&1 &
  echo "$!" > "$PID_DIR/7860.pid"
  wait_for_port 7860 "Browser demo" 90 || { tail -50 "$LOG_DIR/browser-demo.log"; exit 1; }
else
  echo "[SKIP] Port 7860 is already in use; leaving the existing demo untouched."
fi

echo ""
show_status
echo ""
echo "Open the web app on this Mac:      https://127.0.0.1:7860"
echo "Open it from a phone on the same Wi-Fi: https://$(lan_host):7860"
echo "(First visit: accept the self-signed certificate warning.)"
echo "Logs: $LOG_DIR"
echo "Stop tracked services with: $0 stop"
echo "Show status with: $0 status"
