// Shape library for timeline overlays. Every shape is an SVG path drawn in a
// 100x100 box; fabric scales it to whatever size the user drags out.

const poly = (points) =>
  "M " + points.map(([x, y]) => `${x} ${y}`).join(" L ") + " Z";

const regular = (sides, rotateDeg = -90) => {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = ((rotateDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push([50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)]);
  }
  return poly(pts.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]));
};

const star = (points, inner) => {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 50 : inner;
    const a = ((-90 + (180 / points) * i) * Math.PI) / 180;
    pts.push([+(50 + r * Math.cos(a)).toFixed(2), +(50 + r * Math.sin(a)).toFixed(2)]);
  }
  return poly(pts);
};

export const SHAPE_GROUPS = [
  {
    id: "essential",
    label: "Essential",
    shapes: [
      { id: "rect", label: "Rectangle", path: "M 0 0 H 100 V 100 H 0 Z" },
      {
        id: "roundRect",
        label: "Rounded rectangle",
        path: "M 18 0 H 82 Q 100 0 100 18 V 82 Q 100 100 82 100 H 18 Q 0 100 0 82 V 18 Q 0 0 18 0 Z",
      },
      { id: "ellipse", label: "Ellipse", ellipse: true },
      { id: "triangle", label: "Triangle", path: poly([[50, 0], [100, 100], [0, 100]]) },
      { id: "diamond", label: "Diamond", path: poly([[50, 0], [100, 50], [50, 100], [0, 50]]) },
      { id: "pentagon", label: "Pentagon", path: regular(5) },
      { id: "hexagon", label: "Hexagon", path: regular(6, 0) },
      {
        id: "parallelogram",
        label: "Parallelogram",
        path: poly([[25, 0], [100, 0], [75, 100], [0, 100]]),
      },
    ],
  },
  {
    id: "callouts",
    label: "Callouts",
    shapes: [
      {
        id: "bubble",
        label: "Speech bubble",
        path: "M 10 0 H 90 Q 100 0 100 10 V 62 Q 100 72 90 72 H 40 L 18 96 L 22 72 H 10 Q 0 72 0 62 V 10 Q 0 0 10 0 Z",
      },
      {
        id: "heart",
        label: "Heart",
        path: "M 50 92 C 20 70 0 52 0 30 C 0 12 13 0 28 0 C 38 0 46 6 50 14 C 54 6 62 0 72 0 C 87 0 100 12 100 30 C 100 52 80 70 50 92 Z",
      },
      { id: "star", label: "Star", path: star(5, 21) },
      { id: "burst", label: "Burst", path: star(12, 36) },
      { id: "chevron", label: "Chevron", path: poly([[0, 0], [70, 0], [100, 50], [70, 100], [0, 100], [30, 50]]) },
      {
        id: "plus",
        label: "Plus",
        path: poly([[35, 0], [65, 0], [65, 35], [100, 35], [100, 65], [65, 65], [65, 100], [35, 100], [35, 65], [0, 65], [0, 35], [35, 35]]),
      },
      {
        id: "check",
        label: "Check",
        path: poly([[0, 55], [14, 40], [38, 64], [86, 12], [100, 26], [38, 92]]),
      },
      {
        id: "cross",
        label: "Cross",
        path: poly([[14, 0], [50, 36], [86, 0], [100, 14], [64, 50], [100, 86], [86, 100], [50, 64], [14, 100], [0, 86], [36, 50], [0, 14]]),
      },
    ],
  },
  {
    id: "decorative",
    label: "Decorative",
    shapes: [
      { id: "sparkle", label: "Sparkle", path: "M 50 0 Q 56 44 100 50 Q 56 56 50 100 Q 44 56 0 50 Q 44 44 50 0 Z" },
      {
        id: "cloud",
        label: "Cloud",
        path: "M 25 85 C 8 85 0 72 4 60 C 8 48 20 46 24 48 C 24 30 40 20 54 26 C 62 12 84 14 88 32 C 100 36 102 56 94 66 C 98 78 88 88 76 85 Z",
      },
      { id: "drop", label: "Drop", path: "M 50 0 C 70 30 88 48 88 66 C 88 86 70 100 50 100 C 30 100 12 86 12 66 C 12 48 30 30 50 0 Z" },
      { id: "moon", label: "Moon", path: "M 62 0 C 30 6 10 30 10 56 C 10 82 32 100 60 100 C 78 100 92 92 100 80 C 60 88 34 62 40 30 C 44 14 52 6 62 0 Z" },
      { id: "octagon", label: "Octagon", path: regular(8, 22.5) },
    ],
  },
  {
    id: "progress",
    label: "Progress",
    shapes: [
      // Grows from left to right across the overlay's time range.
      { id: "progressBar", label: "Progress bar", path: "M 0 0 H 100 V 100 H 0 Z", progress: true, aspect: 0.06 },
      { id: "progressPill", label: "Progress pill", path: "M 50 0 H 950 A 50 50 0 0 1 950 100 H 50 A 50 50 0 0 1 50 0 Z", progress: true, aspect: 0.06, box: 1000 },
    ],
  },
];

export const findShape = (id) => {
  for (const g of SHAPE_GROUPS) {
    const s = g.shapes.find((x) => x.id === id);
    if (s) return s;
  }
  return null;
};

// Arrow/line geometry from a drag (x1,y1)->(x2,y2), in canvas pixels.
export const linePath = (x1, y1, x2, y2, { head = "end", width = 6 } = {}) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len;
  const uy = dy / len;
  const hl = Math.max(14, width * 3.4);
  const hw = Math.max(9, width * 2.2);
  const parts = [];
  const tip = (x, y, dirx, diry) => {
    const bx = x - dirx * hl;
    const by = y - diry * hl;
    parts.push(
      `M ${bx - diry * hw} ${by + dirx * hw} L ${x} ${y} L ${bx + diry * hw} ${by - dirx * hw}`,
    );
  };
  const sx = head === "both" ? x1 + ux * hl * 0.5 : x1;
  const sy = head === "both" ? y1 + uy * hl * 0.5 : y1;
  const ex = head !== "none" ? x2 - ux * hl * 0.5 : x2;
  const ey = head !== "none" ? y2 - uy * hl * 0.5 : y2;
  parts.unshift(`M ${sx} ${sy} L ${ex} ${ey}`);
  if (head === "end" || head === "both") tip(x2, y2, ux, uy);
  if (head === "both") tip(x1, y1, -ux, -uy);
  return parts.join(" ");
};
