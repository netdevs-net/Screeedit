import React, { useRef, useState, useEffect } from "react";
import styles from "../../styles/annotate/_Annotate.module.scss";
import { SHAPE_GROUPS } from "../../annotate/shapes";
import { TEXT_PRESETS } from "./useOverlayEditor";
import { ShapeIcon, ToolIcon } from "./icons";

const COLORS = ["#FF3B5C", "#FFD84D", "#2ECC71", "#3080F8", "#9B59B6", "#FFFFFF", "#29292F"];

// A toolbar button that opens a popover menu below it.
const MenuButton = ({ icon, label, active, children, testId }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className={styles.menuWrap} ref={ref}>
      <button
        className={`${styles.tool} ${active || open ? styles.toolActive : ""}`}
        onClick={() => setOpen((o) => !o)}
        data-testid={testId}
        title={label}
      >
        <ToolIcon name={icon} />
        <span>{label}</span>
      </button>
      {open && (
        <div className={styles.menu} onClick={(e) => e.target.closest("[data-close]") && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
};

const AnnotateToolbar = ({ editor }) => {
  const { tool, drawStyle, actions, history, selectedId } = editor;
  const fileRef = useRef(null);

  const toolBtn = (id, label, icon = id) => (
    <button
      className={`${styles.tool} ${tool === id ? styles.toolActive : ""}`}
      onClick={() => actions.setTool(tool === id && id !== "select" ? "select" : id)}
      data-testid={`tool-${id}`}
      title={label}
    >
      <ToolIcon name={icon} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolGroup}>
        {toolBtn("select", "Select")}
        <MenuButton icon="text" label="Text" testId="tool-text">
          <div className={styles.menuTitle}>Text</div>
          <button data-close className={styles.textPresetTitle} onClick={() => actions.addText("title")} data-testid="text-title">
            Add a title
          </button>
          <button data-close className={styles.textPresetSubtitle} onClick={() => actions.addText("subtitle")} data-testid="text-subtitle">
            Add a subtitle
          </button>
          <button data-close className={styles.textPresetBody} onClick={() => actions.addText("body")} data-testid="text-body">
            Add body text
          </button>
          <div className={styles.menuTitle}>Templates</div>
          <div className={styles.templateGrid}>
            {["lowerThird", "label", "headline", "counter", "credits"].map((id) => (
              <button
                key={id}
                data-close
                className={styles.templateBtn}
                onClick={() => actions.addText(id)}
                data-testid={`text-${id}`}
              >
                {TEXT_PRESETS[id].name}
              </button>
            ))}
          </div>
        </MenuButton>
        {toolBtn("pen", "Pen")}
        {toolBtn("highlighter", "Highlight")}
        {toolBtn("arrow", "Arrow")}
        {toolBtn("line", "Line")}
        <MenuButton icon="shape" label="Shape" testId="tool-shape">
          {SHAPE_GROUPS.map((g) => (
            <div key={g.id}>
              <div className={styles.menuTitle}>{g.label}</div>
              <div className={styles.shapeGrid}>
                {g.shapes.map((s) => (
                  <button
                    key={s.id}
                    data-close
                    className={styles.shapeBtn}
                    title={s.label}
                    onClick={() => actions.addShape(s.id)}
                    data-testid={`shape-${s.id}`}
                  >
                    <ShapeIcon shape={s} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className={styles.menuTitle}>Lines &amp; arrows</div>
          <div className={styles.shapeGrid}>
            <button data-close className={styles.shapeBtn} title="Arrow" onClick={() => actions.setTool("arrow")}>
              <ToolIcon name="arrow" />
            </button>
            <button data-close className={styles.shapeBtn} title="Double arrow" onClick={() => actions.setTool("doubleArrow")}>
              <ToolIcon name="doubleArrow" />
            </button>
            <button data-close className={styles.shapeBtn} title="Line" onClick={() => actions.setTool("line")}>
              <ToolIcon name="line" />
            </button>
          </div>
        </MenuButton>
        <button className={styles.tool} onClick={() => fileRef.current?.click()} data-testid="tool-image" title="Image">
          <ToolIcon name="image" />
          <span>Image</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          data-testid="image-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) actions.addImage(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className={styles.divider} />
      <div className={styles.toolGroup}>
        <button className={styles.tool} onClick={() => actions.addEffect("focus")} data-testid="tool-focus" title="Spotlight a region">
          <ToolIcon name="focus" />
          <span>Focus</span>
        </button>
        <button className={styles.tool} onClick={() => actions.addEffect("blur")} data-testid="tool-blur" title="Blur a region">
          <ToolIcon name="blur" />
          <span>Blur</span>
        </button>
        <button className={styles.tool} onClick={() => actions.addEffect("zoom")} data-testid="tool-zoom" title="Zoom into a region">
          <ToolIcon name="zoom" />
          <span>Zoom</span>
        </button>
      </div>
      <div className={styles.divider} />
      <div className={styles.toolGroup}>
        <div className={styles.swatches} title="Color for new drawings and shapes">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`${styles.swatch} ${drawStyle.color === c ? styles.swatchActive : ""}`}
              style={{ background: c }}
              onClick={() => actions.setDrawStyle({ color: c })}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <select
          className={styles.widthSelect}
          value={drawStyle.width}
          onChange={(e) => actions.setDrawStyle({ width: Number(e.target.value) })}
          title="Stroke width"
        >
          {[2, 4, 6, 10, 16].map((w) => (
            <option key={w} value={w}>
              {w}px
            </option>
          ))}
        </select>
      </div>
      <div className={styles.divider} />
      <div className={styles.toolGroup}>
        <button className={styles.iconBtn} onClick={actions.undo} disabled={!history.canUndo} title="Undo (⌘Z)" data-testid="undo">
          <ToolIcon name="undo" />
        </button>
        <button className={styles.iconBtn} onClick={actions.redo} disabled={!history.canRedo} title="Redo (⇧⌘Z)" data-testid="redo">
          <ToolIcon name="redo" />
        </button>
        <button className={styles.iconBtn} onClick={() => actions.duplicateItem()} disabled={!selectedId} title="Duplicate (⌘D)">
          <ToolIcon name="duplicate" />
        </button>
        <button className={styles.iconBtn} onClick={() => actions.removeItem()} disabled={!selectedId} title="Delete (⌫)" data-testid="delete">
          <ToolIcon name="trash" />
        </button>
      </div>
    </div>
  );
};

export default AnnotateToolbar;
