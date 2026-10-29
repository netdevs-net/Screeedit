// Turns a log of clicks recorded during a tab recording into zoom regions.
// Clicks are { t, x, y } with t in seconds of video time and x, y as
// fractions (0..1) of the video frame.

export const AUTO_ZOOM_DEFAULTS = {
  scale: 1.8, // how far to zoom in
  lead: 0.5, // start zooming this long before the first click
  hold: 1.8, // stay zoomed this long after the last click
  mergeGap: 1.6, // clicks closer than this (s) ...
  mergeDistance: 0.22, // ... and this (fraction of frame) share one zoom
  panGap: 0.9, // zooms closer than this pan from one to the next
  panOverlap: 0.7,
};

// Returns [{ start, end, x, y, w, h }] with the region in frame fractions.
export const planAutoZoom = (clicks, duration, opts = {}) => {
  const o = { ...AUTO_ZOOM_DEFAULTS, ...opts };
  const sorted = [...clicks]
    .filter((c) => c.t >= 0 && c.t <= duration && c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1)
    .sort((a, b) => a.t - b.t);
  const groups = [];
  for (const c of sorted) {
    const g = groups[groups.length - 1];
    if (g) {
      const cx = g.clicks.reduce((s, k) => s + k.x, 0) / g.clicks.length;
      const cy = g.clicks.reduce((s, k) => s + k.y, 0) / g.clicks.length;
      const last = g.clicks[g.clicks.length - 1];
      if (c.t - last.t < o.mergeGap && Math.hypot(c.x - cx, c.y - cy) < o.mergeDistance) {
        g.clicks.push(c);
        continue;
      }
    }
    groups.push({ clicks: [c] });
  }

  const regions = groups.map((g) => {
    const xs = g.clicks.map((c) => c.x);
    const ys = g.clicks.map((c) => c.y);
    const margin = 0.06;
    let w = Math.max(1 / o.scale, Math.max(...xs) - Math.min(...xs) + margin * 2);
    let h = Math.max(1 / o.scale, Math.max(...ys) - Math.min(...ys) + margin * 2);
    w = Math.min(1, w);
    h = Math.min(1, h);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    return {
      start: Math.max(0, g.clicks[0].t - o.lead),
      end: Math.min(duration, g.clicks[g.clicks.length - 1].t + o.hold),
      x: Math.min(Math.max(0, cx - w / 2), 1 - w),
      y: Math.min(Math.max(0, cy - h / 2), 1 - h),
      w,
      h,
    };
  });

  // Neighbors that nearly touch overlap instead, so the view pans across.
  for (let i = 1; i < regions.length; i++) {
    const a = regions[i - 1];
    const b = regions[i];
    if (b.start - a.end < o.panGap) {
      a.end = Math.min(duration, Math.max(a.end, b.start + o.panOverlap));
      if (a.end > b.end) a.end = b.end;
    }
  }
  return regions.filter((r) => r.end - r.start > 0.3);
};
