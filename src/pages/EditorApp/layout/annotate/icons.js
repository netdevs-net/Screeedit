import React from "react";

// Small stroke icons for the overlay editor (24px grid, currentColor).
const PATHS = {
  select: "M5 3l14 8-6 2-2 6z",
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  pen: "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3",
  highlighter: "M9 15l-4 5h6l2-3M9 15l7-11 4 3-7 11zM9 15l4 3",
  arrow: "M5 19L19 5M10 5h9v9",
  doubleArrow: "M5 19L19 5M10 5h9v9M14 19H5v-9",
  line: "M5 19L19 5",
  shape: "M4 4h8v8H4zM17 20a4 4 0 100-8 4 4 0 000 8z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 100-.01",
  focus: "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M12 9a3 3 0 100 6 3 3 0 000-6z",
  blur: "M12 3s6 7 6 11a6 6 0 01-12 0c0-4 6-11 6-11z",
  zoom: "M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5M11 8v6M8 11h6",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3",
  redo: "M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3",
  duplicate: "M8 8h12v12H8zM4 16V4h12",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  play: "M7 4l13 8-13 8z",
  pause: "M7 4h4v16H7zM13 4h4v16h-4z",
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M5 12l7 7 7-7",
  close: "M6 6l12 12M18 6L6 18",
  autozoom: "M10 4a6 6 0 100 12 6 6 0 000-12zM20 20l-5.5-5.5M7 10h6M10 7v6M18 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z",
  split: "M12 3v18M5 8l-3 4 3 4M19 8l3 4-3 4",
  backdrop: "M3 4h18v16H3zM7 8h10v7H7zM10 18h4",
  captions: "M3 6h18v12H3zM7 11h4M13 11h4M7 14.5h7M16 14.5h1",
};

export const ToolIcon = ({ name, size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={name === "play" || name === "pause" ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={PATHS[name] || PATHS.shape} />
  </svg>
);

export const ShapeIcon = ({ shape }) => {
  return (
    <svg width="26" height="26" viewBox="0 0 100 100" aria-hidden="true">
      {shape.progress ? (
        <>
          <rect x="0" y="40" width="100" height="20" rx={shape.box ? 10 : 0} fill="currentColor" opacity="0.25" />
          <rect x="0" y="40" width="60" height="20" rx={shape.box ? 10 : 0} fill="currentColor" />
        </>
      ) : shape.ellipse ? (
        <ellipse cx="50" cy="50" rx="50" ry="50" fill="currentColor" />
      ) : (
        <path d={shape.path} fill="currentColor" />
      )}
    </svg>
  );
};
