// Speech-to-text for captions. Two providers:
//  - "browser": Whisper running locally in a worker (default, no server).
//  - "server":  any OpenAI-compatible /v1/audio/transcriptions endpoint that
//               returns word timestamps (e.g. faster-whisper / mlx-whisper).
// Both resolve to [{ text, start, end }] in seconds.

export const WHISPER_MODELS = [
  { id: "onnx-community/whisper-tiny_timestamped", label: "Fast (tiny)" },
  { id: "onnx-community/whisper-base_timestamped", label: "Balanced (base)" },
  { id: "onnx-community/whisper-small_timestamped", label: "Accurate (small, biggest download)" },
];
export const DEFAULT_MODEL = WHISPER_MODELS[1].id;

export const LANGUAGES = [
  { id: "auto", label: "Detect" },
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "it", label: "Italian" },
  { id: "pt", label: "Portuguese" },
  { id: "ja", label: "Japanese" },
  { id: "zh", label: "Chinese" },
];

const SAMPLE_RATE = 16000;

// Decodes the recording's audio to 16 kHz mono, which is what Whisper takes.
export const extractAudio = async (blob) => {
  const buf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(buf);
  } catch {
    throw new Error("This video has no audio track to caption.");
  } finally {
    ctx.close();
  }
  const length = Math.ceil(decoded.duration * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
};

const isSilent = (audio) => {
  let peak = 0;
  for (let i = 0; i < audio.length; i += 64) peak = Math.max(peak, Math.abs(audio[i]));
  return peak < 0.005;
};

let worker = null;
let nextId = 0;
const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL("./whisperWorker.js", import.meta.url), {
      type: "module",
    });
  }
  return worker;
};

const transcribeInBrowser = (audio, { model, language, onProgress }) =>
  new Promise((resolve, reject) => {
    const w = getWorker();
    const id = ++nextId;
    const onMessage = (e) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") onProgress?.(msg);
      else {
        w.removeEventListener("message", onMessage);
        w.removeEventListener("error", onError);
        if (msg.type === "done") resolve(msg.words);
        else reject(new Error(msg.message));
      }
    };
    const onError = (e) => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      worker = null;
      reject(new Error(e.message || "Speech recognition worker failed to start"));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    // Transfer a copy so the caller keeps its buffer.
    const copy = audio.slice();
    w.postMessage({ id, audio: copy, model, language }, [copy.buffer]);
  });

// 16-bit PCM WAV, the most widely accepted upload format.
const toWav = (audio) => {
  const buf = new ArrayBuffer(44 + audio.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + audio.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, audio.length * 2, true);
  for (let i = 0; i < audio.length; i++) {
    const s = Math.max(-1, Math.min(1, audio[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
};

const transcribeOnServer = async (audio, { serverUrl, language, onProgress }) => {
  const url = serverUrl.replace(/\/+$/, "");
  const endpoint = /\/audio\/transcriptions$/.test(url) ? url : `${url}/v1/audio/transcriptions`;
  const form = new FormData();
  form.append("file", toWav(audio), "audio.wav");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (language && language !== "auto") form.append("language", language);
  onProgress?.({ stage: "transcribe" });
  const res = await fetch(endpoint, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Whisper server answered ${res.status}`);
  const data = await res.json();
  // OpenAI shape is top-level `words`; some servers nest them in segments.
  const raw = data.words || (data.segments || []).flatMap((s) => s.words || []);
  if (!raw.length) throw new Error("The Whisper server returned no word timestamps.");
  return raw
    .map((w) => ({ text: String(w.word ?? w.text ?? "").trim(), start: +w.start, end: +w.end }))
    .filter((w) => w.text);
};

export const transcribe = async (blob, opts = {}) => {
  const { provider = "browser", onProgress } = opts;
  onProgress?.({ stage: "audio" });
  const audio = await extractAudio(blob);
  if (isSilent(audio)) throw new Error("No speech found: the audio track is silent.");
  const words =
    provider === "server"
      ? await transcribeOnServer(audio, opts)
      : await transcribeInBrowser(audio, { model: opts.model || DEFAULT_MODEL, ...opts });
  if (!words.length) throw new Error("No speech was recognized in this video.");
  return words;
};
