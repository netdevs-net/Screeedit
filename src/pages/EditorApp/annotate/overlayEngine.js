// Timeline overlay engine shared by the editor preview and the burn-in export,
// so what you see while editing is exactly what gets rendered into the video.
//
// A doc is { version, width, height, items[] }. Each item is one overlay with a
// time range, animation settings and its fabric object serialized in `obj`.
// Items of kind "blur", "focus" and "zoom" are effects: their fabric object is
// only an editing handle, and the effect is applied to the video frame itself.
import { util, CUSTOM_PROPS } from "./fabricKit";
import { findShape } from "./shapes";

export const DOC_VERSION = 1;
export const EFFECT_KINDS = new Set(["blur", "focus", "zoom"]);

export const ANIM_IN = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
  { id: "rise", label: "Rise" },
  { id: "drop", label: "Drop" },
  { id: "scale", label: "Scale" },
  { id: "zoom", label: "Zoom" },
  { id: "spin", label: "Spin" },
  { id: "typewriter", label: "Typewriter", textOnly: true },
  { id: "scramble", label: "Scramble", textOnly: true },
];
// Out animations mirror the in set.
export const ANIM_OUT = ANIM_IN;
export const ANIM_LOOP = [
  { id: "none", label: "None" },
  { id: "pulse", label: "Pulse" },
  { id: "float", label: "Float" },
  { id: "shake", label: "Shake" },
  { id: "wiggle", label: "Wiggle" },
  { id: "spin", label: "Spin" },
  { id: "blink", label: "Blink" },
];
export const EASINGS = [
  { id: "linear", label: "Linear" },
  { id: "easeIn", label: "Ease in" },
  { id: "easeOut", label: "Ease out" },
  { id: "easeInOut", label: "Ease in-out" },
  { id: "back", label: "Overshoot" },
  { id: "bounce", label: "Bounce" },
];

const EASE = {
  linear: (p) => p,
  easeIn: (p) => p * p * p,
  easeOut: (p) => 1 - Math.pow(1 - p, 3),
  easeInOut: (p) =>
    p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  back: (p) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  },
  bounce: (p) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (p < 1 / d1) return n1 * p * p;
    if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
    if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
    return n1 * (p -= 2.625 / d1) * p + 0.984375;
  },
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

let idCounter = 0;
export const newId = () =>
  `ov_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

export const createDoc = (width, height) => ({
  version: DOC_VERSION,
  width,
  height,
  items: [],
});

export const defaultAnim = () => ({
  in: { type: "fade", duration: 0.4, easing: "easeOut" },
  out: { type: "fade", duration: 0.4, easing: "easeIn" },
  loop: { type: "none", speed: 1 },
});

export const createItem = (kind, obj, { start, end, name, ...extra } = {}) => {
  const id = newId();
  obj.set({ seId: id, seKind: kind });
  return {
    id,
    kind,
    name: name || kind,
    start,
    end,
    anim: EFFECT_KINDS.has(kind)
      ? {
          in: { type: kind === "zoom" ? "zoom" : "fade", duration: 0.6, easing: "easeInOut" },
          out: { type: kind === "zoom" ? "zoom" : "fade", duration: 0.6, easing: "easeInOut" },
          loop: { type: "none", speed: 1 },
        }
      : defaultAnim(),
    text:
      kind === "text"
        ? { mode: "normal", counterFrom: 0, counterTo: 100, decimals: 0, prefix: "", suffix: "" }
        : undefined,
    effect:
      kind === "blur"
        ? { amount: 18 }
        : kind === "focus"
        ? { dim: 0.6 }
        : undefined,
    ...extra,
    obj: serializeObject(obj),
  };
};

export const serializeObject = (obj) => obj.toObject(CUSTOM_PROPS);

// The resting pose of an object, which animations are applied relative to.
export const baseOf = (json) => ({
  left: json.left,
  top: json.top,
  scaleX: json.scaleX ?? 1,
  scaleY: json.scaleY ?? 1,
  angle: json.angle ?? 0,
  opacity: json.opacity ?? 1,
  text: json.text,
  width: json.width,
  height: json.height,
});

const SCRAMBLE_GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*@";
const scramble = (text, revealed, t) => {
  let out = "";
  const seed = Math.floor(t * 30);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (i < revealed || ch === " " || ch === "\n") out += ch;
    else out += SCRAMBLE_GLYPHS[(i * 31 + seed * 17) % SCRAMBLE_GLYPHS.length];
  }
  return out;
};

const formatCounter = (cfg, value) => {
  const decimals = Math.max(0, Math.min(4, Number(cfg.decimals) || 0));
  const n = Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${cfg.prefix || ""}${n}${cfg.suffix || ""}`;
};

// Pure: the visual state of `item` at time t (seconds). W/H are canvas size.
export const computeState = (item, t, W, H, { animate = true } = {}) => {
  const visible = t >= item.start && t < item.end;
  const state = {
    visible,
    opacity: 1,
    dx: 0,
    dy: 0,
    scale: 1,
    angle: 0,
    reveal: 1, // typewriter/scramble fraction of text shown
    revealMode: null,
    progress: 1, // 0..1 through the whole item, for progress bars/counters
    phase: 1, // effect strength (zoom/blur/focus ramp)
  };
  if (!visible) return state;
  const span = Math.max(0.001, item.end - item.start);
  state.progress = clamp01((t - item.start) / span);
  if (!animate) return state;

  const dist = W * 0.08;
  const apply = (type, p, dir) => {
    // p: 0 = fully hidden, 1 = at rest
    const q = 1 - p;
    switch (type) {
      case "fade":
        state.opacity *= p;
        break;
      case "slide":
        state.dx += -dist * q * dir;
        state.opacity *= p;
        break;
      case "rise":
        state.dy += dist * q;
        state.opacity *= p;
        break;
      case "drop":
        state.dy += -dist * q;
        state.opacity *= p;
        break;
      case "scale":
        state.scale *= 0.5 + 0.5 * p;
        state.opacity *= p;
        break;
      case "zoom":
        state.scale *= 1 + 0.6 * q;
        state.opacity *= p;
        break;
      case "spin":
        state.angle += -180 * q * dir;
        state.scale *= 0.4 + 0.6 * p;
        state.opacity *= p;
        break;
      case "typewriter":
      case "scramble":
        state.reveal = Math.min(state.reveal, p);
        state.revealMode = type;
        break;
      default:
        break;
    }
  };

  const ain = item.anim?.in || {};
  const aout = item.anim?.out || {};
  const inDur = Math.min(ain.duration || 0, span / 2);
  const outDur = Math.min(aout.duration || 0, span / 2);
  const local = t - item.start;
  const remaining = item.end - t;
  let phase = 1;
  if (ain.type && ain.type !== "none" && inDur > 0 && local < inDur) {
    const p = (EASE[ain.easing] || EASE.easeOut)(clamp01(local / inDur));
    phase = Math.min(phase, p);
    apply(ain.type, p, 1);
  }
  if (aout.type && aout.type !== "none" && outDur > 0 && remaining < outDur) {
    const p = (EASE[aout.easing] || EASE.easeIn)(clamp01(remaining / outDur));
    phase = Math.min(phase, p);
    apply(aout.type, p, -1);
  }
  state.phase = phase;

  const loop = item.anim?.loop || {};
  const sp = Math.max(0.1, Number(loop.speed) || 1);
  const w = local * sp * Math.PI * 2;
  switch (loop.type) {
    case "pulse":
      state.scale *= 1 + 0.06 * Math.sin(w);
      break;
    case "float":
      state.dy += Math.sin(w * 0.5) * H * 0.012;
      break;
    case "shake":
      state.dx += Math.sin(w * 6) * W * 0.004;
      break;
    case "wiggle":
      state.angle += Math.sin(w * 2) * 6;
      break;
    case "spin":
      state.angle += (local * sp * 360) % 360;
      break;
    case "blink":
      state.opacity *= Math.sin(w) > -0.3 ? 1 : 0.15;
      break;
    default:
      break;
  }
  return state;
};

// Applies a computed state onto a live fabric object, relative to its base.
export const applyState = (obj, item, base, state, t, W, H) => {
  const isEffect = EFFECT_KINDS.has(item.kind);
  obj.visible = state.visible;
  if (!state.visible) return;
  // Effect handles mark a region; their animation ramps the effect strength
  // (state.phase), never the region itself.
  if (isEffect) {
    applyBase(obj, base);
    return;
  }
  const props = {
    left: base.left + state.dx,
    top: base.top + state.dy,
    scaleX: base.scaleX * state.scale,
    scaleY: base.scaleY * state.scale,
    angle: base.angle + state.angle,
    opacity: isEffect ? base.opacity : base.opacity * state.opacity,
  };

  if (item.kind === "shape" && item.progress) {
    // Progress bars grow from their left edge across the item's time range.
    const p = Math.max(0.0001, state.progress);
    const fullW = (base.width || 0) * base.scaleX;
    props.scaleX = base.scaleX * p;
    props.left = base.left - (fullW * (1 - p)) / 2;
  }

  if (item.kind === "text" && typeof base.text === "string") {
    let text = base.text;
    const cfg = item.text || {};
    if (cfg.mode === "counter") {
      const from = Number(cfg.counterFrom) || 0;
      const to = Number(cfg.counterTo) || 0;
      text = formatCounter(cfg, from + (to - from) * EASE.easeOut(state.progress));
    }
    if (state.revealMode && state.reveal < 1) {
      const n = Math.floor(text.length * state.reveal);
      text =
        state.revealMode === "typewriter"
          ? text.slice(0, n)
          : scramble(text, n, t);
    }
    if (cfg.mode === "scroll") {
      // Credits-style: travel from below the frame to above it.
      const h = (obj.height || 0) * props.scaleY;
      props.top = H / 2 + (1 - 2 * state.progress) * (H / 2 + h / 2);
    }
    if (obj.text !== text) props.text = text;
  }
  obj.set(props);
};

// Restores an object to its resting pose (used when the editor pauses).
export const applyBase = (obj, base) => {
  const props = {
    left: base.left,
    top: base.top,
    scaleX: base.scaleX,
    scaleY: base.scaleY,
    angle: base.angle,
    opacity: base.opacity,
  };
  if (typeof base.text === "string" && obj.text !== base.text) props.text = base.text;
  obj.set(props);
};

// Rebuilds fabric objects for every item in the doc. Returns Map id -> obj.
export const enlivenDoc = async (doc) => {
  const objs = await util.enlivenObjects(doc.items.map((i) => i.obj));
  const map = new Map();
  doc.items.forEach((item, idx) => {
    const obj = objs[idx];
    if (!obj) return;
    obj.set({ seId: item.id, seKind: item.kind });
    map.set(item.id, obj);
  });
  return map;
};

// Absolute, axis-aligned rect of an effect handle in canvas coordinates.
const effectRect = (obj) => {
  const r = obj.getBoundingRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

// Draws the video frame from `source` into ctx (W x H) with zoom, blur and
// focus effects applied. Overlay objects are drawn on top separately.
export const drawFrameWithEffects = (ctx, source, doc, objs, t, W, H) => {
  const active = [];
  for (const item of doc.items) {
    if (!EFFECT_KINDS.has(item.kind)) continue;
    const obj = objs.get(item.id);
    if (!obj) continue;
    const st = computeState(item, t, W, H);
    if (!st.visible) continue;
    active.push({ item, obj, st });
  }

  // Zoom: interpolate the source crop from the full frame to the region.
  let crop = { x: 0, y: 0, w: W, h: H };
  const zoom = active.find((a) => a.item.kind === "zoom");
  if (zoom) {
    const r = effectRect(zoom.obj);
    // Keep the output aspect ratio so the zoom doesn't stretch.
    const aspect = W / H;
    let zw = Math.max(16, r.w);
    let zh = Math.max(16, r.h);
    if (zw / zh > aspect) zh = zw / aspect;
    else zw = zh * aspect;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    let zx = Math.min(Math.max(0, cx - zw / 2), Math.max(0, W - zw));
    let zy = Math.min(Math.max(0, cy - zh / 2), Math.max(0, H - zh));
    zw = Math.min(zw, W);
    zh = Math.min(zh, H);
    const p = zoom.st.phase;
    crop = {
      x: zx * p,
      y: zy * p,
      w: W + (zw - W) * p,
      h: H + (zh - H) * p,
    };
  }
  const sw = source.videoWidth || source.width;
  const sh = source.videoHeight || source.height;
  const sx = (crop.x / W) * sw;
  const sy = (crop.y / H) * sh;
  const sWidth = (crop.w / W) * sw;
  const sHeight = (crop.h / H) * sh;
  ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, W, H);

  for (const { item, obj, st } of active) {
    if (item.kind === "blur") {
      const r = effectRect(obj);
      const amount = (item.effect?.amount ?? 18) * st.phase;
      if (amount <= 0.5) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.filter = `blur(${amount}px)`;
      ctx.drawImage(ctx.canvas, 0, 0, W, H);
      ctx.restore();
    } else if (item.kind === "focus") {
      const r = effectRect(obj);
      const dim = (item.effect?.dim ?? 0.6) * st.phase;
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${dim})`;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      const rad = Math.min(r.w, r.h) * 0.08;
      ctx.roundRect(r.x, r.y, r.w, r.h, rad);
      ctx.fill("evenodd");
      ctx.restore();
    }
  }
};

// Applies time t to every overlay object on a fabric canvas.
export const applyTimeToObjects = (doc, objs, bases, t, W, H, { animate = true, hideEffects = true } = {}) => {
  for (const item of doc.items) {
    const obj = objs.get(item.id);
    if (!obj) continue;
    const base = bases.get(item.id) || baseOf(item.obj);
    const st = computeState(item, t, W, H, { animate });
    applyState(obj, item, base, st, t, W, H);
    if (EFFECT_KINDS.has(item.kind) && hideEffects) obj.visible = false;
  }
};

export const isProgressShape = (shapeId) => Boolean(findShape(shapeId)?.progress);
