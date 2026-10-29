import React, { useMemo, useState } from "react";
import styles from "../../styles/annotate/_Annotate.module.scss";
import { Row, ColorInput, Slider, NumberInput, Segmented } from "./Inspector";
import { ToolIcon } from "./icons";
import {
  CAPTION_STYLES,
  CAPTION_FONTS,
  buildChunks,
  createCaptions,
  defaultCaptionStyle,
  editChunkText,
  hasCaptions,
  toSubtitles,
} from "../../annotate/captions";
import { transcribe, WHISPER_MODELS, LANGUAGES, DEFAULT_MODEL } from "../../annotate/transcribe";

const SETTINGS_KEY = "screeedit.captions.settings";
const loadSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
};
const saveSettings = (s) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Settings are a convenience; ignore storage failures.
  }
};

const fmt = (t) => {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, "0")}`;
};

const mb = (b) => `${Math.round(b / 1e6)} MB`;

const statusText = (s) => {
  if (!s) return "";
  if (s.stage === "audio") return "Reading audio…";
  if (s.stage === "download")
    return s.total ? `Downloading model ${mb(s.loaded)} / ${mb(s.total)}` : "Downloading model…";
  return "Transcribing… this can take a minute";
};

const download = (text, name, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Side panel for word-by-word captions: generate, restyle, fix the text.
const CaptionsPanel = ({ editor, sourceBlob, onClose }) => {
  const { doc, actions, time } = editor;
  const captions = doc?.captions;
  const [settings, setSettingsState] = useState(() => ({
    provider: "browser",
    model: DEFAULT_MODEL,
    language: "auto",
    serverUrl: "http://localhost:8000",
    ...loadSettings(),
  }));
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("style");

  const setSettings = (patch) =>
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });

  const style = { ...defaultCaptionStyle(), ...captions?.style };
  const setStyle = (patch) => actions.setCaptions({ ...captions, style: { ...style, ...patch } });

  const chunks = useMemo(
    () => (hasCaptions(captions) ? buildChunks(captions.words, style.maxWords) : []),
    [captions, style.maxWords],
  );
  const offset = captions?.offset || 0;
  const activeChunk = chunks.findIndex((c) => time - offset >= c.start && time - offset < c.end);

  const generate = async () => {
    setError(null);
    setStatus({ stage: "audio" });
    try {
      const words = await transcribe(sourceBlob, { ...settings, onProgress: setStatus });
      const next = createCaptions(words);
      // Regenerating keeps the look the user already picked.
      if (captions?.style) next.style = { ...next.style, ...captions.style };
      actions.setCaptions(next);
      setTab("style");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setStatus(null);
    }
  };

  const busy = Boolean(status);

  const generator = (
    <>
      <Row label="Engine">
        <select
          value={settings.provider}
          onChange={(e) => setSettings({ provider: e.target.value })}
          disabled={busy}
          data-testid="captions-provider"
        >
          <option value="browser">On this computer</option>
          <option value="server">Whisper server</option>
        </select>
      </Row>
      {settings.provider === "browser" ? (
        <Row label="Model">
          <select
            value={settings.model}
            onChange={(e) => setSettings({ model: e.target.value })}
            disabled={busy}
            data-testid="captions-model"
          >
            {WHISPER_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Row>
      ) : (
        <Row label="Server URL">
          <input
            className={styles.textInput}
            value={settings.serverUrl}
            onChange={(e) => setSettings({ serverUrl: e.target.value })}
            placeholder="http://localhost:8000"
            disabled={busy}
            data-testid="captions-server"
          />
        </Row>
      )}
      <Row label="Language">
        <select
          value={settings.language}
          onChange={(e) => setSettings({ language: e.target.value })}
          disabled={busy}
          data-testid="captions-language"
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </Row>
      <button
        className={`button primaryButton ${styles.fullBtn}`}
        onClick={generate}
        disabled={busy || !sourceBlob}
        data-testid="captions-generate"
      >
        {busy ? statusText(status) : hasCaptions(captions) ? "Regenerate captions" : "Generate captions"}
      </button>
      {settings.provider === "browser" && !busy && (
        <p className={styles.hint}>
          Speech recognition runs on this computer. The model downloads once, then works offline. Nothing is uploaded.
        </p>
      )}
      {error && (
        <div className={styles.inlineError} data-testid="captions-error">
          {error}
        </div>
      )}
    </>
  );

  return (
    <div className={styles.inspector} data-testid="captions-panel">
      <div className={styles.inspectorHeader}>
        <div className={styles.inspectorTitle}>Captions</div>
        <button className={styles.iconBtn} onClick={onClose} title="Close">
          <ToolIcon name="close" size={16} />
        </button>
      </div>

      {!hasCaptions(captions) ? (
        <div className={styles.inspectorBody}>
          <p className={styles.hint}>
            Turn speech into word-by-word animated captions. You can fix any word and restyle them afterwards.
          </p>
          {generator}
        </div>
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { id: "style", label: "Style" },
              { id: "text", label: "Text" },
              { id: "generate", label: "Settings" },
            ]}
          />
          {tab === "style" && (
            <div className={styles.inspectorBody}>
              <div className={styles.animGrid}>
                {CAPTION_STYLES.map((s) => (
                  <button
                    key={s.id}
                    className={`${styles.animBtn} ${style.preset === s.id ? styles.animActive : ""}`}
                    onClick={() => setStyle({ preset: s.id })}
                    title={s.hint}
                    data-testid={`caption-style-${s.id}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <Row label="Font">
                <select value={style.fontFamily} onChange={(e) => setStyle({ fontFamily: e.target.value })}>
                  {CAPTION_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f.replace("Satoshi-", "Satoshi ")}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Size">
                <Slider
                  value={Math.round(style.size * 1000) / 10}
                  min={2}
                  max={12}
                  step={0.5}
                  suffix="%"
                  onChange={(v) => setStyle({ size: v / 100 })}
                  testId="caption-size"
                />
              </Row>
              <Row label="Text">
                <ColorInput value={style.color} onChange={(v) => setStyle({ color: v || "#FFFFFF" })} />
              </Row>
              {style.preset !== "classic" && style.preset !== "single" && (
                <Row label="Highlight">
                  <ColorInput
                    value={style.highlight}
                    onChange={(v) => setStyle({ highlight: v || "#FFD84D" })}
                    testId="caption-highlight"
                  />
                </Row>
              )}
              <Row label="Outline">
                <ColorInput value={style.outline} onChange={(v) => setStyle({ outline: v || "#000000" })} />
              </Row>
              <Row label="Outline width">
                <Slider
                  value={Math.round(style.outlineWidth * 100)}
                  min={0}
                  max={30}
                  onChange={(v) => setStyle({ outlineWidth: v / 100 })}
                />
              </Row>
              <Row label="Background">
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={style.background}
                    onChange={(e) => setStyle({ background: e.target.checked })}
                    data-testid="caption-background"
                  />
                  Box behind text
                </label>
              </Row>
              {style.background && (
                <>
                  <Row label="Box color">
                    <ColorInput value={style.backgroundColor} onChange={(v) => setStyle({ backgroundColor: v || "#000000" })} />
                  </Row>
                  <Row label="Box opacity">
                    <Slider
                      value={style.backgroundOpacity}
                      min={0.1}
                      max={1}
                      step={0.05}
                      onChange={(v) => setStyle({ backgroundOpacity: v })}
                    />
                  </Row>
                </>
              )}
              <Row label="Uppercase">
                <label className={styles.check}>
                  <input type="checkbox" checked={style.uppercase} onChange={(e) => setStyle({ uppercase: e.target.checked })} />
                  ALL CAPS
                </label>
              </Row>
              <Row label="Position">
                <Slider
                  value={Math.round(style.position * 100)}
                  min={8}
                  max={95}
                  suffix="%"
                  onChange={(v) => setStyle({ position: v / 100 })}
                  testId="caption-position"
                />
              </Row>
              {style.preset !== "single" && (
                <Row label="Words per line">
                  <Slider value={style.maxWords} min={1} max={10} onChange={(v) => setStyle({ maxWords: v })} />
                </Row>
              )}
              <Row label="Sync (s)">
                <NumberInput
                  value={offset}
                  step={0.05}
                  onChange={(v) => actions.setCaptions({ ...captions, offset: v })}
                  testId="caption-offset"
                />
              </Row>
            </div>
          )}

          {tab === "text" && (
            <div className={styles.inspectorBody}>
              <p className={styles.hint}>Click a time to jump there. Edit a line to fix its words.</p>
              <div className={styles.captionList} data-testid="caption-list">
                {chunks.map((c, i) => {
                  const text = captions.words
                    .slice(c.from, c.to + 1)
                    .map((w) => w.text.trim())
                    .join(" ");
                  return (
                    <div
                      key={`${c.from}-${c.start}-${text}`}
                      className={`${styles.captionLine} ${i === activeChunk ? styles.captionLineActive : ""}`}
                    >
                      <button className={styles.captionTime} onClick={() => actions.seek(c.start + offset + 0.01)}>
                        {fmt(c.start + offset)}
                      </button>
                      <input
                        className={styles.textInput}
                        defaultValue={text}
                        data-testid={`caption-line-${i}`}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v === text) return;
                          const words = v
                            ? editChunkText(captions.words, c, v)
                            : [...captions.words.slice(0, c.from), ...captions.words.slice(c.to + 1)];
                          actions.setCaptions(words.length ? { ...captions, words } : null);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "generate" && <div className={styles.inspectorBody}>{generator}</div>}

          <div className={styles.inlineBtns}>
            <button onClick={() => download(toSubtitles(captions, "srt"), "captions.srt", "application/x-subrip")} data-testid="captions-srt">
              Download .srt
            </button>
            <button onClick={() => download(toSubtitles(captions, "vtt"), "captions.vtt", "text/vtt")}>
              Download .vtt
            </button>
          </div>
          <button className={styles.linkBtn} onClick={() => actions.setCaptions(null)} data-testid="captions-remove">
            Remove captions
          </button>
        </>
      )}
    </div>
  );
};

export default CaptionsPanel;
