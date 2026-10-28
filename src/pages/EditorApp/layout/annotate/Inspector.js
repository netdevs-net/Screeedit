import React, { useState } from "react";
import styles from "../../styles/annotate/_Annotate.module.scss";
import { ANIM_IN, ANIM_OUT, ANIM_LOOP, EASINGS, EFFECT_KINDS } from "../../annotate/overlayEngine";
import { ToolIcon } from "./icons";

const FONTS = [
  "Satoshi-Bold",
  "Satoshi-Medium",
  "Satoshi-Light",
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Impact",
  "Verdana",
  "Trebuchet MS",
];

const Row = ({ label, children }) => (
  <div className={styles.row}>
    <label>{label}</label>
    <div className={styles.rowControl}>{children}</div>
  </div>
);

const ColorInput = ({ value, onChange, allowNone, testId }) => {
  const isNone = !value || value === "transparent";
  return (
    <div className={styles.colorInput}>
      <input
        type="color"
        value={isNone ? "#000000" : toHex(value)}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
      <span>{isNone ? "None" : toHex(value).toUpperCase()}</span>
      {allowNone && !isNone && (
        <button className={styles.linkBtn} onClick={() => onChange("")}>
          Clear
        </button>
      )}
    </div>
  );
};

const Slider = ({ value, min, max, step = 1, onChange, suffix = "", testId }) => (
  <div className={styles.slider}>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      data-testid={testId}
    />
    <span>
      {Math.round(value * 100) / 100}
      {suffix}
    </span>
  </div>
);

const NumberInput = ({ value, onChange, step = 0.1, min, max, testId }) => (
  <input
    className={styles.numberInput}
    type="number"
    value={Math.round(value * 100) / 100}
    step={step}
    min={min}
    max={max}
    onChange={(e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) onChange(v);
    }}
    data-testid={testId}
  />
);

const Segmented = ({ options, value, onChange }) => (
  <div className={styles.segmented}>
    {options.map((o) => (
      <button
        key={o.id}
        className={value === o.id ? styles.segActive : ""}
        onClick={() => onChange(o.id)}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const AnimPicker = ({ list, value, onChange, isText, testPrefix }) => (
  <div className={styles.animGrid}>
    {list
      .filter((a) => isText || !a.textOnly)
      .map((a) => (
        <button
          key={a.id}
          className={`${styles.animBtn} ${value === a.id ? styles.animActive : ""}`}
          onClick={() => onChange(a.id)}
          data-testid={`${testPrefix}-${a.id}`}
        >
          {a.label}
        </button>
      ))}
  </div>
);

const StyleTab = ({ item, obj, actions }) => {
  const set = (props) => actions.updateObject(props);
  const opacity = obj.opacity ?? 1;

  if (item.kind === "text") {
    const cfg = item.text || {};
    const hasShadow = Boolean(obj.shadow);
    return (
      <>
        <Row label="Text">
          <textarea
            className={styles.textArea}
            value={obj.text}
            rows={3}
            onChange={(e) => set({ text: e.target.value })}
            data-testid="text-content"
          />
        </Row>
        <Row label="Font">
          <select value={obj.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f} value={f}>
                {f.replace("Satoshi-", "Satoshi ")}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Size">
          <NumberInput value={obj.fontSize} step={2} min={6} max={600} onChange={(v) => set({ fontSize: v })} testId="font-size" />
        </Row>
        <Row label="Style">
          <div className={styles.inlineBtns}>
            <button
              className={obj.fontWeight === "bold" ? styles.segActive : ""}
              onClick={() => set({ fontWeight: obj.fontWeight === "bold" ? "normal" : "bold" })}
            >
              <b>B</b>
            </button>
            <button
              className={obj.fontStyle === "italic" ? styles.segActive : ""}
              onClick={() => set({ fontStyle: obj.fontStyle === "italic" ? "normal" : "italic" })}
            >
              <i>I</i>
            </button>
            <button
              className={obj.underline ? styles.segActive : ""}
              onClick={() => set({ underline: !obj.underline })}
            >
              <u>U</u>
            </button>
          </div>
        </Row>
        <Row label="Align">
          <Segmented
            value={obj.textAlign}
            onChange={(v) => set({ textAlign: v })}
            options={[
              { id: "left", label: "Left" },
              { id: "center", label: "Center" },
              { id: "right", label: "Right" },
            ]}
          />
        </Row>
        <Row label="Color">
          <ColorInput value={obj.fill} onChange={(v) => set({ fill: v })} testId="text-color" />
        </Row>
        <Row label="Background">
          <ColorInput value={obj.backgroundColor} allowNone onChange={(v) => set({ backgroundColor: v })} testId="text-bg" />
        </Row>
        <Row label="Outline">
          <ColorInput value={obj.strokeWidth ? obj.stroke : ""} allowNone onChange={(v) => set(v ? { stroke: v, strokeWidth: Math.max(2, obj.strokeWidth || 0) } : { strokeWidth: 0 })} />
        </Row>
        {obj.strokeWidth > 0 && (
          <Row label="Outline width">
            <Slider value={obj.strokeWidth} min={1} max={20} onChange={(v) => set({ strokeWidth: v })} />
          </Row>
        )}
        <Row label="Shadow">
          <input
            type="checkbox"
            checked={hasShadow}
            onChange={(e) =>
              set({ shadow: e.target.checked ? { color: "rgba(0,0,0,0.45)", blur: 12, offsetX: 0, offsetY: 3 } : null })
            }
          />
        </Row>
        <Row label="Opacity">
          <Slider value={Math.round(opacity * 100)} min={0} max={100} suffix="%" onChange={(v) => set({ opacity: v / 100 })} />
        </Row>
        <div className={styles.sectionTitle}>Mode</div>
        <Segmented
          value={cfg.mode || "normal"}
          onChange={(v) => actions.updateItem(item.id, { text: { mode: v } })}
          options={[
            { id: "normal", label: "Normal" },
            { id: "scroll", label: "Scroll" },
            { id: "counter", label: "Counter" },
          ]}
        />
        {cfg.mode === "counter" && (
          <>
            <Row label="From">
              <NumberInput value={cfg.counterFrom} step={1} onChange={(v) => actions.updateItem(item.id, { text: { counterFrom: v } })} />
            </Row>
            <Row label="To">
              <NumberInput value={cfg.counterTo} step={1} onChange={(v) => actions.updateItem(item.id, { text: { counterTo: v } })} />
            </Row>
            <Row label="Decimals">
              <NumberInput value={cfg.decimals} step={1} min={0} max={4} onChange={(v) => actions.updateItem(item.id, { text: { decimals: v } })} />
            </Row>
            <Row label="Prefix">
              <input className={styles.textInput} value={cfg.prefix} onChange={(e) => actions.updateItem(item.id, { text: { prefix: e.target.value } }, { history: false })} />
            </Row>
            <Row label="Suffix">
              <input className={styles.textInput} value={cfg.suffix} onChange={(e) => actions.updateItem(item.id, { text: { suffix: e.target.value } }, { history: false })} />
            </Row>
          </>
        )}
      </>
    );
  }

  if (item.kind === "blur") {
    return (
      <Row label="Blur amount">
        <Slider value={item.effect?.amount ?? 18} min={2} max={60} onChange={(v) => actions.updateItem(item.id, { effect: { amount: v } })} testId="blur-amount" />
      </Row>
    );
  }
  if (item.kind === "focus") {
    return (
      <Row label="Dim outside">
        <Slider value={Math.round((item.effect?.dim ?? 0.6) * 100)} min={10} max={95} suffix="%" onChange={(v) => actions.updateItem(item.id, { effect: { dim: v / 100 } })} />
      </Row>
    );
  }
  if (item.kind === "zoom") {
    return <p className={styles.hint}>Move and resize the green box to choose what to zoom into. The zoom eases in and out over the clip&apos;s time range.</p>;
  }

  const isStroke = item.kind === "draw" || item.kind === "arrow";
  return (
    <>
      {!isStroke && item.kind !== "image" && (
        <Row label="Fill">
          <ColorInput value={obj.fill} allowNone onChange={(v) => set({ fill: v })} testId="shape-fill" />
        </Row>
      )}
      {item.kind !== "image" && (
        <>
          <Row label={isStroke ? "Color" : "Outline"}>
            <ColorInput
              value={obj.strokeWidth || isStroke ? obj.stroke : ""}
              allowNone={!isStroke}
              onChange={(v) =>
                set(v ? { stroke: v, strokeWidth: Math.max(isStroke ? 1 : 3, obj.strokeWidth || 0) } : { strokeWidth: 0 })
              }
              testId="stroke-color"
            />
          </Row>
          {(obj.strokeWidth > 0 || isStroke) && (
            <Row label="Width">
              <Slider value={obj.strokeWidth || 1} min={1} max={item.kind === "draw" ? 80 : 30} onChange={(v) => set({ strokeWidth: v })} />
            </Row>
          )}
        </>
      )}
      <Row label="Shadow">
        <input
          type="checkbox"
          checked={Boolean(obj.shadow)}
          onChange={(e) =>
            set({ shadow: e.target.checked ? { color: "rgba(0,0,0,0.35)", blur: 14, offsetX: 0, offsetY: 4 } : null })
          }
        />
      </Row>
      <Row label="Opacity">
        <Slider value={Math.round(opacity * 100)} min={0} max={100} suffix="%" onChange={(v) => set({ opacity: v / 100 })} />
      </Row>
    </>
  );
};

const AnimationTab = ({ item, actions }) => {
  const [which, setWhich] = useState("in");
  const isText = item.kind === "text";
  const anim = item.anim || {};
  const cur = anim[which] || {};
  const list = which === "in" ? ANIM_IN : which === "out" ? ANIM_OUT : ANIM_LOOP;
  const isEffect = EFFECT_KINDS.has(item.kind);
  return (
    <>
      <Segmented
        value={which}
        onChange={setWhich}
        options={[
          { id: "in", label: "In" },
          { id: "out", label: "Out" },
          ...(isEffect ? [] : [{ id: "loop", label: "Loop" }]),
        ]}
      />
      {isEffect ? (
        <>
          <Row label="Ease">
            <Slider value={cur.duration ?? 0.6} min={0} max={3} step={0.1} suffix="s" onChange={(v) => actions.updateItem(item.id, { anim: { [which]: { duration: v } } })} />
          </Row>
          <Row label="Curve">
            <select value={cur.easing || "easeInOut"} onChange={(e) => actions.updateItem(item.id, { anim: { [which]: { easing: e.target.value } } })}>
              {EASINGS.map((e) => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </Row>
        </>
      ) : (
        <>
          <AnimPicker
            list={list}
            value={cur.type || "none"}
            isText={isText}
            testPrefix={`anim-${which}`}
            onChange={(v) => actions.updateItem(item.id, { anim: { [which]: { type: v } } })}
          />
          {which !== "loop" ? (
            <>
              <Row label="Duration">
                <Slider value={cur.duration ?? 0.4} min={0.1} max={3} step={0.1} suffix="s" onChange={(v) => actions.updateItem(item.id, { anim: { [which]: { duration: v } } })} />
              </Row>
              <Row label="Easing">
                <select value={cur.easing || "easeOut"} onChange={(e) => actions.updateItem(item.id, { anim: { [which]: { easing: e.target.value } } })}>
                  {EASINGS.map((e) => (
                    <option key={e.id} value={e.id}>{e.label}</option>
                  ))}
                </select>
              </Row>
            </>
          ) : (
            <Row label="Speed">
              <Slider value={cur.speed ?? 1} min={0.25} max={4} step={0.25} suffix="x" onChange={(v) => actions.updateItem(item.id, { anim: { loop: { speed: v } } })} />
            </Row>
          )}
        </>
      )}
      <p className={styles.hint}>Press play to preview animations.</p>
    </>
  );
};

const TimingTab = ({ item, actions, duration }) => (
  <>
    <Row label="Start (s)">
      <NumberInput
        value={item.start}
        min={0}
        max={duration}
        onChange={(v) => actions.updateItem(item.id, { start: Math.max(0, Math.min(v, item.end - 0.1)) })}
        testId="timing-start"
      />
    </Row>
    <Row label="End (s)">
      <NumberInput
        value={item.end}
        min={0}
        max={duration}
        onChange={(v) => actions.updateItem(item.id, { end: Math.min(duration, Math.max(v, item.start + 0.1)) })}
        testId="timing-end"
      />
    </Row>
    <Row label="Length">
      <span className={styles.muted}>{(item.end - item.start).toFixed(2)}s</span>
    </Row>
    <div className={styles.inlineBtns}>
      <button onClick={() => actions.updateItem(item.id, { start: 0, end: duration })}>Whole video</button>
      <button onClick={() => actions.reorderItem(item.id, 1)} title="Bring forward"><ToolIcon name="up" size={14} /> Forward</button>
      <button onClick={() => actions.reorderItem(item.id, -1)} title="Send backward"><ToolIcon name="down" size={14} /> Back</button>
    </div>
  </>
);

const Inspector = ({ editor }) => {
  const { selected, selectedObject, actions, duration } = editor;
  const [tab, setTab] = useState("style");

  if (!selected || !selectedObject) {
    return (
      <div className={styles.inspector}>
        <div className={styles.inspectorTitle}>Text &amp; drawing</div>
        <p className={styles.hint}>
          Add text, drawings, shapes, images or effects from the toolbar. Each one gets a bar on the timeline below: drag it to
          move it in time, or drag its ends to change when it appears and disappears.
        </p>
        <ul className={styles.tips}>
          <li><b>Space</b> play / pause</li>
          <li><b>⌘Z / ⇧⌘Z</b> undo / redo</li>
          <li><b>⌫</b> delete selected</li>
          <li><b>⌘D</b> duplicate</li>
          <li><b>Double-click</b> text to edit it in place</li>
        </ul>
      </div>
    );
  }

  return (
    <div className={styles.inspector} data-testid="inspector">
      <div className={styles.inspectorHeader}>
        <div className={styles.inspectorTitle}>{selected.name}</div>
        <button className={styles.iconBtn} onClick={() => actions.removeItem(selected.id)} title="Delete">
          <ToolIcon name="trash" size={16} />
        </button>
      </div>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: "style", label: "Style" },
          { id: "animation", label: "Animation" },
          { id: "timing", label: "Timing" },
        ]}
      />
      <div className={styles.inspectorBody}>
        {tab === "style" && <StyleTab item={selected} obj={selectedObject} actions={actions} />}
        {tab === "animation" && <AnimationTab item={selected} actions={actions} />}
        {tab === "timing" && <TimingTab item={selected} actions={actions} duration={duration} />}
      </div>
    </div>
  );
};

function toHex(color) {
  if (!color || typeof color !== "string") return "#000000";
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) return "#" + color.slice(1).split("").map((c) => c + c).join("");
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  return "#000000";
}

export { Row, ColorInput, Slider, NumberInput, Segmented };
export default Inspector;
