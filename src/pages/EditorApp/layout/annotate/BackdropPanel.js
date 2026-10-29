import React, { useRef } from "react";
import styles from "../../styles/annotate/_Annotate.module.scss";
import { Row, ColorInput, Slider, Segmented } from "./Inspector";
import { ToolIcon } from "./icons";
import { ASPECTS, GRADIENTS, SOLIDS, DEVICES, defaultFrame, hasFrame } from "../../annotate/frame";

const MAX_IMAGE_SIDE = 1920;

// Reads an image file and shrinks it so the doc (and undo history) stay small.
const readImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const s = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.9));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

// The panel's card and header, left out when embedded in another panel.
const Shell = ({ embedded, onClose, children }) =>
  embedded ? (
    <div className={styles.inspectorBody} data-testid="backdrop-panel">
      {children}
    </div>
  ) : (
    <div className={styles.inspector} data-testid="backdrop-panel">
      <div className={styles.inspectorHeader}>
        <div className={styles.inspectorTitle}>Backdrop</div>
        <button className={styles.iconBtn} onClick={onClose} title="Close">
          <ToolIcon name="close" size={16} />
        </button>
      </div>
      {children}
    </div>
  );

const gradientCss = (g) => `linear-gradient(135deg, ${g.stops.join(", ")})`;

// Side panel for backdrops: output shape, background, device mockup.
const BackdropPanel = ({ editor, onClose, hideAspect = false, embedded = false }) => {
  const { doc, actions } = editor;
  const frame = doc?.frame;
  const fileRef = useRef(null);

  const set = (patch) => actions.setFrame({ ...frame, ...patch });
  const setBg = (patch) => set({ background: { ...frame.background, ...patch } });

  if (!hasFrame(frame)) {
    return (
      <Shell embedded={embedded} onClose={onClose}>
        <p className={styles.hint}>
          Put your recording on a background, change its shape for social media, or show it inside a browser, laptop or
          phone.
        </p>
        <button
          className={`button primaryButton ${styles.fullBtn}`}
          onClick={() => actions.setFrame(defaultFrame())}
          data-testid="backdrop-add"
        >
          Add backdrop
        </button>
      </Shell>
    );
  }

  const bg = frame.background;
  const hasChromeTheme = ["browser", "window", "macbook"].includes(frame.device);

  return (
    <Shell embedded={embedded} onClose={onClose}>
      <div className={styles.inspectorBody}>
        {!hideAspect && (
          <>
            <div className={styles.sectionTitle}>Shape</div>
            <div className={styles.animGrid}>
              {ASPECTS.map((a) => (
                <button
                  key={a.id}
                  className={`${styles.animBtn} ${frame.aspect === a.id ? styles.animActive : ""}`}
                  onClick={() => set({ aspect: a.id })}
                  data-testid={`aspect-${a.id}`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className={styles.sectionTitle}>Background</div>
        <Segmented
          value={bg.type}
          onChange={(type) => setBg({ type })}
          options={[
            { id: "gradient", label: "Gradient" },
            { id: "color", label: "Color" },
            { id: "image", label: "Image" },
            { id: "video", label: "Video blur" },
          ]}
        />
        {bg.type === "gradient" && (
          <div className={styles.bgGrid}>
            {GRADIENTS.map((g) => (
              <button
                key={g.id}
                className={`${styles.bgSwatch} ${bg.gradient === g.id ? styles.bgSwatchActive : ""}`}
                style={{ background: gradientCss(g) }}
                onClick={() => setBg({ gradient: g.id })}
                title={g.id}
                data-testid={`gradient-${g.id}`}
              />
            ))}
          </div>
        )}
        {bg.type === "color" && (
          <>
            <div className={styles.bgGrid}>
              {SOLIDS.map((c) => (
                <button
                  key={c}
                  className={`${styles.bgSwatch} ${bg.color === c ? styles.bgSwatchActive : ""}`}
                  style={{ background: c }}
                  onClick={() => setBg({ color: c })}
                  aria-label={c}
                />
              ))}
            </div>
            <Row label="Custom">
              <ColorInput value={bg.color} onChange={(v) => setBg({ color: v || "#000000" })} />
            </Row>
          </>
        )}
        {bg.type === "image" && (
          <>
            <button className={styles.uploadBtn} onClick={() => fileRef.current?.click()} data-testid="backdrop-image-btn">
              {bg.image ? (
                <img src={bg.image} alt="" />
              ) : (
                <>
                  <ToolIcon name="image" />
                  <span>Choose an image</span>
                </>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              data-testid="backdrop-image-input"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setBg({ image: await readImage(f) });
              }}
            />
            <Row label="Blur">
              <Slider value={bg.blur || 0} min={0} max={60} onChange={(v) => setBg({ blur: v })} />
            </Row>
          </>
        )}
        {bg.type === "video" && <p className={styles.hint}>A blurred, enlarged copy of the video fills the space.</p>}

        <div className={styles.sectionTitle}>Device</div>
        <div className={styles.animGrid}>
          {DEVICES.map((d) => (
            <button
              key={d.id}
              className={`${styles.animBtn} ${frame.device === d.id ? styles.animActive : ""}`}
              onClick={() => set({ device: d.id })}
              data-testid={`device-${d.id}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {hasChromeTheme && (
          <Row label="Theme">
            <Segmented
              value={frame.theme}
              onChange={(theme) => set({ theme })}
              options={[
                { id: "light", label: "Light" },
                { id: "dark", label: "Dark" },
              ]}
            />
          </Row>
        )}
        {frame.device === "browser" && (
          <Row label="Address">
            <input
              className={styles.textInput}
              defaultValue={frame.url || "example.com"}
              onBlur={(e) => set({ url: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              data-testid="backdrop-url"
            />
          </Row>
        )}

        <div className={styles.sectionTitle}>Layout</div>
        <Row label="Padding">
          <Slider
            value={Math.round(frame.padding * 100)}
            min={0}
            max={25}
            suffix="%"
            onChange={(v) => set({ padding: v / 100 })}
            testId="backdrop-padding"
          />
        </Row>
        {frame.device === "none" && (
          <Row label="Corners">
            <Slider
              value={Math.round(frame.radius * 1000) / 10}
              min={0}
              max={8}
              step={0.5}
              onChange={(v) => set({ radius: v / 100 })}
            />
          </Row>
        )}
        <Row label="Shadow">
          <Slider value={frame.shadow} min={0} max={1} step={0.05} onChange={(v) => set({ shadow: v })} />
        </Row>
        <button className={styles.linkBtn} onClick={() => actions.setFrame(null)} data-testid="backdrop-remove">
          Remove backdrop
        </button>
      </div>
    </Shell>
  );
};

export default BackdropPanel;
