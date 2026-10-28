// Word-by-word captions. Stored on the overlay doc as `doc.captions`:
//   { words: [{ text, start, end }], style: {...}, offset }
// and drawn straight onto the video frame with a 2D context, so the editor
// preview and the burn-in export share this one renderer.

export const CAPTION_STYLES = [
  { id: "karaoke", label: "Karaoke", hint: "Spoken words light up" },
  { id: "box", label: "Highlight box", hint: "Box behind the current word" },
  { id: "pop", label: "Pop in", hint: "Words appear as they're said" },
  { id: "single", label: "One word", hint: "Only the current word, big" },
  { id: "classic", label: "Classic", hint: "Plain subtitles" },
];

export const CAPTION_FONTS = [
  "Satoshi-Bold",
  "Satoshi-Medium",
  "Arial",
  "Georgia",
  "Courier New",
  "Impact",
];

export const defaultCaptionStyle = () => ({
  preset: "karaoke",
  fontFamily: "Satoshi-Bold",
  size: 0.055, // fraction of frame height
  color: "#FFFFFF",
  highlight: "#FFD84D",
  outline: "#000000",
  outlineWidth: 0.12, // fraction of font size
  background: false,
  backgroundColor: "#000000",
  backgroundOpacity: 0.55,
  uppercase: false,
  position: 0.84, // vertical centre of the block, fraction of frame height
  maxWords: 4,
});

export const createCaptions = (words) => ({
  words,
  style: defaultCaptionStyle(),
  offset: 0,
});

export const hasCaptions = (captions) => Boolean(captions?.words?.length);

const GAP_BREAK_S = 0.7;
const HOLD_S = 0.35; // keep a line up briefly after its last word
const ENDS_SENTENCE = /[.!?…]["')\]]?$/;

// Groups words into on-screen lines: at most maxWords, breaking early at a
// pause or the end of a sentence. Each chunk is {start, end, from, to}.
export const buildChunks = (words, maxWords = 4) => {
  const chunks = [];
  let cur = null;
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const breakHere =
      !cur ||
      cur.to - cur.from + 1 >= maxWords ||
      (prev && w.start - prev.end > GAP_BREAK_S) ||
      (prev && ENDS_SENTENCE.test(prev.text.trim()));
    if (breakHere) {
      cur = { from: i, to: i, start: w.start, end: w.end };
      chunks.push(cur);
    } else {
      cur.to = i;
      cur.end = w.end;
    }
  });
  // Hold each line until the next starts (or briefly), so it doesn't flicker.
  chunks.forEach((c, i) => {
    const next = chunks[i + 1];
    c.end = next ? Math.min(next.start, c.end + HOLD_S) : c.end + HOLD_S;
  });
  return chunks;
};

const easeOutBack = (p) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

const hexToRgba = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// Picks black or white text for legibility on a highlight color.
const contrastOn = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#000000";
  const n = parseInt(m[1], 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? "#111111" : "#FFFFFF";
};

// Lays out words into centred lines that fit maxWidth.
const layoutLines = (ctx, tokens, maxWidth, space) => {
  const lines = [];
  let line = [];
  let width = 0;
  for (const tok of tokens) {
    const add = (line.length ? space : 0) + tok.w;
    if (line.length && width + add > maxWidth) {
      lines.push({ tokens: line, width });
      line = [];
      width = 0;
    }
    width += (line.length ? space : 0) + tok.w;
    line.push(tok);
  }
  if (line.length) lines.push({ tokens: line, width });
  return lines;
};

// Draws the caption line active at time t (seconds) onto a W x H context.
export const drawCaptions = (ctx, captions, t, W, H) => {
  if (!hasCaptions(captions)) return;
  const style = { ...defaultCaptionStyle(), ...captions.style };
  const words = captions.words;
  const time = t - (captions.offset || 0);
  const chunks = buildChunks(words, style.preset === "single" ? 1 : style.maxWords);
  const chunk = chunks.find((c) => time >= c.start && time < c.end);
  if (!chunk) return;

  const fontPx = Math.max(8, Math.round(style.size * H));
  ctx.save();
  ctx.font = `${fontPx}px "${style.fontFamily}", "Satoshi-Bold", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  const space = ctx.measureText(" ").width;

  const tokens = [];
  for (let i = chunk.from; i <= chunk.to; i++) {
    const w = words[i];
    const text = style.uppercase ? w.text.trim().toUpperCase() : w.text.trim();
    if (!text) continue;
    const spoken = time >= w.start;
    const current = time >= w.start && (time < w.end || i === chunk.to || time < words[i + 1]?.start);
    if (style.preset === "pop" && !spoken) continue;
    tokens.push({ text, w: ctx.measureText(text).width, word: w, spoken, current });
  }
  if (!tokens.length) {
    ctx.restore();
    return;
  }

  const lines = layoutLines(ctx, tokens, W * 0.86, space);
  const lineH = fontPx * 1.25;
  const blockH = lines.length * lineH;
  const cy = Math.min(H - blockH / 2 - H * 0.02, Math.max(blockH / 2 + H * 0.02, style.position * H));
  const top = cy - blockH / 2;
  const padX = fontPx * 0.35;
  const padY = fontPx * 0.18;

  if (style.background) {
    const maxW = Math.max(...lines.map((l) => l.width));
    ctx.fillStyle = hexToRgba(style.backgroundColor, style.backgroundOpacity);
    ctx.beginPath();
    ctx.roundRect(W / 2 - maxW / 2 - padX, top - padY, maxW + padX * 2, blockH + padY * 2, fontPx * 0.3);
    ctx.fill();
  }

  const outline = style.outlineWidth > 0 ? style.outlineWidth * fontPx : 0;
  lines.forEach((line, li) => {
    let x = W / 2 - line.width / 2;
    const y = top + lineH * (li + 0.5);
    for (const tok of line.tokens) {
      let fill = style.color;
      let scale = 1;
      if (style.preset === "karaoke" && tok.spoken) fill = style.highlight;
      if (style.preset === "box" && tok.current) {
        ctx.fillStyle = style.highlight;
        ctx.beginPath();
        ctx.roundRect(x - padX * 0.6, y - lineH / 2 + padY * 0.5, tok.w + padX * 1.2, lineH - padY, fontPx * 0.2);
        ctx.fill();
        fill = contrastOn(style.highlight);
      }
      if ((style.preset === "pop" || style.preset === "single") && tok.current) {
        const p = Math.min(1, Math.max(0, (time - tok.word.start) / 0.18));
        scale = 0.6 + 0.4 * easeOutBack(p);
        if (style.preset === "pop") fill = style.highlight;
      }

      ctx.save();
      ctx.translate(x + tok.w / 2, y);
      ctx.scale(scale, scale);
      const boxed = style.preset === "box" && tok.current;
      if (outline && !boxed) {
        ctx.strokeStyle = style.outline;
        ctx.lineWidth = outline;
        ctx.strokeText(tok.text, -tok.w / 2, 0);
      }
      ctx.fillStyle = fill;
      ctx.fillText(tok.text, -tok.w / 2, 0);
      ctx.restore();
      x += tok.w + space;
    }
  });
  ctx.restore();
};

// Replaces the words of one chunk with new text. Timing is kept word-for-word
// when the count is unchanged, otherwise spread evenly over the chunk.
export const editChunkText = (words, chunk, text) => {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const old = words.slice(chunk.from, chunk.to + 1);
  const start = old[0].start;
  const end = old[old.length - 1].end;
  let next;
  if (parts.length === old.length) {
    next = old.map((w, i) => ({ ...w, text: parts[i] }));
  } else {
    const step = (end - start) / Math.max(1, parts.length);
    next = parts.map((p, i) => ({ text: p, start: start + i * step, end: start + (i + 1) * step }));
  }
  return [...words.slice(0, chunk.from), ...next, ...words.slice(chunk.to + 1)];
};

const pad = (n, w = 2) => String(n).padStart(w, "0");
const stamp = (t, sep) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
};

// Subtitle files for players and upload sites.
export const toSubtitles = (captions, format = "srt") => {
  const style = { ...defaultCaptionStyle(), ...captions.style };
  const chunks = buildChunks(captions.words, style.maxWords);
  const off = captions.offset || 0;
  const sep = format === "vtt" ? "." : ",";
  const cues = chunks.map((c, i) => {
    const text = captions.words
      .slice(c.from, c.to + 1)
      .map((w) => w.text.trim())
      .join(" ");
    const range = `${stamp(c.start + off, sep)} --> ${stamp(c.end + off, sep)}`;
    return format === "vtt" ? `${range}\n${text}` : `${i + 1}\n${range}\n${text}`;
  });
  return (format === "vtt" ? "WEBVTT\n\n" : "") + cues.join("\n\n") + "\n";
};
