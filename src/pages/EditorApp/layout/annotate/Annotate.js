import React, { useContext, useEffect, useMemo, useState } from "react";
import styles from "../../styles/annotate/_Annotate.module.scss";
import { ContentStateContext } from "../../context/ContentState";
import useOverlayEditor from "./useOverlayEditor";
import AnnotateToolbar from "./AnnotateToolbar";
import Inspector from "./Inspector";
import OverlayTimeline from "./OverlayTimeline";
import CaptionsPanel from "./CaptionsPanel";
import BackdropPanel from "./BackdropPanel";
import { hasFrame } from "../../annotate/frame";
import { hasCaptions } from "../../annotate/captions";

const URL = "/assets/";

// "Text & drawing" mode: place text, drawings, shapes, images and blur/focus/
// zoom effects on a timeline over the video, then burn them in on save.
const Annotate = () => {
  const [contentState, setContentState] = useContext(ContentStateContext);

  // Re-opening right after a save edits the same overlays on the original
  // video instead of drawing on top of the already-burned result.
  const { sourceBlob, initialDoc } = useMemo(() => {
    const reEdit =
      contentState.overlayBurnedBlob &&
      contentState.blob === contentState.overlayBurnedBlob &&
      contentState.overlayBaseBlob;
    return {
      sourceBlob: reEdit ? contentState.overlayBaseBlob : contentState.blob,
      initialDoc: reEdit ? contentState.overlayDoc : null,
    };
    // Captured once on entry.
  }, []);

  const editor = useOverlayEditor({
    blob: sourceBlob,
    initialDoc,
    duration: contentState.duration,
  });
  const { refs, actions, doc } = editor;
  const [saveError, setSaveError] = useState(null);
  const [panel, setPanel] = useState(null); // null | "captions" | "backdrop"
  const togglePanel = (p) => setPanel((cur) => (cur === p ? null : p));

  const busy = contentState.annotating || contentState.isFfmpegRunning;
  const hasItems = (doc?.items?.length || 0) > 0 || hasCaptions(doc?.captions) || hasFrame(doc?.frame);
  const canSave = !busy && (hasItems || Boolean(initialDoc));

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (actions.isEditingText()) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === " ") {
        e.preventDefault();
        editor.playing ? actions.pause() : actions.play();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? actions.redo() : actions.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        actions.redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        actions.duplicateItem();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (editor.selectedId) {
          e.preventDefault();
          actions.removeItem();
        }
      } else if (e.key === "Escape") {
        actions.setTool("select");
      } else if (!mod && !e.altKey) {
        const map = { v: "select", p: "pen", h: "highlighter", a: "arrow", l: "line" };
        const tool = map[e.key.toLowerCase()];
        if (tool) actions.setTool(tool);
        if (e.key.toLowerCase() === "t") actions.addText("title");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor.playing, editor.selectedId, actions]);

  const handleCancel = () => {
    if (busy) contentState.cancelEditOp();
    actions.pause();
    setContentState((prev) => ({ ...prev, mode: "player", fromAnnotate: false }));
  };

  const handleSave = async () => {
    if (!canSave) return;
    actions.pause();
    setSaveError(null);
    const overlayDoc = actions.exportDoc();

    // Removing every overlay from a re-edit just restores the original.
    if (!overlayDoc.items.length && !hasCaptions(overlayDoc.captions) && !hasFrame(overlayDoc.frame)) {
      setContentState((prev) => ({
        ...prev,
        blob: sourceBlob,
        mode: "player",
        overlayDoc: null,
        overlayBaseBlob: null,
        overlayBurnedBlob: null,
      }));
      return;
    }

    setContentState((prev) => ({ ...prev, fromAnnotate: true }));
    const started = await contentState.handleAnnotate(overlayDoc, sourceBlob);
    if (!started) {
      setContentState((prev) => ({ ...prev, fromAnnotate: false }));
      return;
    }
    const ok = await contentState.waitForUpdatedBlob?.();
    if (!ok) {
      setContentState((prev) => ({ ...prev, fromAnnotate: false }));
      setSaveError("Couldn't render the overlays into the video. Your edits are still here; try again.");
      return;
    }
    // The updated blob is already queued; remember how it was made.
    setContentState((prev) => ({
      ...prev,
      overlayDoc,
      overlayBaseBlob: sourceBlob,
      overlayBurnedBlob: prev.blob,
      hasTempChanges: false,
    }));
    contentState.openToast?.(chrome.i18n.getMessage("sandboxToastSaved"), () => contentState.undo?.());
  };

  return (
    <div className={styles.annotate} data-testid="annotate">
      <div className={styles.nav}>
        <div className={styles.navLeft} onClick={() => chrome.runtime.sendMessage({ type: "open-home" })}>
          <img src={URL + "editor/logo.svg"} alt="Logo" />
        </div>
        <div className={styles.navCenter}>
          Text &amp; drawing <span className={styles.beta}>NEW</span>
        </div>
        <div className={styles.navRight}>
          <button className="button simpleButton blackButton" onClick={handleCancel} data-testid="annotate-cancel">
            Cancel
          </button>
          <button className="button primaryButton" onClick={handleSave} disabled={!canSave} data-testid="annotate-save">
            {contentState.annotating
              ? `Rendering ${contentState.processingProgress || 0}%`
              : "Save to video"}
          </button>
        </div>
      </div>
      <AnnotateToolbar
        editor={editor}
        panel={panel}
        onPanel={togglePanel}
      />
      {saveError && <div className={styles.error}>{saveError}</div>}
      <div className={styles.main}>
        {panel === "captions" ? (
          <CaptionsPanel editor={editor} sourceBlob={sourceBlob} onClose={() => setPanel(null)} />
        ) : panel === "backdrop" ? (
          <BackdropPanel editor={editor} onClose={() => setPanel(null)} />
        ) : (
          <Inspector editor={editor} />
        )}
        <div className={styles.stage} ref={refs.stageRef}>
          <div className={styles.compose} ref={refs.composeRef}>
            <canvas ref={refs.backdropCanvasRef} className={styles.backdropCanvas} data-testid="backdrop-canvas" />
            <div className={styles.stageInner} ref={refs.contentRef}>
              <canvas ref={refs.frameCanvasRef} className={styles.frameCanvas} />
              <div className={styles.fabricHost}>
                <canvas ref={refs.fabricElRef} />
              </div>
            </div>
          </div>
          <video ref={refs.videoRef} className={styles.hiddenVideo} playsInline preload="auto" />
          {!editor.size && <div className={styles.loading}>Loading video…</div>}
        </div>
      </div>
      <OverlayTimeline editor={editor} onOpenCaptions={() => setPanel("captions")} />
    </div>
  );
};

export default Annotate;
