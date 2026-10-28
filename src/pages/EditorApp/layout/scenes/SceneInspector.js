import React from "react";
import styles from "../../styles/annotate/_Annotate.module.scss";
import { Row, ColorInput, Slider, NumberInput, Segmented } from "../annotate/Inspector";
import BackdropPanel from "../annotate/BackdropPanel";
import { ToolIcon } from "../annotate/icons";
import { ASPECTS, defaultFrame } from "../../annotate/frame";
import { TRANSITIONS, MOTIONS, sceneDuration } from "../../annotate/scenes";

const Grid = ({ list, value, onChange, testPrefix }) => (
  <div className={styles.animGrid}>
    {list.map((o) => (
      <button
        key={o.id}
        className={`${styles.animBtn} ${value === o.id ? styles.animActive : ""}`}
        onClick={() => onChange(o.id)}
        data-testid={`${testPrefix}-${o.id}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// Left panel: project settings, or the selected scene's settings.
const SceneInspector = ({ scenes }) => {
  const { project, selected, actions, timeline } = scenes;
  const [tab, setTab] = React.useState("scene");
  if (!project) return <div className={styles.inspector} />;

  if (!selected) {
    return (
      <div className={styles.inspector} data-testid="scenes-inspector">
        <div className={styles.inspectorTitle}>Scenes</div>
        <p className={styles.hint}>
          Build a video from several scenes: split this recording, add other videos or title cards, reorder them, and
          choose how each one transitions into the next. Each scene can have its own backdrop and device; the Smooth
          transition animates from one layout to the next.
        </p>
        <div className={styles.sectionTitle}>Video shape</div>
        <Grid list={ASPECTS} value={project.aspect} onChange={actions.setAspect} testPrefix="project-aspect" />
        <ul className={styles.tips}>
          <li><b>Space</b> play / pause</li>
          <li><b>S</b> split at playhead</li>
          <li><b>⌘Z / ⇧⌘Z</b> undo / redo</li>
          <li><b>⌫</b> delete scene</li>
          <li><b>Drag</b> a scene to reorder it</li>
        </ul>
      </div>
    );
  }

  const index = project.scenes.findIndex((s) => s.id === selected.id);
  const set = (patch) => actions.updateScene(selected.id, patch);
  const layoutEditor = {
    doc: { frame: selected.layout?.enabled ? { ...selected.layout, aspect: project.aspect } : null },
    actions: {
      setFrame: (f) =>
        set({
          layout: f
            ? { ...f, enabled: true }
            : { ...defaultFrame(), enabled: false, padding: 0, radius: 0, shadow: 0 },
        }),
    },
  };

  return (
    <div className={styles.inspector} data-testid="scene-inspector">
      <div className={styles.inspectorHeader}>
        <input
          className={styles.titleInput}
          value={selected.name}
          onChange={(e) => set({ name: e.target.value })}
          aria-label="Scene name"
        />
        <button className={styles.iconBtn} onClick={() => actions.remove(selected.id)} title="Delete scene" disabled={project.scenes.length <= 1}>
          <ToolIcon name="trash" size={16} />
        </button>
      </div>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: "scene", label: "Scene" },
          { id: "layout", label: "Layout" },
          { id: "transition", label: "Transition" },
        ]}
      />

      {tab === "scene" && (
        <div className={styles.inspectorBody}>
          {selected.kind === "title" ? (
            <>
              <Row label="Text">
                <textarea
                  className={styles.textArea}
                  rows={2}
                  value={selected.title.text}
                  onChange={(e) => set({ title: { ...selected.title, text: e.target.value } })}
                  data-testid="title-text"
                />
              </Row>
              <Row label="Subtitle">
                <textarea
                  className={styles.textArea}
                  rows={2}
                  value={selected.title.subtext}
                  onChange={(e) => set({ title: { ...selected.title, subtext: e.target.value } })}
                />
              </Row>
              <Row label="Color">
                <ColorInput value={selected.title.color} onChange={(v) => set({ title: { ...selected.title, color: v || "#FFFFFF" } })} />
              </Row>
              <Row label="Size">
                <Slider
                  value={Math.round(selected.title.size * 100)}
                  min={3}
                  max={20}
                  suffix="%"
                  onChange={(v) => set({ title: { ...selected.title, size: v / 100 } })}
                />
              </Row>
              <Row label="Length (s)">
                <NumberInput value={selected.duration} min={0.5} step={0.5} onChange={(v) => set({ duration: Math.max(0.5, v) })} testId="title-duration" />
              </Row>
            </>
          ) : (
            <>
              <Row label="Start (s)">
                <NumberInput
                  value={selected.in}
                  step={0.1}
                  min={0}
                  onChange={(v) => set({ in: Math.max(0, Math.min(v, selected.out - 0.2)) })}
                  testId="scene-in"
                />
              </Row>
              <Row label="End (s)">
                <NumberInput
                  value={selected.out}
                  step={0.1}
                  onChange={(v) => set({ out: Math.max(selected.in + 0.2, v) })}
                  testId="scene-out"
                />
              </Row>
              <Row label="Volume">
                <Slider value={Math.round((selected.volume ?? 1) * 100)} min={0} max={100} suffix="%" onChange={(v) => set({ volume: v / 100 })} />
              </Row>
            </>
          )}
          <div className={styles.sectionTitle}>Motion</div>
          <Grid list={MOTIONS} value={selected.motion || "none"} onChange={(motion) => set({ motion })} testPrefix="motion" />
          <p className={styles.muted}>
            Scene {index + 1} of {project.scenes.length} · {sceneDuration(selected).toFixed(1)}s · starts at{" "}
            {timeline.entries[index]?.start.toFixed(1)}s
          </p>
        </div>
      )}

      {tab === "layout" && <BackdropPanel editor={layoutEditor} hideAspect embedded />}

      {tab === "transition" && (
        <div className={styles.inspectorBody}>
          {index === 0 ? (
            <p className={styles.hint}>The first scene has no transition in. Select a later scene to set how it appears.</p>
          ) : (
            <>
              <p className={styles.hint}>How this scene replaces the one before it.</p>
              <Grid
                list={TRANSITIONS}
                value={selected.transition?.type || "cut"}
                onChange={(type) => set({ transition: { ...selected.transition, type } })}
                testPrefix="transition"
              />
              {selected.transition?.type !== "cut" && (
                <Row label="Length (s)">
                  <Slider
                    value={selected.transition?.duration ?? 0.6}
                    min={0.2}
                    max={2}
                    step={0.1}
                    onChange={(v) => set({ transition: { ...selected.transition, duration: v } })}
                  />
                </Row>
              )}
              {selected.transition?.type === "smooth" && (
                <p className={styles.muted}>Smooth moves the video from the previous scene's layout into this one's.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SceneInspector;
