import React, { useRef, useState, useEffect } from "react";
import styles from "../../styles/annotate/_Annotate.module.scss";
import { ToolIcon } from "./icons";

const KIND_COLORS = {
  text: "#2ECC71",
  draw: "#FF3B5C",
  arrow: "#FF8A3D",
  shape: "#9B59B6",
  image: "#00B8D9",
  blur: "#3080F8",
  focus: "#E0B400",
  zoom: "#16A085",
};
const KIND_ICONS = {
  text: "text",
  draw: "pen",
  arrow: "arrow",
  shape: "shape",
  image: "image",
  blur: "blur",
  focus: "focus",
  zoom: "zoom",
};
const MIN_LEN = 0.2;
const LABEL_W = 0; // bars use the full width; names sit inside the bars

const fmt = (t) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
};

const OverlayTimeline = ({ editor }) => {
  const { doc, duration, time, playing, selectedId, actions } = editor;
  const trackRef = useRef(null);
  const [width, setWidth] = useState(800);
  const dragRef = useRef(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const pxPerSec = duration > 0 ? (width - LABEL_W) / duration : 1;
  const toX = (t) => LABEL_W + t * pxPerSec;
  const toT = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(duration, (clientX - rect.left - LABEL_W) / pxPerSec));
  };

  // Ruler ticks at a readable interval for the zoom level.
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * pxPerSec >= 60) || 600;
  const ticks = [];
  for (let t = 0; t <= duration + 0.001; t += step) ticks.push(t);

  const startScrub = (e) => {
    e.preventDefault();
    if (playing) actions.pause();
    actions.seek(toT(e.clientX));
    const move = (ev) => actions.seek(toT(ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startBarDrag = (e, item, mode) => {
    e.preventDefault();
    e.stopPropagation();
    if (playing) actions.pause();
    actions.selectItem(item.id);
    const t0 = toT(e.clientX);
    dragRef.current = { id: item.id, mode, t0, start: item.start, end: item.end, moved: false, pushed: false };
    const move = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const dt = toT(ev.clientX) - d.t0;
      if (!d.moved && Math.abs(dt) * pxPerSec < 2) return;
      d.moved = true;
      let start = d.start;
      let end = d.end;
      if (d.mode === "move") {
        const len = d.end - d.start;
        start = Math.max(0, Math.min(duration - len, d.start + dt));
        end = start + len;
      } else if (d.mode === "start") {
        start = Math.max(0, Math.min(d.end - MIN_LEN, d.start + dt));
      } else {
        end = Math.min(duration, Math.max(d.start + MIN_LEN, d.end + dt));
      }
      // One undo step per drag.
      actions.updateItem(d.id, { start, end }, { history: !d.pushed });
      d.pushed = true;
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const items = doc?.items || [];

  return (
    <div className={styles.timeline}>
      <div className={styles.transport}>
        <button
          className={styles.playBtn}
          onClick={() => (playing ? actions.pause() : actions.play())}
          data-testid="play-toggle"
          title={playing ? "Pause (Space)" : "Play (Space)"}
        >
          <ToolIcon name={playing ? "pause" : "play"} size={16} />
        </button>
        <span className={styles.timecode} data-testid="timecode">
          {fmt(time)} / {fmt(duration || 0)}
        </span>
        <span className={styles.muted}>
          {items.length === 0 ? "No overlays yet" : `${items.length} overlay${items.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className={styles.trackArea} ref={trackRef}>
        <div className={styles.ruler} onPointerDown={startScrub} data-testid="ruler">
          {ticks.map((t) => (
            <div key={t} className={styles.tick} style={{ left: toX(t) }}>
              <span>{t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}` : `${Math.round(t * 10) / 10}s`}</span>
            </div>
          ))}
        </div>
        <div className={styles.lanes} onPointerDown={startScrub}>
          <div className={styles.videoLane} />
          {[...items].reverse().map((item) => {
            const left = toX(item.start);
            const w = Math.max(6, (item.end - item.start) * pxPerSec);
            const color = KIND_COLORS[item.kind] || "#3080F8";
            return (
              <div key={item.id} className={styles.lane}>
                <div
                  className={`${styles.bar} ${selectedId === item.id ? styles.barSelected : ""}`}
                  style={{ left, width: w, background: color }}
                  onPointerDown={(e) => startBarDrag(e, item, "move")}
                  data-testid={`bar-${item.kind}`}
                  data-item-id={item.id}
                  title={`${item.name}: ${item.start.toFixed(1)}s – ${item.end.toFixed(1)}s`}
                >
                  <div className={styles.handle} onPointerDown={(e) => startBarDrag(e, item, "start")} data-testid="bar-start" />
                  <span className={styles.barLabel}>
                    <ToolIcon name={KIND_ICONS[item.kind]} size={12} />
                    {item.name}
                  </span>
                  <div className={`${styles.handle} ${styles.handleRight}`} onPointerDown={(e) => startBarDrag(e, item, "end")} data-testid="bar-end" />
                </div>
              </div>
            );
          })}
        </div>
        <div className={styles.playhead} style={{ left: toX(time) }} />
      </div>
    </div>
  );
};

export default OverlayTimeline;
