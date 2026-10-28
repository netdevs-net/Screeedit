// Backdrops and device mockups. Stored on the overlay doc as `doc.frame`.
// The finished video (with its overlays and captions) is placed inside a
// padded background, optionally wrapped in a device, at a chosen aspect ratio.
// The editor preview and the burn-in export share this layout and renderer.

export const ASPECTS = [
  { id: "original", label: "Original" },
  { id: "16:9", label: "16:9", r: 16 / 9 },
  { id: "9:16", label: "9:16", r: 9 / 16 },
  { id: "1:1", label: "1:1", r: 1 },
  { id: "4:5", label: "4:5", r: 4 / 5 },
];

export const GRADIENTS = [
  { id: "sky", stops: ["#3080F8", "#8FC1FF"] },
  { id: "sunset", stops: ["#FF7E5F", "#FEB47B"] },
  { id: "grape", stops: ["#8E2DE2", "#4A00E0"] },
  { id: "ocean", stops: ["#2E3192", "#1BFFFF"] },
  { id: "mint", stops: ["#00B09B", "#96C93D"] },
  { id: "peach", stops: ["#FFDDE1", "#EE9CA7"] },
  { id: "night", stops: ["#0F2027", "#2C5364"] },
  { id: "cloud", stops: ["#F5F7FA", "#C3CFE2"] },
];

export const SOLIDS = ["#FFFFFF", "#F3F4F6", "#29292F", "#000000", "#FFD84D", "#3080F8", "#FF3B5C", "#2ECC71"];

export const DEVICES = [
  { id: "none", label: "None" },
  { id: "browser", label: "Browser" },
  { id: "window", label: "Window" },
  { id: "macbook", label: "MacBook" },
  { id: "ipad", label: "iPad" },
  { id: "iphone", label: "iPhone" },
];

export const defaultFrame = () => ({
  enabled: true,
  aspect: "original",
  background: { type: "gradient", gradient: "sky", color: "#29292F", image: null, blur: 0 },
  padding: 0.08, // fraction of the output's short side
  radius: 0.02, // corner radius, fraction of the output's short side
  shadow: 0.6,
  device: "none",
  theme: "light", // device chrome color scheme
});

export const hasFrame = (frame) => Boolean(frame?.enabled);

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

// Output dimensions: the video's own size for "original", otherwise the
// chosen ratio with the same long side as the video.
export const outputSize = (frame, W, H) => {
  const a = ASPECTS.find((x) => x.id === frame?.aspect);
  if (!hasFrame(frame) || !a?.r) return { OW: even(W), OH: even(H) };
  const long = Math.max(W, H);
  return a.r >= 1 ? { OW: even(long), OH: even(long / a.r) } : { OW: even(long * a.r), OH: even(long) };
};

// Device chrome thickness around the screen, in units of u (1% of short side).
const CHROME = {
  none: { t: 0, r: 0, b: 0, l: 0 },
  browser: { t: 5.2, r: 0, b: 0, l: 0 },
  window: { t: 3.6, r: 0, b: 0, l: 0 },
  macbook: { t: 2.4, r: 1.8, b: 2.6, l: 1.8, base: 2.4, baseOver: 0.07 },
  ipad: { t: 2.6, r: 2.6, b: 2.6, l: 2.6 },
  iphone: { t: 1.8, r: 1.8, b: 1.8, l: 1.8 },
};

// Computes where everything goes for a W x H video. All values in output px.
// `contentAspect` overrides the screen's aspect ratio (for a clip whose size
// differs from the project's).
export const layoutFrame = (frame, W, H, contentAspect) => {
  const { OW, OH } = outputSize(frame, W, H);
  if (!hasFrame(frame)) {
    return { OW, OH, content: { x: 0, y: 0, w: OW, h: OH }, contentRadii: [0, 0, 0, 0], device: null, u: 0 };
  }
  const u = Math.min(OW, OH) / 100;
  const c = CHROME[frame.device] || CHROME.none;
  const pad = frame.padding * Math.min(OW, OH);
  const aspect = contentAspect || W / H;
  const over = 1 + 2 * (c.baseOver || 0);
  const chromeW = (c.l + c.r) * u;
  const chromeH = (c.t + c.b + (c.base || 0)) * u;
  const availW = Math.max(16, (OW - 2 * pad) / over - chromeW);
  const availH = Math.max(16, OH - 2 * pad - chromeH);
  let cw = availW;
  let ch = cw / aspect;
  if (ch > availH) {
    ch = availH;
    cw = ch * aspect;
  }
  const dw = cw + chromeW;
  const dh = ch + (c.t + c.b) * u;
  const totalH = dh + (c.base || 0) * u;
  const dx = (OW - dw) / 2;
  const dy = (OH - totalH) / 2;
  const device = { x: dx, y: dy, w: dw, h: dh };
  const content = { x: dx + c.l * u, y: dy + c.t * u, w: cw, h: ch };

  // Corner radii of the screen: [top-left, top-right, bottom-right, bottom-left].
  const r = frame.radius * Math.min(OW, OH);
  let contentRadii = [r, r, r, r];
  let deviceRadius = r;
  if (frame.device === "browser" || frame.device === "window") {
    deviceRadius = Math.max(r, 1.2 * u);
    contentRadii = [0, 0, deviceRadius, deviceRadius];
  } else if (frame.device === "macbook") {
    deviceRadius = 2 * u;
    contentRadii = [0.4 * u, 0.4 * u, 0.4 * u, 0.4 * u];
  } else if (frame.device === "ipad") {
    deviceRadius = 4 * u;
    contentRadii = Array(4).fill(1.6 * u);
  } else if (frame.device === "iphone") {
    deviceRadius = Math.min(dw, dh) * 0.14;
    contentRadii = Array(4).fill(Math.max(0, deviceRadius - c.l * u));
  }
  return { OW, OH, u, content, contentRadii, device: { ...device, radius: deviceRadius, kind: frame.device, chrome: c } };
};

const gradientFill = (ctx, frame, OW, OH) => {
  const g = GRADIENTS.find((x) => x.id === frame.background.gradient) || GRADIENTS[0];
  const grad = ctx.createLinearGradient(0, 0, OW, OH);
  g.stops.forEach((s, i) => grad.addColorStop(i / (g.stops.length - 1), s));
  return grad;
};

// Draws `img` to cover the whole OW x OH canvas.
const drawCover = (ctx, img, OW, OH) => {
  const iw = img.videoWidth || img.naturalWidth || img.width;
  const ih = img.videoHeight || img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(OW / iw, OH / ih);
  const w = iw * s;
  const h = ih * s;
  ctx.drawImage(img, (OW - w) / 2, (OH - h) / 2, w, h);
};

const images = new Map();
// Loads (and caches) the background image so drawing stays synchronous.
export const loadFrameImage = (frame) => {
  const src = frame?.background?.type === "image" ? frame.background.image : null;
  if (!src) return Promise.resolve(null);
  if (images.has(src)) return images.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  images.set(src, p);
  return p;
};

const DARK = { body: "#1F1F24", bar: "#2B2B31", pill: "#3A3A42", text: "#9A9AA5", edge: "#0E0E11" };
const LIGHT = { body: "#FFFFFF", bar: "#F1F2F4", pill: "#FFFFFF", text: "#8A8F98", edge: "#D9DCE1" };

// Background, drop shadow and device chrome. The screen area itself is left
// for the caller to fill with the video.
// `source` is the current video frame (for the blurred-video background) and
// `image` the loaded background image.
export const drawBackdrop = (ctx, frame, L, { source, image } = {}) => {
  const { OW, OH, u, device, content } = L;
  const bg = frame.background || {};
  ctx.save();
  ctx.clearRect(0, 0, OW, OH);
  if (bg.type === "color") {
    ctx.fillStyle = bg.color || "#000";
    ctx.fillRect(0, 0, OW, OH);
  } else if ((bg.type === "image" && image) || (bg.type === "video" && source)) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, OW, OH);
    const blur = bg.type === "video" ? Math.max(bg.blur || 0, 24) : bg.blur || 0;
    if (blur > 0) {
      ctx.filter = `blur(${(blur * Math.min(OW, OH)) / 720}px)`;
      // Overscan so blurred edges don't fade to the fill color.
      ctx.translate(OW / 2, OH / 2);
      ctx.scale(1.08, 1.08);
      ctx.translate(-OW / 2, -OH / 2);
    }
    drawCover(ctx, bg.type === "image" ? image : source, OW, OH);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = "none";
    if (bg.type === "video") {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, 0, OW, OH);
    }
  } else {
    ctx.fillStyle = gradientFill(ctx, frame, OW, OH);
    ctx.fillRect(0, 0, OW, OH);
  }
  ctx.restore();

  const theme = frame.theme === "dark" ? DARK : LIGHT;
  const kind = device?.kind || "none";
  const body = kind === "none" ? { ...content, radius: L.contentRadii[0] } : device;

  // Shadow under the device (or the bare video).
  if (frame.shadow > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${0.5 * frame.shadow})`;
    ctx.shadowBlur = 5 * u * frame.shadow + 2;
    ctx.shadowOffsetY = 1.6 * u * frame.shadow;
    ctx.fillStyle = kind === "none" ? "#000" : kind === "browser" || kind === "window" ? theme.body : "#111114";
    ctx.beginPath();
    ctx.roundRect(body.x, body.y, body.w, body.h, body.radius);
    ctx.fill();
    ctx.restore();
  }
  if (kind === "none") return;

  ctx.save();
  if (kind === "browser" || kind === "window") {
    ctx.fillStyle = theme.bar;
    ctx.beginPath();
    ctx.roundRect(device.x, device.y, device.w, device.h, device.radius);
    ctx.fill();
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = Math.max(1, 0.12 * u);
    ctx.stroke();
    const barH = device.chrome.t * u;
    const cy = device.y + barH / 2;
    const dot = 0.6 * u;
    ["#FF5F57", "#FEBC2E", "#28C840"].forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(device.x + 2.2 * u + i * 2 * u, cy, dot, 0, Math.PI * 2);
      ctx.fill();
    });
    if (kind === "browser") {
      const pw = Math.min(device.w * 0.5, 60 * u);
      const ph = barH * 0.56;
      ctx.fillStyle = theme.pill;
      ctx.beginPath();
      ctx.roundRect(device.x + (device.w - pw) / 2, cy - ph / 2, pw, ph, ph / 2);
      ctx.fill();
      ctx.strokeStyle = theme.edge;
      ctx.stroke();
      ctx.fillStyle = theme.text;
      ctx.font = `${Math.round(ph * 0.5)}px "Satoshi-Medium", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(frame.url || "screeedit.app", device.x + device.w / 2, cy + 0.05 * u);
    }
  } else {
    // Hardware: dark bezel with a subtle rim.
    ctx.fillStyle = "#0B0B0D";
    ctx.beginPath();
    ctx.roundRect(device.x, device.y, device.w, device.h, device.radius);
    ctx.fill();
    ctx.strokeStyle = frame.theme === "dark" ? "#3A3A40" : "#C9CCD2";
    ctx.lineWidth = Math.max(1, 0.35 * u);
    ctx.stroke();
    if (kind === "macbook") {
      // Camera dot and the keyboard base.
      ctx.fillStyle = "#26262B";
      ctx.beginPath();
      ctx.arc(device.x + device.w / 2, device.y + device.chrome.t * u * 0.5, 0.35 * u, 0, Math.PI * 2);
      ctx.fill();
      const over = device.w * device.chrome.baseOver;
      const by = device.y + device.h;
      const bh = device.chrome.base * u;
      const grad = ctx.createLinearGradient(0, by, 0, by + bh);
      grad.addColorStop(0, frame.theme === "dark" ? "#4A4A50" : "#E3E5E8");
      grad.addColorStop(1, frame.theme === "dark" ? "#2A2A2F" : "#AEB2B8");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(device.x - over * 0.6, by);
      ctx.lineTo(device.x + device.w + over * 0.6, by);
      ctx.lineTo(device.x + device.w + over, by + bh * 0.7);
      ctx.quadraticCurveTo(device.x + device.w + over, by + bh, device.x + device.w + over - bh, by + bh);
      ctx.lineTo(device.x - over + bh, by + bh);
      ctx.quadraticCurveTo(device.x - over, by + bh, device.x - over, by + bh * 0.7);
      ctx.closePath();
      ctx.fill();
      // Thumb notch.
      ctx.fillStyle = frame.theme === "dark" ? "#1E1E22" : "#9EA2A8";
      const nw = device.w * 0.14;
      ctx.beginPath();
      ctx.roundRect(device.x + (device.w - nw) / 2, by, nw, bh * 0.28, [0, 0, bh * 0.2, bh * 0.2]);
      ctx.fill();
    }
  }
  ctx.restore();
};

// Draws the composed video frame into the screen area, clipped to its corners.
// `crop` ({x, y, w, h} in source pixels) draws only part of the source.
export const drawContent = (ctx, L, source, crop) => {
  const { content, contentRadii } = L;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(content.x, content.y, content.w, content.h, contentRadii);
  ctx.clip();
  if (crop) ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, content.x, content.y, content.w, content.h);
  else ctx.drawImage(source, content.x, content.y, content.w, content.h);
  ctx.restore();
};
