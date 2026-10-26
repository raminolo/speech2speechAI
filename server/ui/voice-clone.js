// @ts-check
/**
 * Voice cloning panel for Settings.
 *
 * The user records themselves reading a fixed sentence, the clip is converted
 * to a 24 kHz mono PCM16 WAV in the browser, and both the audio and its exact
 * transcript are stored server-side (POST /api/voices). Saved clips appear in
 * the Voice dropdown as "Your cloned voices"; the value the speech backend
 * receives is the wav's server-side path, which its qwen3 handler resolves
 * and clones from (Base model).
 *
 * A fixed sentence keeps the transcript exact — cloning quality depends on
 * the reference text matching the reference audio word for word.
 */

import { $ } from "./dom.js";

/** The sentence to read. ~30 words of phonetically varied English, ~15 s. */
export const CLONE_PROMPT_TEXT =
  "Hello, this is my voice. I am reading this sample so my assistant can learn " +
  "how I sound when I speak. The weather today is calm and clear, and I am " +
  "talking at a steady, natural pace.";

const TARGET_RATE = 24000; // matches the pipeline's audio rate
const MIN_DURATION_S = 3;
const MAX_DURATION_S = 30;

/** @typedef {{ id: string, name: string, transcript: string, createdAt: string, path: string }} SavedVoice */

/**
 * Wire up the recorder UI.
 * @param {{ onVoicesChanged: (voices: SavedVoice[]) => void }} options
 *   Called after the saved list changes so the Voice dropdown can repopulate.
 */
export function initVoiceCloneUi({ onVoicesChanged }) {
  const recordBtn = /** @type {HTMLButtonElement} */ ($("#clone-record"));
  const saveBtn = /** @type {HTMLButtonElement} */ ($("#clone-save"));
  const nameInput = /** @type {HTMLInputElement} */ ($("#clone-name"));
  const statusEl = /** @type {HTMLElement} */ ($("#clone-status"));
  const promptEl = /** @type {HTMLElement} */ ($("#clone-prompt"));
  const listEl = /** @type {HTMLElement} */ ($("#clone-list"));

  promptEl.textContent = `“${CLONE_PROMPT_TEXT}”`;

  /** @type {MediaRecorder | null} */ let recorder = null;
  /** @type {MediaStream | null} */ let micStream = null;
  /** @type {Blob[]} */ let chunks = [];
  /** @type {Blob | null} */ let recordedBlob = null;
  /** @type {number} */ let recordStartedAt = 0;
  /** @type {number | null} */ let maxDurationTimer = null;
  /** @type {number | null} */ let tickTimer = null;

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", isError);
  }

  /** Fetch the saved clones and hand them to the Voice dropdown. */
  async function refresh() {
    try {
      const res = await fetch("/api/voices");
      const data = await res.json();
      const voices = Array.isArray(data?.voices) ? data.voices : [];
      renderList(voices);
      onVoicesChanged(voices);
    } catch {
      // Voice storage is optional (static deploys have no /api); leave the
      // dropdown alone and say why the section is dead.
      setStatus("Voice storage is not available on this deploy.", true);
    }
  }

  function renderList(voices) {
    listEl.replaceChildren();
    if (!voices.length) return;
    for (const voice of voices) {
      const row = document.createElement("div");
      row.className = "clone-row";

      const label = document.createElement("span");
      label.className = "clone-row-name";
      label.textContent = voice.name;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn small";
      del.textContent = "Delete";
      del.setAttribute("aria-label", `Delete cloned voice ${voice.name}`);
      del.addEventListener("click", async () => {
        if (!confirm(`Delete the cloned voice “${voice.name}”?`)) return;
        del.disabled = true;
        try {
          const res = await fetch(`/api/voices/${voice.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error(String(res.status));
          await refresh();
        } catch {
          del.disabled = false;
          setStatus("Could not delete the voice. Is the server running?", true);
        }
      });

      row.append(label, del);
      listEl.append(row);
    }
  }

  function stopRecording() {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (maxDurationTimer !== null) clearTimeout(maxDurationTimer);
    if (tickTimer !== null) clearInterval(tickTimer);
  }

  function teardownMic() {
    for (const track of micStream?.getTracks() ?? []) track.stop();
    micStream = null;
  }

  async function startRecording() {
    recordedBlob = null;
    saveBtn.disabled = true;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setStatus("Microphone access was denied. Allow it and try again.", true);
      return;
    }

    chunks = [];
    try {
      recorder = new MediaRecorder(micStream);
    } catch {
      setStatus("Recording is not supported in this browser.", true);
      teardownMic();
      return;
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = async () => {
      stopRecording();
      teardownMic();
      const seconds = (performance.now() - recordStartedAt) / 1000;
      recordBtn.textContent = "Record";
      recordBtn.classList.remove("danger");
      if (!chunks.length) {
        setStatus("Nothing was recorded. Try again.", true);
        return;
      }
      if (seconds < MIN_DURATION_S) {
        setStatus(`Too short (${seconds.toFixed(1)} s). Read the whole sentence.`, true);
        return;
      }
      recordedBlob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
      saveBtn.disabled = false;
      setStatus(`Recorded ${seconds.toFixed(1)} s — listen to yourself and save if it sounds good.`);
    };

    recordStartedAt = performance.now();
    recorder.start();
    recordBtn.textContent = "Stop";
    recordBtn.classList.add("danger");
    setStatus("Recording… read the sentence, then press Stop.");
    tickTimer = window.setInterval(() => {
      const seconds = (performance.now() - recordStartedAt) / 1000;
      setStatus(`Recording… ${seconds.toFixed(0)} s`);
    }, 500);
    maxDurationTimer = window.setTimeout(() => {
      if (recorder && recorder.state === "recording") recorder.stop();
    }, MAX_DURATION_S * 1000);
  }

  recordBtn.addEventListener("click", () => {
    if (recorder && recorder.state === "recording") {
      recorder.stop(); // onstop does the cleanup
      return;
    }
    void startRecording();
  });

  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      setStatus("Give the voice a name first.", true);
      nameInput.focus();
      return;
    }
    if (!recordedBlob) {
      setStatus("Record yourself first.", true);
      return;
    }
    saveBtn.disabled = true;
    recordBtn.disabled = true;
    setStatus("Saving…");
    try {
      const wav = await blobToWav(recordedBlob);
      const query = `?name=${encodeURIComponent(name)}&transcript=${encodeURIComponent(CLONE_PROMPT_TEXT)}`;
      const res = await fetch(`/api/voices${query}`, { method: "POST", body: wav });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `HTTP ${res.status}`);
      }
      recordedBlob = null;
      nameInput.value = "";
      setStatus(`Saved “${name}”. Pick it in the Voice menu above.`);
      await refresh();
    } catch (err) {
      setStatus(`Could not save the voice: ${err instanceof Error ? err.message : err}`, true);
    } finally {
      saveBtn.disabled = !recordedBlob;
      recordBtn.disabled = false;
    }
  });

  return { refresh };
}

/** Decode any browser recording into a 24 kHz mono PCM16 WAV blob. */
async function blobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  // OfflineAudioContext.decodeAudioData avoids creating a real AudioContext
  // outside a user gesture (Safari refuses those).
  const decodeCtx = new OfflineAudioContext(1, 1, TARGET_RATE);
  const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return new Blob([encodeWavPcm16(rendered.getChannelData(0), TARGET_RATE)], { type: "audio/wav" });
}

/** Standard 44-byte-header RIFF/WAVE encoder, mono PCM16. */
function encodeWavPcm16(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}
