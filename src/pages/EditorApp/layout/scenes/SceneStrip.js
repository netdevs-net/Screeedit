import React, { useEffect, useRef, useState } from "react";
import styles from "../../styles/annotate/_Annotate.module.scss";
import { ToolIcon } from "../annotate/icons";

const fmt = (t) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
};

// Bottom timeline: transport, ruler, and one card per scene sized by length.
// Cards can be dragged to reorder.
const SceneStrip = ({ scenes }) => {
  const { project, timeline, time, playing, selectedId, actions } = scenes;
  const trackRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [drag, setDrag] = useState(null); // { id, over }

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const duration = timeline.duration || 1;
  const pxPerSec = width / duration;
  const toT = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(duration, (clientX - r.left) / pxPerSec));
  };
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * pxPerSec >= 60) || 600;
  const ticks = [];
  for (let t = 0; t <= duration + 0.001; t += step) ticks.push(t);

  const scrub = (e) => {
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

  // Index a dragged card would land at for a pointer x.
  const dropIndex = (clientX) => {
    const t = toT(clientX);
    const i = timeline.entries.findIndex((e) => t < (e.start + e.end) / 2);
    return i < 0 ? timeline.entries.length : i;
  };

  const startCardDrag = (e, id) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const x0 = e.clientX;
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - x0) < 5) return;
      moved = true;
      setDrag({ id, over: dropIndex(ev.clientX) });
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (!moved) {
        actions.select(id);
        return;
      }
      const from = project.scenes.findIndex((s) => s.id === id);
      let to = dropIndex(ev.clientX);
      if (to > from) to -= 1;
      actions.move(id, to);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const fileRef = useRef(null);

  return (
    <div className={styles.timeline}>
      <div className={styles.transport}>
        <button
          className={styles.playBtn}
          onClick={() => (playing ? actions.pause() : actions.play())}
          data-testid="scenes-play"
          title={playing ? "Pause (Space)" : "Play (Space)"}
        >
          <ToolIcon name={playing ? "pause" : "play"} size={16} />
        </button>
        <span className={styles.timecode} data-testid="scenes-timecode">
          {fmt(time)} / {fmt(timeline.duration || 0)}
        </span>
        <div className={styles.inlineBtns}>
          <button onClick={actions.split} data-testid="scenes-split" title="Split the scene at the playhead (S)">
            <ToolIcon name="split" size={14} /> Split
          </button>
          <button onClick={actions.addTitle} data-testid="scenes-add-title">
            <ToolIcon name="text" size={14} /> Title card
          </button>
          <button onClick={() => fileRef.current?.click()} data-testid="scenes-add-clip">
            <ToolIcon name="image" size={14} /> Add video
          </button>
          <button onClick={() => actions.duplicate()} disabled={!selectedId}>
            <ToolIcon name="duplicate" size={14} /> Duplicate
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            style={{ display: "none" }}
            data-testid="scenes-clip-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) actions.addClip(f);
            }}
          />
        </div>
      </div>
      <div className={styles.trackArea} ref={trackRef}>
        <div className={styles.ruler} onPointerDown={scrub} data-testid="scenes-ruler">
          {ticks.map((t) => (
            <div key={t} className={styles.tick} style={{ left: t * pxPerSec }}>
              <span>{t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}` : `${Math.round(t * 10) / 10}s`}</span>
            </div>
          ))}
        </div>
        <div className={styles.sceneLane} onPointerDown={scrub}>
          {timeline.entries.map((e) => {
            const s = e.scene;
            const left = e.start * pxPerSec;
            const w = Math.max(8, (e.end - e.start) * pxPerSec - 2);
            return (
              <React.Fragment key={s.id}>
                {e.trans > 0 && (
                  <div
                    className={styles.sceneTrans}
                    style={{ left, width: Math.max(4, e.trans * pxPerSec) }}
                    title={`${s.transition.type} ${e.trans.toFixed(1)}s`}
                  />
                )}
                <div
                  className={`${styles.sceneCard} ${s.kind === "title" ? styles.sceneTitle : ""} ${
                    selectedId === s.id ? styles.sceneSelected : ""
                  } ${drag?.id === s.id ? styles.sceneDragging : ""}`}
                  style={{ left, width: w }}
                  onPointerDown={(ev) => startCardDrag(ev, s.id)}
                  data-testid={`scene-${e.index}`}
                  title={`${s.name}: ${(e.end - e.start).toFixed(1)}s`}
                >
                  <span className={styles.sceneName}>{s.name}</span>
                  <span className={styles.sceneLen}>{(e.end - e.start).toFixed(1)}s</span>
                </div>
              </React.Fragment>
            );
          })}
          {drag && (
            <div
              className={styles.sceneDrop}
              style={{
                left:
                  (drag.over < timeline.entries.length ? timeline.entries[drag.over].start : timeline.duration) * pxPerSec,
              }}
            />
          )}
        </div>
        <div className={styles.playhead} style={{ left: time * pxPerSec }} />
      </div>
    </div>
  );
};

export default SceneStrip;
