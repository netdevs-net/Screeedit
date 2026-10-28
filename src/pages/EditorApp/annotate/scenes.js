// Multi-scene projects: an ordered list of scenes (clips from recordings or
// imported videos, and title cards), each with its own layout (backdrop /
// device / padding), motion and transition. Neighboring scenes overlap by
// the transition's length; the "smooth" transition animates one scene's
// layout into the next.
//
// The same compositor draws the editor preview and the export.
import { defaultFrame, layoutFrame, outputSize, drawBackdrop, drawContent } from "./frame";

export const MAIN_SOURCE = "main";

export const TRANSITIONS = [
  { id: "cut", label: "Cut" },
  { id: "fade", label: "Fade" },
  { id: "smooth", label: "Smooth" },
  { id: "slide", label: "Slide" },
  { id: "wipe", label: "Wipe" },
  { id: "zoom", label: "Zoom" },
];

export const MOTIONS = [
  { id: "none", label: "None" },
  { id: "zoomIn", label: "Zoom in" },
  { id: "zoomOut", label: "Zoom out" },
  { id: "panLeft", label: "Pan left" },
  { id: "panRight", label: "Pan right" },
];

let idCounter = 0;
const newId = () => `sc_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

const defaultTransition = () => ({ type: "fade", duration: 0.6 });

// Layout used when a scene has no backdrop: the clip fills the frame.
const plainLayout = () => ({
  ...defaultFrame(),
  enabled: false,
  background: { type: "color", color: "#000000", gradient: "sky", image: null, blur: 0 },
  padding: 0,
  radius: 0,
  shadow: 0,
});

export const createClipScene = (source, inT, outT, width, height, name) => ({
  id: newId(),
  kind: "clip",
  name: name || "Clip",
  source,
  in: inT,
  out: outT,
  width,
  height,
  volume: 1,
  motion: "none",
  layout: plainLayout(),
  transition: defaultTransition(),
});

export const createTitleScene = (text = "Title") => ({
  id: newId(),
  kind: "title",
  name: "Title",
  duration: 3,
  title: { text, subtext: "", color: "#FFFFFF", font: "Satoshi-Bold", size: 0.09 },
  motion: "none",
  layout: { ...defaultFrame(), padding: 0, shadow: 0, background: { ...defaultFrame().background, gradient: "night" } },
  transition: defaultTransition(),
});

export const createProject = (width, height, duration) => ({
  version: 1,
  width,
  height,
  aspect: "original",
  fps: 30,
  scenes: [createClipScene(MAIN_SOURCE, 0, duration, width, height, "Recording")],
});

export const sceneDuration = (s) =>
  s.kind === "title" ? Math.max(0.2, s.duration) : Math.max(0.1, s.out - s.in);

// Transition length into scene i, limited so neighbours never overlap fully.
const transitionInto = (scenes, i) => {
  if (i === 0) return 0;
  const tr = scenes[i].transition || {};
  if (!tr.type || tr.type === "cut") return 0;
  return Math.max(0, Math.min(tr.duration || 0, sceneDuration(scenes[i - 1]) / 2, sceneDuration(scenes[i]) / 2));
};

// Places each scene on the output timeline.
export const buildTimeline = (project) => {
  const entries = [];
  let t = 0;
  project.scenes.forEach((scene, i) => {
    const trans = transitionInto(project.scenes, i);
    const start = i === 0 ? 0 : t - trans;
    const end = start + sceneDuration(scene);
    entries.push({ scene, index: i, start, end, trans });
    t = end;
  });
  return { entries, duration: t };
};

// The scene(s) visible at time t: { a, b, p } where b (and p, its transition
// progress 0..1) is set while a transition into b is running.
export const activeAt = (tl, t) => {
  const { entries } = tl;
  if (!entries.length) return null;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (t >= e.start) {
      if (i > 0 && e.trans > 0 && t < e.start + e.trans) {
        return { a: entries[i - 1], b: e, p: (t - e.start) / e.trans };
      }
      return { a: e, b: null, p: 0 };
    }
  }
  return { a: entries[0], b: null, p: 0 };
};

// Source time for an entry at output time t.
export const localTime = (entry, t) => {
  const lt = Math.max(0, Math.min(sceneDuration(entry.scene), t - entry.start));
  return entry.scene.kind === "clip" ? entry.scene.in + lt : lt;
};

export const effectiveFrame = (project, scene) => {
  const base = scene.layout?.enabled ? scene.layout : plainLayout();
  return { ...base, enabled: true, aspect: project.aspect };
};

export const projectSize = (project) =>
  outputSize({ ...defaultFrame(), aspect: project.aspect }, project.width, project.height);

export const sceneLayout = (project, scene) =>
  layoutFrame(
    effectiveFrame(project, scene),
    project.width,
    project.height,
    scene.kind === "clip" ? scene.width / scene.height : project.width / project.height,
  );

const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const lerp = (a, b, p) => a + (b - a) * p;
const lerpRect = (a, b, p) => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) });

// Geometry halfway between two layouts; device styling stays with `own`.
const blendLayout = (own, other, p) => ({
  ...own,
  content: lerpRect(own.content, other.content, p),
  contentRadii: own.contentRadii.map((r, i) => lerp(r, other.contentRadii[i], p)),
  device: own.device
    ? {
        ...own.device,
        ...lerpRect(own.device, other.device || own.content, p),
        radius: lerp(own.device.radius, other.device?.radius ?? other.contentRadii[0], p),
      }
    : null,
});

// Slow zoom / pan over the scene, as a crop of the source.
const motionCrop = (motion, progress, w, h) => {
  if (!motion || motion === "none") return null;
  const p = ease(Math.max(0, Math.min(1, progress)));
  const Z = 1.18;
  let s = 1;
  let fx = 0.5;
  if (motion === "zoomIn") s = lerp(1, Z, p);
  else if (motion === "zoomOut") s = lerp(Z, 1, p);
  else {
    s = Z;
    fx = motion === "panLeft" ? lerp(1, 0, p) : lerp(0, 1, p);
  }
  const cw = w / s;
  const ch = h / s;
  return { x: (w - cw) * fx, y: (h - ch) / 2, w: cw, h: ch };
};

const drawTitle = (ctx, scene, L) => {
  const { OW, OH } = L;
  const t = scene.title || {};
  const size = Math.round((t.size || 0.09) * Math.min(OW, OH));
  ctx.save();
  ctx.fillStyle = t.color || "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = size * 0.2;
  ctx.font = `${size}px "${t.font || "Satoshi-Bold"}", sans-serif`;
  const lines = String(t.text || "").split("\n");
  const sub = t.subtext ? String(t.subtext).split("\n") : [];
  const subSize = Math.round(size * 0.42);
  const total = lines.length * size * 1.15 + (sub.length ? subSize * 0.8 + sub.length * subSize * 1.3 : 0);
  let y = OH / 2 - total / 2 + size * 0.575;
  for (const line of lines) {
    ctx.fillText(line, OW / 2, y, OW * 0.9);
    y += size * 1.15;
  }
  if (sub.length) {
    y += subSize * 0.8 - size * 0.575 + subSize * 0.65;
    ctx.font = `${subSize}px "Satoshi-Medium", sans-serif`;
    ctx.globalAlpha = 0.85;
    for (const line of sub) {
      ctx.fillText(line, OW / 2, y, OW * 0.9);
      y += subSize * 1.3;
    }
  }
  ctx.restore();
};

// Draws one scene, full frame, into ctx.
const drawScene = (ctx, project, entry, t, L, frameSrc, images) => {
  const { scene } = entry;
  const frame = effectiveFrame(project, scene);
  const image = images?.get(frame.background?.image);
  if (scene.kind === "title") {
    drawBackdrop(ctx, frame, { ...L, device: null, content: { x: 0, y: 0, w: 0, h: 0 } }, { image });
    drawTitle(ctx, scene, L);
    return;
  }
  drawBackdrop(ctx, frame, L, { source: frameSrc, image });
  if (!frameSrc) {
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.roundRect(L.content.x, L.content.y, L.content.w, L.content.h, L.contentRadii);
    ctx.fill();
    return;
  }
  const sw = frameSrc.videoWidth || frameSrc.width;
  const sh = frameSrc.videoHeight || frameSrc.height;
  const crop = motionCrop(scene.motion, (t - entry.start) / sceneDuration(scene), sw, sh);
  drawContent(ctx, L, frameSrc, crop);
};

// Composes the project at output time t onto ctx (OW x OH).
//   getFrame(entry) -> the clip's current frame (video/canvas) or null
//   bufs: two scratch canvases of the output size
//   images: Map of loaded background images keyed by data URL
export const renderProjectFrame = (ctx, project, tl, t, getFrame, bufs, images) => {
  const { OW, OH } = projectSize(project);
  const act = activeAt(tl, t);
  ctx.clearRect(0, 0, OW, OH);
  if (!act) return;
  const La = sceneLayout(project, act.a.scene);
  if (!act.b) {
    drawScene(ctx, project, act.a, t, La, getFrame(act.a), images);
    return;
  }
  const { b } = act;
  const type = b.scene.transition?.type || "fade";
  const p = ease(act.p);
  const Lb = sceneLayout(project, b.scene);
  const [ca, cb] = bufs.map((c) => c.getContext("2d"));
  if (type === "smooth") {
    drawScene(ca, project, act.a, t, blendLayout(La, Lb, p), getFrame(act.a), images);
    drawScene(cb, project, b, t, blendLayout(Lb, La, 1 - p), getFrame(b), images);
  } else {
    drawScene(ca, project, act.a, t, La, getFrame(act.a), images);
    drawScene(cb, project, b, t, Lb, getFrame(b), images);
  }
  const [A, B] = bufs;
  ctx.save();
  if (type === "slide") {
    ctx.drawImage(A, -p * OW, 0);
    ctx.drawImage(B, (1 - p) * OW, 0);
  } else if (type === "wipe") {
    ctx.drawImage(A, 0, 0);
    ctx.beginPath();
    ctx.rect(0, 0, p * OW, OH);
    ctx.clip();
    ctx.drawImage(B, 0, 0);
  } else if (type === "zoom") {
    const sa = 1 + 0.25 * p;
    ctx.globalAlpha = 1;
    ctx.drawImage(A, (OW - OW * sa) / 2, (OH - OH * sa) / 2, OW * sa, OH * sa);
    const sb = 0.8 + 0.2 * p;
    ctx.globalAlpha = p;
    ctx.drawImage(B, (OW - OW * sb) / 2, (OH - OH * sb) / 2, OW * sb, OH * sb);
  } else {
    ctx.drawImage(A, 0, 0);
    ctx.globalAlpha = p;
    ctx.drawImage(B, 0, 0);
  }
  ctx.restore();
};

// Volume envelope for a clip: fades over the transitions at either end.
export const gainAt = (tl, entry, t) => {
  const next = tl.entries[entry.index + 1];
  let g = entry.scene.volume ?? 1;
  if (entry.trans > 0 && t < entry.start + entry.trans) g *= Math.max(0, (t - entry.start) / entry.trans);
  if (next && next.trans > 0 && t > next.start) g *= Math.max(0, 1 - (t - next.start) / next.trans);
  return g;
};

// Splits the scene at index i at output time t. Returns new scenes or null.
export const splitScene = (project, i, t) => {
  const tl = buildTimeline(project);
  const e = tl.entries[i];
  if (!e) return null;
  const at = t - e.start;
  if (at < 0.2 || at > sceneDuration(e.scene) - 0.2) return null;
  const s = e.scene;
  const left = s.kind === "clip" ? { ...s, out: s.in + at } : { ...s, duration: at };
  const right =
    s.kind === "clip"
      ? { ...s, id: newId(), in: s.in + at, transition: { type: "cut", duration: 0.6 } }
      : { ...s, id: newId(), duration: s.duration - at, transition: { type: "cut", duration: 0.6 } };
  const scenes = [...project.scenes];
  scenes.splice(i, 1, left, right);
  return scenes;
};

export const cloneScene = (s) => ({ ...JSON.parse(JSON.stringify(s)), id: newId() });
