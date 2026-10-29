import {
  Input,
  Output,
  BlobSource,
  BufferTarget,
  Mp4OutputFormat,
  ALL_FORMATS,
  CanvasSink,
  CanvasSource,
  AudioBufferSource,
  getFirstEncodableVideoCodec,
  getFirstEncodableAudioCodec,
} from "mediabunny";
import {
  buildTimeline,
  activeAt,
  localTime,
  projectSize,
  renderProjectFrame,
  gainAt,
  sceneDuration,
} from "../../EditorApp/annotate/scenes";
import { loadFrameImage } from "../../EditorApp/annotate/frame";

const SAMPLE_RATE = 48000;

// Decodes a source's audio at the mix rate. Null when it has no audio.
const decodeAudio = async (blob) => {
  try {
    const ctx = new OfflineAudioContext(2, 1, SAMPLE_RATE);
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    return null;
  }
};

// Mixes every clip's audio onto the output timeline, crossfading over
// transitions. Returns null when no scene has sound.
const mixAudio = async (project, tl, sources) => {
  const buffers = new Map();
  for (const e of tl.entries) {
    const id = e.scene.source;
    if (e.scene.kind !== "clip" || buffers.has(id) || !sources[id]) continue;
    buffers.set(id, await decodeAudio(sources[id]));
  }
  if (![...buffers.values()].some(Boolean)) return null;
  const length = Math.max(1, Math.ceil(tl.duration * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);
  for (const e of tl.entries) {
    const buf = e.scene.kind === "clip" ? buffers.get(e.scene.source) : null;
    if (!buf || (e.scene.volume ?? 1) <= 0) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    // Sample the envelope finely enough for smooth fades.
    const steps = Math.max(2, Math.ceil(sceneDuration(e.scene) * 20));
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i++) curve[i] = gainAt(tl, e, e.start + (i / (steps - 1)) * sceneDuration(e.scene));
    gain.gain.setValueCurveAtTime(curve, e.start, sceneDuration(e.scene));
    src.connect(gain).connect(ctx.destination);
    src.start(e.start, e.scene.in, sceneDuration(e.scene));
  }
  return ctx.startRendering();
};

// Renders a multi-scene project to one MP4. `sources` maps source id -> Blob.
export default async function renderScenes(project, sources, onProgress = () => {}) {
  const tl = buildTimeline(project);
  const { OW, OH } = projectSize(project);
  const fps = project.fps || 30;
  const frames = Math.max(1, Math.round(tl.duration * fps));

  // One decoder per clip scene, advanced as the output plays through it.
  const tracks = new Map();
  for (const [id, blob] of Object.entries(sources)) {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    tracks.set(id, await input.getPrimaryVideoTrack());
  }
  const readers = new Map();
  const frameFor = async (entry, t) => {
    const { scene } = entry;
    if (scene.kind !== "clip") return null;
    let r = readers.get(entry.index);
    if (!r) {
      const track = tracks.get(scene.source);
      if (!track) return null;
      const it = new CanvasSink(track).canvases(scene.in, scene.out + 0.5);
      r = { it, cur: (await it.next()).value, next: (await it.next()).value };
      readers.set(entry.index, r);
    }
    const lt = localTime(entry, t);
    while (r.next && r.next.timestamp <= lt + 1e-4) {
      r.cur = r.next;
      r.next = (await r.it.next()).value;
    }
    return r.cur?.canvas || null;
  };
  const closeBefore = async (t) => {
    for (const [idx, r] of readers) {
      if (tl.entries[idx].end < t) {
        await r.it.return?.();
        readers.delete(idx);
      }
    }
  };

  const images = new Map();
  for (const s of project.scenes) {
    const src = s.layout?.background?.type === "image" ? s.layout.background.image : null;
    if (src && !images.has(src)) images.set(src, await loadFrameImage(s.layout));
  }

  const out = new OffscreenCanvas(OW, OH);
  const outCtx = out.getContext("2d");
  const bufs = [new OffscreenCanvas(OW, OH), new OffscreenCanvas(OW, OH)];

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const videoCodec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: OW, height: OH });
  if (!videoCodec) throw new Error("Rendering scenes failed - no video encoder available");
  const video = new CanvasSource(out, { codec: videoCodec, bitrate: 6_000_000 });
  output.addVideoTrack(video, { frameRate: fps });

  const mixed = await mixAudio(project, tl, sources);
  let audio = null;
  if (mixed) {
    const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], {
      numberOfChannels: 2,
      sampleRate: SAMPLE_RATE,
    });
    if (audioCodec) {
      audio = new AudioBufferSource({ codec: audioCodec, bitrate: 160_000 });
      output.addAudioTrack(audio);
    }
  }

  await output.start();
  if (audio) {
    await audio.add(mixed);
    audio.close();
  }

  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const act = activeAt(tl, t);
    const current = new Map();
    for (const e of [act?.a, act?.b]) if (e) current.set(e.index, await frameFor(e, t));
    renderProjectFrame(outCtx, project, tl, t, (e) => current.get(e.index) || null, bufs, images);
    await video.add(t, 1 / fps);
    if (i % 15 === 0) {
      await closeBefore(t);
      onProgress(i / frames);
    }
  }
  video.close();
  await output.finalize();
  onProgress(1);

  if (!target.buffer) throw new Error("Rendering scenes failed - no output buffer");
  return new Blob([target.buffer], { type: "video/mp4" });
}
