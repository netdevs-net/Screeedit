import { useCallback, useEffect, useRef, useState } from "react";
import {
  Canvas,
  Textbox,
  Path,
  Ellipse,
  FabricImage,
  PencilBrush,
} from "../../annotate/fabricKit";
import {
  createDoc,
  createItem,
  serializeObject,
  baseOf,
  enlivenDoc,
  applyTimeToObjects,
  drawFrameWithEffects,
  EFFECT_KINDS,
  newId,
} from "../../annotate/overlayEngine";
import { findShape, linePath } from "../../annotate/shapes";
import { drawCaptions } from "../../annotate/captions";
import { hasFrame, layoutFrame, loadFrameImage, drawBackdrop } from "../../annotate/frame";

const MAX_HISTORY = 60;
const DEFAULT_ITEM_SECONDS = 3;

export const TEXT_PRESETS = {
  title: {
    name: "Title",
    text: "Title",
    fontSize: 0.075,
    fontFamily: "Satoshi-Bold",
    fill: "#FFFFFF",
    stroke: "#000000",
    strokeWidth: 0,
    shadow: true,
  },
  subtitle: {
    name: "Subtitle",
    text: "Subtitle",
    fontSize: 0.045,
    fontFamily: "Satoshi-Medium",
    fill: "#FFFFFF",
    shadow: true,
  },
  body: {
    name: "Body text",
    text: "Body text",
    fontSize: 0.03,
    fontFamily: "Satoshi-Medium",
    fill: "#FFFFFF",
    shadow: true,
  },
  lowerThird: {
    name: "Lower third",
    text: "Your Name\nTitle, Company",
    fontSize: 0.032,
    fontFamily: "Satoshi-Bold",
    fill: "#FFFFFF",
    backgroundColor: "#3080F8",
    textAlign: "left",
    position: "lowerLeft",
    anim: { in: "slide", out: "slide" },
  },
  label: {
    name: "Label",
    text: "NEW",
    fontSize: 0.03,
    fontFamily: "Satoshi-Bold",
    fill: "#29292F",
    backgroundColor: "#FFD84D",
    anim: { in: "scale", loop: "pulse" },
  },
  headline: {
    name: "Headline",
    text: "Top\nStories\nToday",
    fontSize: 0.06,
    fontFamily: "Satoshi-Bold",
    fill: "#29292F",
    backgroundColor: "#F3D6C4",
    anim: { in: "rise" },
  },
  counter: {
    name: "Counter",
    text: "0",
    fontSize: 0.09,
    fontFamily: "Satoshi-Bold",
    fill: "#FFFFFF",
    shadow: true,
    mode: "counter",
  },
  credits: {
    name: "Scrolling credits",
    text: "Thanks for watching\n\nMade with ScreeEdit",
    fontSize: 0.04,
    fontFamily: "Satoshi-Medium",
    fill: "#FFFFFF",
    shadow: true,
    mode: "scroll",
    anim: { in: "none", out: "none" },
  },
};

const textShadow = { color: "rgba(0,0,0,0.45)", blur: 12, offsetX: 0, offsetY: 3 };

const centerOrigin = (obj) => {
  const c = obj.getCenterPoint();
  obj.set({ originX: "center", originY: "center" });
  obj.setPositionByOrigin(c, "center", "center");
  obj.setCoords();
};

const cloneDoc = (doc) => JSON.parse(JSON.stringify(doc));

export default function useOverlayEditor({ blob, initialDoc, duration }) {
  const videoRef = useRef(null);
  const frameCanvasRef = useRef(null);
  const fabricElRef = useRef(null);
  const stageRef = useRef(null);
  const composeRef = useRef(null);
  const contentRef = useRef(null);
  const backdropCanvasRef = useRef(null);
  const frameImageRef = useRef(null);
  const fitRef = useRef(() => {});
  const fabricRef = useRef(null);
  const objsRef = useRef(new Map());
  const basesRef = useRef(new Map());
  const docRef = useRef(null);
  const rafRef = useRef(null);
  const toolRef = useRef("select");
  const styleRef = useRef({ color: "#FF3B5C", width: 6 });
  const historyRef = useRef({ past: [], future: [] });
  const playingRef = useRef(false);
  const timeRef = useRef(0);
  const dragRef = useRef(null);
  const suppressRef = useRef(false);
  const durationRef = useRef(duration || 0);

  const [doc, setDocState] = useState(null);
  const [size, setSize] = useState(null); // video {w, h}
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setToolState] = useState("select");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(duration || 0);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [drawStyle, setDrawStyleState] = useState(styleRef.current);
  const [, forceRender] = useState(0);

  const setDoc = (next) => {
    docRef.current = next;
    setDocState(next);
  };

  const syncHistoryFlags = () =>
    setHistoryState({
      canUndo: historyRef.current.past.length > 0,
      canRedo: historyRef.current.future.length > 0,
    });

  // Snapshot before a change so undo can return to it.
  const pushHistory = () => {
    if (!docRef.current) return;
    const h = historyRef.current;
    h.past.push(cloneDoc(docRef.current));
    if (h.past.length > MAX_HISTORY) h.past.shift();
    h.future = [];
    syncHistoryFlags();
  };

  // ---------- rendering ----------

  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = frameCanvasRef.current;
    const d = docRef.current;
    if (!video || !canvas || !d || video.readyState < 2) return;
    const ctx = canvas.getContext("2d");
    drawFrameWithEffects(ctx, video, d, objsRef.current, timeRef.current, d.width, d.height);
    drawCaptions(ctx, d.captions, timeRef.current, d.width, d.height);
    const bd = backdropCanvasRef.current;
    if (bd && hasFrame(d.frame)) {
      const L = layoutFrame(d.frame, d.width, d.height);
      if (bd.width !== L.OW || bd.height !== L.OH) {
        bd.width = L.OW;
        bd.height = L.OH;
      }
      drawBackdrop(bd.getContext("2d"), d.frame, L, { source: canvas, image: frameImageRef.current });
    }
  }, []);

  const applyTime = useCallback(() => {
    const fc = fabricRef.current;
    const d = docRef.current;
    if (!fc || !d) return;
    const animate = playingRef.current;
    applyTimeToObjects(d, objsRef.current, basesRef.current, timeRef.current, d.width, d.height, {
      animate,
      hideEffects: animate,
    });
    // Keep the selected object visible while paused even if outside its range.
    const active = fc.getActiveObject();
    if (!animate && active) active.visible = true;
    fc.requestRenderAll();
  }, []);

  const renderNow = useCallback(() => {
    drawFrame();
    applyTime();
  }, [drawFrame, applyTime]);

  const loop = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    timeRef.current = video.currentTime;
    renderNow();
    setTime(video.currentTime);
    if (playingRef.current && !video.paused && !video.ended) {
      rafRef.current = requestAnimationFrame(loop);
    } else {
      playingRef.current = false;
      setPlaying(false);
      renderNow();
    }
  }, [renderNow]);

  // ---------- doc <-> fabric ----------

  const commitObject = (obj, { history = true } = {}) => {
    const d = docRef.current;
    if (!d || !obj?.seId) return;
    if (history) pushHistory();
    const json = serializeObject(obj);
    const items = d.items.map((it) => (it.id === obj.seId ? { ...it, obj: json } : it));
    basesRef.current.set(obj.seId, baseOf(json));
    setDoc({ ...d, items });
  };

  const rebuildCanvas = async (nextDoc) => {
    const fc = fabricRef.current;
    if (!fc) return;
    suppressRef.current = true;
    fc.discardActiveObject();
    fc.remove(...fc.getObjects());
    const objs = await enlivenDoc(nextDoc);
    objsRef.current = objs;
    basesRef.current = new Map(nextDoc.items.map((i) => [i.id, baseOf(i.obj)]));
    for (const item of nextDoc.items) {
      const o = objs.get(item.id);
      if (o) {
        prepObject(o, item.kind);
        fc.add(o);
      }
    }
    suppressRef.current = false;
    frameImageRef.current = await loadFrameImage(nextDoc.frame);
    fitRef.current();
    renderNow();
  };

  const prepObject = (obj, kind) => {
    obj.set({
      borderColor: "#3080F8",
      cornerColor: "#FFFFFF",
      cornerStrokeColor: "#3080F8",
      cornerStyle: "circle",
      transparentCorners: false,
      cornerSize: 12,
      padding: 4,
    });
    if (EFFECT_KINDS.has(kind)) obj.set({ lockRotation: true });
  };

  const addItem = (kind, obj, opts = {}) => {
    const d = docRef.current;
    const fc = fabricRef.current;
    if (!d || !fc) return null;
    pushHistory();
    const total = durationRef.current || 0;
    let start = Math.max(0, Math.min(timeRef.current, Math.max(0, total - 0.5)));
    let end = Math.min(total, start + (opts.seconds || DEFAULT_ITEM_SECONDS));
    if (end - start < 0.5) start = Math.max(0, end - 0.5);
    if (opts.fullLength) {
      start = 0;
      end = total;
    }
    centerOrigin(obj);
    prepObject(obj, kind);
    const item = createItem(kind, obj, { start, end, name: opts.name, ...(opts.extra || {}) });
    if (opts.anim) {
      if (opts.anim.in) item.anim.in.type = opts.anim.in;
      if (opts.anim.out) item.anim.out.type = opts.anim.out;
      if (opts.anim.loop) item.anim.loop.type = opts.anim.loop;
    }
    if (opts.textMode && item.text) item.text.mode = opts.textMode;
    objsRef.current.set(item.id, obj);
    basesRef.current.set(item.id, baseOf(item.obj));
    suppressRef.current = true;
    fc.add(obj);
    fc.setActiveObject(obj);
    suppressRef.current = false;
    setDoc({ ...d, items: [...d.items, item] });
    setSelectedId(item.id);
    setTool("select");
    renderNow();
    return item;
  };

  // ---------- init ----------

  useEffect(() => {
    if (!blob) return;
    const video = videoRef.current;
    const url = URL.createObjectURL(blob);
    video.src = url;
    const onMeta = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (Number.isFinite(video.duration)) {
        durationRef.current = video.duration;
        setVideoDuration(video.duration);
      }
      setSize({ w, h });
    };
    const onSeeked = () => {
      timeRef.current = video.currentTime;
      renderNow();
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadeddata", onSeeked);
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", onSeeked);
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  useEffect(() => {
    if (!size || fabricRef.current) return;
    const frame = frameCanvasRef.current;
    frame.width = size.w;
    frame.height = size.h;
    const fc = new Canvas(fabricElRef.current, {
      width: size.w,
      height: size.h,
      enableRetinaScaling: false,
      preserveObjectStacking: true,
      selectionColor: "rgba(48,128,248,0.08)",
      selectionBorderColor: "#3080F8",
    });
    fabricRef.current = fc;

    const startDoc =
      initialDoc && initialDoc.items
        ? { ...cloneDoc(initialDoc), width: size.w, height: size.h }
        : createDoc(size.w, size.h);
    setDoc(startDoc);
    rebuildCanvas(startDoc);
    // Canvas text measures with whatever font is loaded; re-measure once the
    // editor fonts arrive.
    document.fonts?.ready.then(() => {
      fc.getObjects().forEach((o) => o.initDimensions?.());
      renderNow();
    });

    fc.on("selection:created", (e) => !suppressRef.current && setSelectedId(e.selected?.[0]?.seId || null));
    fc.on("selection:updated", (e) => !suppressRef.current && setSelectedId(e.selected?.[0]?.seId || null));
    fc.on("selection:cleared", () => !suppressRef.current && setSelectedId(null));
    fc.on("object:modified", (e) => {
      const obj = e.target;
      if (obj?.type === "activeselection" || obj?.type === "activeSelection") {
        pushHistory();
        obj.getObjects().forEach((o) => commitObject(o, { history: false }));
        return;
      }
      commitObject(obj);
    });
    fc.on("text:editing:exited", (e) => commitObject(e.target));
    fc.on("path:created", (e) => {
      const path = e.path;
      fc.remove(path);
      const kind = toolRef.current === "highlighter" ? "draw" : "draw";
      addItem(kind, path, {
        name: toolRef.current === "highlighter" ? "Highlight" : "Drawing",
        anim: { in: "none", out: "fade" },
      });
      // Stay in the drawing tool for the next stroke.
      setTool(toolRef.current === "select" ? "pen" : toolRef.current, { keepSelection: true });
    });

    // Drag-to-draw arrows and lines.
    fc.on("mouse:down", (opt) => {
      const t = toolRef.current;
      if (t !== "arrow" && t !== "line" && t !== "doubleArrow") return;
      const p = fc.getScenePoint(opt.e);
      dragRef.current = { x1: p.x, y1: p.y, preview: null };
    });
    fc.on("mouse:move", (opt) => {
      const drag = dragRef.current;
      if (!drag) return;
      const p = fc.getScenePoint(opt.e);
      if (drag.preview) fc.remove(drag.preview);
      drag.preview = makeLine(drag.x1, drag.y1, p.x, p.y, toolRef.current);
      drag.preview.set({ selectable: false, evented: false });
      fc.add(drag.preview);
      fc.requestRenderAll();
    });
    fc.on("mouse:up", (opt) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      if (drag.preview) fc.remove(drag.preview);
      const p = fc.getScenePoint(opt.e);
      if (Math.hypot(p.x - drag.x1, p.y - drag.y1) < 8) return;
      const t = toolRef.current;
      const obj = makeLine(drag.x1, drag.y1, p.x, p.y, t);
      addItem("arrow", obj, {
        name: t === "line" ? "Line" : "Arrow",
        anim: { in: "fade", out: "fade" },
      });
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      fc.dispose();
      fabricRef.current = null;
    };
  }, [size]);

  // Fit the composition (backdrop + video) into the stage. The video layer
  // sits at its place inside the backdrop; both canvases keep full
  // resolution and are scaled with CSS.
  useEffect(() => {
    if (!size) return;
    const stage = stageRef.current;
    const fit = () => {
      const fc = fabricRef.current;
      const d = docRef.current;
      if (!stage || !fc || !d) return;
      const framed = hasFrame(d.frame);
      const L = layoutFrame(d.frame, size.w, size.h);
      const box = stage.getBoundingClientRect();
      const scale = Math.min(box.width / L.OW, box.height / L.OH);
      const compose = composeRef.current;
      compose.style.width = `${Math.floor(L.OW * scale)}px`;
      compose.style.height = `${Math.floor(L.OH * scale)}px`;
      backdropCanvasRef.current.style.display = framed ? "block" : "none";
      const c = L.content;
      const cssW = Math.floor(c.w * scale);
      const cssH = Math.floor(c.h * scale);
      const content = contentRef.current;
      Object.assign(content.style, {
        left: `${Math.round(c.x * scale)}px`,
        top: `${Math.round(c.y * scale)}px`,
        width: `${cssW}px`,
        height: `${cssH}px`,
        borderRadius: framed ? L.contentRadii.map((r) => `${r * scale}px`).join(" ") : "",
        boxShadow: framed ? "none" : "",
      });
      fc.setDimensions({ width: `${cssW}px`, height: `${cssH}px` }, { cssOnly: true });
      const frame = frameCanvasRef.current;
      frame.style.width = `${cssW}px`;
      frame.style.height = `${cssH}px`;
      fc.calcOffset();
      forceRender((n) => n + 1);
    };
    fitRef.current = fit;
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [size, doc === null]);

  // ---------- helpers ----------

  const makeLine = (x1, y1, x2, y2, t) => {
    const width = styleRef.current.width;
    const path = new Path(
      linePath(x1, y1, x2, y2, {
        head: t === "line" ? "none" : t === "doubleArrow" ? "both" : "end",
        width,
      }),
      {
        stroke: styleRef.current.color,
        strokeWidth: width,
        fill: "",
        strokeLineCap: "round",
        strokeLineJoin: "round",
        strokeUniform: true,
        objectCaching: false,
      },
    );
    return path;
  };

  const setTool = (next, { keepSelection = false } = {}) => {
    const fc = fabricRef.current;
    toolRef.current = next;
    setToolState(next);
    if (!fc) return;
    const drawing = next === "pen" || next === "highlighter";
    fc.isDrawingMode = drawing;
    const lineTool = next === "arrow" || next === "line" || next === "doubleArrow";
    fc.selection = next === "select";
    fc.skipTargetFind = lineTool;
    fc.defaultCursor = lineTool ? "crosshair" : "default";
    if (drawing) {
      const brush = new PencilBrush(fc);
      const { color, width } = styleRef.current;
      if (next === "highlighter") {
        brush.color = hexToRgba(color, 0.4);
        brush.width = Math.max(18, width * 4);
        brush.strokeLineCap = "butt";
      } else {
        brush.color = color;
        brush.width = width;
      }
      brush.decimate = 2;
      fc.freeDrawingBrush = brush;
    }
    if (!keepSelection && next !== "select") fc.discardActiveObject();
    fc.requestRenderAll();
  };

  const setDrawStyle = (patch) => {
    styleRef.current = { ...styleRef.current, ...patch };
    setDrawStyleState(styleRef.current);
    if (toolRef.current === "pen" || toolRef.current === "highlighter") setTool(toolRef.current);
  };

  // ---------- public actions ----------

  const addText = (presetId = "title") => {
    const d = docRef.current;
    if (!d) return;
    const p = TEXT_PRESETS[presetId] || TEXT_PRESETS.title;
    const fontSize = Math.round(p.fontSize * d.height);
    const tb = new Textbox(p.text, {
      left: d.width / 2,
      top: d.height / 2,
      originX: "center",
      originY: "center",
      width: Math.round(d.width * (presetId === "lowerThird" ? 0.36 : 0.6)),
      fontSize,
      fontFamily: p.fontFamily,
      fontWeight: "normal",
      fill: p.fill,
      textAlign: p.textAlign || "center",
      backgroundColor: p.backgroundColor || "",
      stroke: p.stroke || null,
      strokeWidth: p.strokeWidth || 0,
      paintFirst: "stroke",
      lineHeight: 1.1,
      shadow: p.shadow ? { ...textShadow } : null,
      splitByGrapheme: false,
      padding: p.backgroundColor ? Math.round(fontSize * 0.35) : 4,
    });
    if (p.position === "lowerLeft") {
      tb.set({ left: d.width * 0.06 + tb.width / 2, top: d.height * 0.82 });
    }
    return addItem("text", tb, {
      name: p.name,
      anim: p.anim,
      textMode: p.mode,
      seconds: p.mode === "scroll" ? 6 : DEFAULT_ITEM_SECONDS,
    });
  };

  const addShape = (shapeId) => {
    const d = docRef.current;
    const shape = findShape(shapeId);
    if (!d || !shape) return;
    const color = styleRef.current.color;
    const box = shape.box || 100;
    let obj;
    if (shape.ellipse) {
      obj = new Ellipse({ rx: 50, ry: 50, fill: color, strokeUniform: true, strokeWidth: 0 });
    } else {
      obj = new Path(shape.path, { fill: color, strokeUniform: true, strokeWidth: 0, objectCaching: false });
    }
    const targetW = shape.progress ? d.width * 0.8 : d.width * 0.18;
    const sx = targetW / box;
    const sy = shape.progress ? (d.width * 0.8 * (shape.aspect || 0.06)) / 100 : sx;
    obj.set({
      scaleX: sx,
      scaleY: sy,
      left: d.width / 2 - (box * sx) / 2,
      top: (shape.progress ? d.height * 0.9 : d.height / 2) - (100 * sy) / 2,
    });
    return addItem("shape", obj, {
      name: shape.label,
      extra: { shapeId, progress: Boolean(shape.progress) },
      anim: shape.progress ? { in: "none", out: "none" } : { in: "scale", out: "fade" },
      fullLength: Boolean(shape.progress),
    });
  };

  const addImage = async (file) => {
    const d = docRef.current;
    if (!d || !file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img = await FabricImage.fromURL(dataUrl);
    const scale = Math.min((d.width * 0.3) / img.width, (d.height * 0.4) / img.height);
    img.set({
      scaleX: scale,
      scaleY: scale,
      left: d.width / 2 - (img.width * scale) / 2,
      top: d.height / 2 - (img.height * scale) / 2,
    });
    return addItem("image", img, { name: file.name || "Image", anim: { in: "scale", out: "fade" } });
  };

  const addEffect = (kind) => {
    const d = docRef.current;
    if (!d) return;
    const colors = {
      blur: "rgba(48,128,248,0.10)",
      focus: "rgba(255,216,77,0.10)",
      zoom: "rgba(46,204,113,0.10)",
    };
    const w = d.width * (kind === "zoom" ? 0.45 : 0.3);
    const h = kind === "zoom" ? w * (d.height / d.width) : d.height * 0.2;
    const obj = new Path("M 0 0 H 100 V 100 H 0 Z", {
      fill: colors[kind],
      stroke: "#3080F8",
      strokeWidth: 2,
      strokeDashArray: [8, 6],
      strokeUniform: true,
      scaleX: w / 100,
      scaleY: h / 100,
      left: d.width / 2 - w / 2,
      top: d.height / 2 - h / 2,
      objectCaching: false,
    });
    const names = { blur: "Blur", focus: "Focus", zoom: "Zoom" };
    return addItem(kind, obj, { name: names[kind] });
  };

  const getSelected = () => docRef.current?.items.find((i) => i.id === selectedId) || null;
  const getSelectedObject = () => (selectedId ? objsRef.current.get(selectedId) : null);

  // Patch fabric props on the selected object (style panel).
  const updateObject = (props) => {
    const obj = getSelectedObject();
    if (!obj) return;
    obj.set(props);
    if (obj.initDimensions && ("fontSize" in props || "fontFamily" in props || "text" in props))
      obj.initDimensions();
    obj.setCoords();
    commitObject(obj);
    renderNow();
  };

  // Patch item-level settings (timing, animation, text mode, effect).
  const updateItem = (id, patch, { history = true } = {}) => {
    const d = docRef.current;
    if (!d) return;
    if (history) pushHistory();
    const items = d.items.map((it) => (it.id === id ? deepMerge(it, patch) : it));
    setDoc({ ...d, items });
    // docRef is updated synchronously so the next frame uses new settings.
    renderNow();
  };

  const removeItem = (id = selectedId) => {
    const d = docRef.current;
    const fc = fabricRef.current;
    if (!d || !id) return;
    pushHistory();
    const obj = objsRef.current.get(id);
    if (obj) fc.remove(obj);
    objsRef.current.delete(id);
    basesRef.current.delete(id);
    fc.discardActiveObject();
    setDoc({ ...d, items: d.items.filter((i) => i.id !== id) });
    setSelectedId(null);
    renderNow();
  };

  const duplicateItem = async (id = selectedId) => {
    const d = docRef.current;
    const fc = fabricRef.current;
    const item = d?.items.find((i) => i.id === id);
    if (!item) return;
    pushHistory();
    const copy = cloneDoc(item);
    copy.id = newId();
    copy.name = `${item.name} copy`;
    copy.obj.left += d.width * 0.03;
    copy.obj.top += d.height * 0.03;
    copy.obj.seId = copy.id;
    const [obj] = await enlivenDoc({ items: [copy] }).then((m) => [...m.values()]);
    prepObject(obj, copy.kind);
    objsRef.current.set(copy.id, obj);
    basesRef.current.set(copy.id, baseOf(copy.obj));
    fc.add(obj);
    fc.setActiveObject(obj);
    setDoc({ ...d, items: [...d.items, copy] });
    setSelectedId(copy.id);
    renderNow();
  };

  // Reorder stacking: dir +1 brings forward, -1 sends backward.
  const reorderItem = (id, dir) => {
    const d = docRef.current;
    const fc = fabricRef.current;
    const idx = d?.items.findIndex((i) => i.id === id);
    if (idx == null || idx < 0) return;
    const to = Math.max(0, Math.min(d.items.length - 1, idx + dir));
    if (to === idx) return;
    pushHistory();
    const items = [...d.items];
    const [it] = items.splice(idx, 1);
    items.splice(to, 0, it);
    const obj = objsRef.current.get(id);
    if (obj) fc.moveObjectTo(obj, to);
    setDoc({ ...d, items });
    renderNow();
  };

  const selectItem = (id) => {
    const fc = fabricRef.current;
    const item = docRef.current?.items.find((i) => i.id === id);
    if (!fc || !item) return;
    const obj = objsRef.current.get(id);
    if (timeRef.current < item.start || timeRef.current >= item.end) {
      seek(item.start + Math.min(0.5, (item.end - item.start) / 2));
    }
    setTool("select");
    if (obj) {
      suppressRef.current = true;
      fc.setActiveObject(obj);
      suppressRef.current = false;
    }
    setSelectedId(id);
    renderNow();
  };

  const seek = (t) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(t, (durationRef.current || video.duration || 0) - 0.001));
    video.currentTime = clamped;
    timeRef.current = clamped;
    setTime(clamped);
    renderNow();
  };

  const play = () => {
    const video = videoRef.current;
    const fc = fabricRef.current;
    if (!video || !fc) return;
    if (video.ended || video.currentTime >= (durationRef.current || video.duration) - 0.05) {
      video.currentTime = 0;
    }
    fc.discardActiveObject();
    fc.isDrawingMode = false;
    fc.skipTargetFind = true;
    playingRef.current = true;
    setPlaying(true);
    video.play().then(() => {
      rafRef.current = requestAnimationFrame(loop);
    }).catch(() => {
      playingRef.current = false;
      setPlaying(false);
    });
  };

  const pause = () => {
    const video = videoRef.current;
    playingRef.current = false;
    setPlaying(false);
    if (video) video.pause();
    cancelAnimationFrame(rafRef.current);
    setTool(toolRef.current);
    renderNow();
  };

  const undo = async () => {
    const h = historyRef.current;
    if (!h.past.length) return;
    h.future.push(cloneDoc(docRef.current));
    const prev = h.past.pop();
    syncHistoryFlags();
    setDoc(prev);
    setSelectedId(null);
    await rebuildCanvas(prev);
  };

  const redo = async () => {
    const h = historyRef.current;
    if (!h.future.length) return;
    h.past.push(cloneDoc(docRef.current));
    const next = h.future.pop();
    syncHistoryFlags();
    setDoc(next);
    setSelectedId(null);
    await rebuildCanvas(next);
  };

  // Captions live on the doc, not as a fabric item. Pass null to remove them.
  const setCaptions = (captions, { history = true } = {}) => {
    const d = docRef.current;
    if (!d) return;
    if (history) pushHistory();
    const next = { ...d };
    if (captions) next.captions = captions;
    else delete next.captions;
    setDoc(next);
    renderNow();
  };

  // Backdrop / device frame on the doc. Pass null to remove it.
  const setFrame = (frame, { history = true } = {}) => {
    const d = docRef.current;
    if (!d) return;
    if (history) pushHistory();
    const next = { ...d };
    if (frame) next.frame = frame;
    else delete next.frame;
    setDoc(next);
    loadFrameImage(frame).then((img) => {
      frameImageRef.current = img;
      renderNow();
    });
    fitRef.current();
    renderNow();
  };

  const isEditingText = () => Boolean(fabricRef.current?.getActiveObject()?.isEditing);

  // Final doc for export, with each object's current resting pose.
  const exportDoc = () => cloneDoc(docRef.current);

  return {
    refs: { videoRef, frameCanvasRef, fabricElRef, stageRef, composeRef, contentRef, backdropCanvasRef },
    doc,
    size,
    duration: videoDuration,
    time,
    playing,
    tool,
    drawStyle,
    selectedId,
    selected: getSelected(),
    selectedObject: getSelectedObject(),
    history: historyState,
    actions: {
      setTool,
      setDrawStyle,
      addText,
      addShape,
      addImage,
      addEffect,
      updateObject,
      updateItem,
      removeItem,
      duplicateItem,
      reorderItem,
      selectItem,
      seek,
      play,
      pause,
      undo,
      redo,
      isEditingText,
      exportDoc,
      setCaptions,
      setFrame,
    },
  };
}

function deepMerge(target, patch) {
  const out = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object"
        ? deepMerge(target[k], v)
        : v;
  }
  return out;
}

function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
