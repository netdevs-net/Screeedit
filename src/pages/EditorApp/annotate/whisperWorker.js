// Runs Whisper (transformers.js + onnxruntime-web) off the main thread so the
// editor stays responsive while captions are generated.
//
// The model is downloaded from Hugging Face on first use and cached by the
// browser; after that transcription works offline. The ONNX runtime's own
// .mjs/.wasm files are shipped inside the extension (vendor/ort), because an
// extension page may only run scripts it bundles.
import { pipeline, env } from "@huggingface/transformers";

const ORT_BASE = new URL("/vendor/ort/", self.location.href).href;
env.allowLocalModels = false;
env.useBrowserCache = true;
// The wasm cache turns the runtime into a blob: URL, which the extension CSP
// refuses to import.
env.useWasmCache = false;
env.backends.onnx.wasm.wasmPaths = {
  mjs: `${ORT_BASE}ort-wasm-simd-threaded.asyncify.mjs`,
  wasm: `${ORT_BASE}ort-wasm-simd-threaded.asyncify.wasm`,
};
// Extension pages aren't cross-origin isolated, so no SharedArrayBuffer threads.
env.backends.onnx.wasm.numThreads = 1;

const pipes = new Map();

const hasWebGPU = async () => {
  try {
    return Boolean(await navigator.gpu?.requestAdapter());
  } catch {
    return false;
  }
};

const load = async (model, onProgress) => {
  const key = model;
  if (pipes.has(key)) return pipes.get(key);
  const files = new Map();
  const progress_callback = (p) => {
    if (p.status === "progress" && p.total) {
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      onProgress({ stage: "download", loaded, total });
    }
  };
  let pipe = null;
  if (await hasWebGPU()) {
    try {
      pipe = await pipeline("automatic-speech-recognition", model, {
        device: "webgpu",
        dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
        progress_callback,
      });
    } catch (err) {
      console.warn("[captions] WebGPU unavailable, falling back to wasm", err);
    }
  }
  if (!pipe) {
    pipe = await pipeline("automatic-speech-recognition", model, {
      device: "wasm",
      dtype: "q8",
      progress_callback,
    });
  }
  pipes.set(key, pipe);
  return pipe;
};

self.onmessage = async (e) => {
  const { id, audio, model, language } = e.data;
  const post = (msg) => self.postMessage({ id, ...msg });
  try {
    const pipe = await load(model, (p) => post({ type: "progress", ...p }));
    post({ type: "progress", stage: "transcribe" });
    const english = /\.en(_|$)/.test(model);
    const out = await pipe(audio, {
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(english || !language || language === "auto"
        ? {}
        : { language, task: "transcribe" }),
    });
    const words = (out.chunks || [])
      .map((c) => ({
        text: (c.text || "").trim(),
        start: c.timestamp?.[0] ?? 0,
        end: c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0,
      }))
      .filter((w) => w.text);
    post({ type: "done", words, text: out.text });
  } catch (err) {
    post({ type: "error", message: err?.message || String(err) });
  }
};
