import React, { useContext, useEffect, useMemo, useState } from "react";
import styles from "../../styles/annotate/_Annotate.module.scss";
import { ContentStateContext } from "../../context/ContentState";
import useScenes from "./useScenes";
import SceneInspector from "./SceneInspector";
import SceneStrip from "./SceneStrip";

const URL = "/assets/";

// "Scenes" mode: split the recording, add videos and title cards, reorder,
// give each scene a layout and transition, then render one video.
const Scenes = () => {
  const [contentState, setContentState] = useContext(ContentStateContext);

  // Re-opening right after a render keeps editing the same project.
  const init = useMemo(() => {
    const reEdit =
      contentState.scenesBurnedBlob &&
      contentState.blob === contentState.scenesBurnedBlob &&
      contentState.scenesProject;
    return reEdit
      ? { mainBlob: contentState.scenesSources.main, initialProject: contentState.scenesProject, initialSources: contentState.scenesSources }
      : { mainBlob: contentState.blob };
    // Captured once on entry.
  }, []);

  const scenes = useScenes(init);
  const { refs, actions, project } = scenes;
  const [saveError, setSaveError] = useState(null);
  const busy = contentState.annotating || contentState.isFfmpegRunning;

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === " ") {
        e.preventDefault();
        scenes.playing ? actions.pause() : actions.play();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? actions.redo() : actions.undo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        actions.duplicate();
      } else if ((e.key === "Delete" || e.key === "Backspace") && scenes.selectedId) {
        e.preventDefault();
        actions.remove();
      } else if (!mod && e.key.toLowerCase() === "s") {
        actions.split();
      } else if (e.key === "Escape") {
        actions.select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenes.playing, scenes.selectedId, actions]);

  const handleCancel = () => {
    if (busy) contentState.cancelEditOp();
    actions.pause();
    setContentState((prev) => ({ ...prev, mode: "player", fromAnnotate: false }));
  };

  const handleSave = async () => {
    if (busy || !project) return;
    actions.pause();
    setSaveError(null);
    const { project: p, sources } = actions.exportProject();
    setContentState((prev) => ({ ...prev, fromAnnotate: true }));
    const started = await contentState.handleRenderScenes(p, sources);
    if (!started) {
      setContentState((prev) => ({ ...prev, fromAnnotate: false }));
      return;
    }
    const ok = await contentState.waitForUpdatedBlob?.();
    if (!ok) {
      setContentState((prev) => ({ ...prev, fromAnnotate: false }));
      setSaveError("Couldn't render the scenes. Your project is still here; try again.");
      return;
    }
    setContentState((prev) => ({
      ...prev,
      scenesProject: p,
      scenesSources: actions.allSources(),
      scenesBurnedBlob: prev.blob,
      hasTempChanges: false,
    }));
    contentState.openToast?.(chrome.i18n.getMessage("sandboxToastSaved"), () => contentState.undo?.());
  };

  return (
    <div className={styles.annotate} data-testid="scenes">
      <div className={styles.nav}>
        <div className={styles.navLeft} onClick={() => chrome.runtime.sendMessage({ type: "open-home" })}>
          <img src={URL + "editor/logo.svg"} alt="Logo" />
        </div>
        <div className={styles.navCenter}>
          Scenes <span className={styles.beta}>NEW</span>
        </div>
        <div className={styles.navRight}>
          <button className={`${styles.iconBtn}`} onClick={actions.undo} disabled={!scenes.history.canUndo} title="Undo (⌘Z)" data-testid="scenes-undo">
            <span className={styles.navIcon}>↶</span>
          </button>
          <button className={`${styles.iconBtn}`} onClick={actions.redo} disabled={!scenes.history.canRedo} title="Redo (⇧⌘Z)">
            <span className={styles.navIcon}>↷</span>
          </button>
          <button className="button simpleButton blackButton" onClick={handleCancel} data-testid="scenes-cancel">
            Cancel
          </button>
          <button className="button primaryButton" onClick={handleSave} disabled={busy || !project} data-testid="scenes-save">
            {contentState.annotating ? `Rendering ${contentState.processingProgress || 0}%` : "Render video"}
          </button>
        </div>
      </div>
      {(saveError || scenes.error) && <div className={styles.error}>{saveError || scenes.error}</div>}
      <div className={styles.main}>
        <SceneInspector scenes={scenes} />
        <div className={styles.stage} ref={refs.stageRef} onPointerDown={(e) => e.target === e.currentTarget && actions.select(null)}>
          <canvas ref={refs.canvasRef} className={styles.scenesCanvas} data-testid="scenes-canvas" />
          {!project && !scenes.error && <div className={styles.loading}>Loading video…</div>}
        </div>
      </div>
      <SceneStrip scenes={scenes} />
    </div>
  );
};

export default Scenes;
