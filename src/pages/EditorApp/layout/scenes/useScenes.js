import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAIN_SOURCE,
  activeAt,
  buildTimeline,
  cloneScene,
  createClipScene,
  createProject,
  createTitleScene,
  gainAt,
  localTime,
  projectSize,
  renderProjectFrame,
  splitScene,
} from "../../annotate/scenes";
import { loadFrameImage } from "../../annotate/frame";

const MAX_HISTORY = 60;
const clone = (v) => JSON.parse(JSON.stringify(v));

// Reads a video's size and duration.
const probe = (url) =>
  new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      const done = (d) => resolve({ width: v.videoWidth, height: v.videoHeight, duration: d });
      if (Number.isFinite(v.duration)) return done(v.duration);
      // WebM without a duration header: seek far to find the end.
      v.currentTime = 1e9;
      v.ondurationchange = () => Number.isFinite(v.duration) && done(v.duration);
    };
    v.onerror = () => reject(new Error("This file can't be played as a video."));
    v.src = url;
  });

// State and live preview for the Scenes editor. Each clip scene gets its own
// <video> so neighbours can play at once during a transition.
export default function useScenes({ mainBlob, initialProject, initialSources }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const projectRef = useRef(null);
  const sourcesRef = useRef(initialSources || { [MAIN_SOURCE]: mainBlob });
  const urlsRef = useRef(new Map());
  const videosRef = useRef(new Map()); // scene id -> HTMLVideoElement
  const imagesRef = useRef(new Map());
  const bufsRef = useRef([document.createElement("canvas"), document.createElement("canvas")]);
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const clockRef = useRef({ t0: 0, at: 0 });
  const rafRef = useRef(null);
  const historyRef = useRef({ past: [], future: [] });

  const [project, setProjectState] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [error, setError] = useState(null);

  const urlFor = (id) => {
    if (!urlsRef.current.has(id)) urlsRef.current.set(id, URL.createObjectURL(sourcesRef.current[id]));
    return urlsRef.current.get(id);
  };

  const videoFor = (scene) => {
    let v = videosRef.current.get(scene.id);
    if (!v || v.dataset.source !== scene.source) {
      v?.pause();
      v = document.createElement("video");
      v.preload = "auto";
      v.playsInline = true;
      v.dataset.source = scene.source;
      v.src = urlFor(scene.source);
      v.addEventListener("seeked", () => !playingRef.current && draw());
      v.addEventListener("loadeddata", () => !playingRef.current && draw());
      videosRef.current.set(scene.id, v);
    }
    return v;
  };

  // ---------- drawing ----------

  const draw = useCallback(() => {
    const p = projectRef.current;
    const canvas = canvasRef.current;
    if (!p || !canvas) return;
    const { OW, OH } = projectSize(p);
    if (canvas.width !== OW || canvas.height !== OH) {
      canvas.width = OW;
      canvas.height = OH;
    }
    for (const b of bufsRef.current) {
      if (b.width !== OW || b.height !== OH) {
        b.width = OW;
        b.height = OH;
      }
    }
    const tl = buildTimeline(p);
    renderProjectFrame(
      canvas.getContext("2d"),
      p,
      tl,
      timeRef.current,
      (e) => {
        if (e.scene.kind !== "clip") return null;
        const v = videoFor(e.scene);
        return v.readyState >= 2 ? v : null;
      },
      bufsRef.current,
      imagesRef.current,
    );
  }, []);

  // Points each visible clip's video at the right moment; pauses the rest.
  const syncVideos = (t, play) => {
    const p = projectRef.current;
    if (!p) return;
    const tl = buildTimeline(p);
    const act = activeAt(tl, t);
    const live = new Set();
    for (const e of [act?.a, act?.b]) {
      if (!e || e.scene.kind !== "clip") continue;
      live.add(e.scene.id);
      const v = videoFor(e.scene);
      const lt = localTime(e, t);
      v.volume = Math.max(0, Math.min(1, gainAt(tl, e, t)));
      v.muted = !play;
      if (play) {
        if (Math.abs(v.currentTime - lt) > 0.25) v.currentTime = lt;
        if (v.paused) v.play().catch(() => {});
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - lt) > 0.02) v.currentTime = lt;
      }
    }
    for (const [id, v] of videosRef.current) if (!live.has(id) && !v.paused) v.pause();
  };

  const totalDuration = () => (projectRef.current ? buildTimeline(projectRef.current).duration : 0);

  const loop = useCallback(() => {
    if (!playingRef.current) return;
    const { t0, at } = clockRef.current;
    let t = at + (performance.now() - t0) / 1000;
    const total = totalDuration();
    if (t >= total) {
      t = total - 0.001;
      timeRef.current = t;
      pause();
      return;
    }
    timeRef.current = t;
    syncVideos(t, true);
    draw();
    setTime(t);
    rafRef.current = requestAnimationFrame(loop);
  }, [draw]);

  const play = () => {
    if (!projectRef.current) return;
    if (timeRef.current >= totalDuration() - 0.05) timeRef.current = 0;
    playingRef.current = true;
    setPlaying(true);
    clockRef.current = { t0: performance.now(), at: timeRef.current };
    rafRef.current = requestAnimationFrame(loop);
  };

  const pause = () => {
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    syncVideos(timeRef.current, false);
    draw();
  };

  const seek = (t) => {
    const total = totalDuration();
    const c = Math.max(0, Math.min(t, Math.max(0, total - 0.001)));
    timeRef.current = c;
    setTime(c);
    if (playingRef.current) clockRef.current = { t0: performance.now(), at: c };
    syncVideos(c, playingRef.current);
    draw();
  };

  // ---------- project state ----------

  const setProject = (next, { history: record = true } = {}) => {
    if (record && projectRef.current) {
      const h = historyRef.current;
      h.past.push(clone(projectRef.current));
      if (h.past.length > MAX_HISTORY) h.past.shift();
      h.future = [];
      setHistory({ canUndo: true, canRedo: false });
    }
    projectRef.current = next;
    setProjectState(next);
    Promise.all(
      next.scenes
        .filter((s) => s.layout?.background?.type === "image" && s.layout.background.image)
        .map(async (s) => {
          const src = s.layout.background.image;
          if (!imagesRef.current.has(src)) imagesRef.current.set(src, await loadFrameImage(s.layout));
        }),
    ).then(() => !playingRef.current && draw());
    if (timeRef.current > buildTimeline(next).duration) timeRef.current = 0;
    syncVideos(timeRef.current, playingRef.current);
    draw();
  };

  const updateScenes = (fn, opts) => {
    const p = projectRef.current;
    setProject({ ...p, scenes: fn(p.scenes) }, opts);
  };

  const updateScene = (id, patch, opts) =>
    updateScenes((scenes) => scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)), opts);

  const undo = () => {
    const h = historyRef.current;
    if (!h.past.length) return;
    h.future.push(clone(projectRef.current));
    const prev = h.past.pop();
    setHistory({ canUndo: h.past.length > 0, canRedo: true });
    projectRef.current = prev;
    setProjectState(prev);
    seek(timeRef.current);
  };

  const redo = () => {
    const h = historyRef.current;
    if (!h.future.length) return;
    h.past.push(clone(projectRef.current));
    const next = h.future.pop();
    setHistory({ canUndo: true, canRedo: h.future.length > 0 });
    projectRef.current = next;
    setProjectState(next);
    seek(timeRef.current);
  };

  const indexOf = (id) => projectRef.current.scenes.findIndex((s) => s.id === id);

  const actions = {
    play,
    pause,
    seek,
    undo,
    redo,
    select: (id) => {
      setSelectedId(id);
      const i = id ? indexOf(id) : -1;
      if (i >= 0) {
        const e = buildTimeline(projectRef.current).entries[i];
        if (timeRef.current < e.start || timeRef.current >= e.end) seek(e.start + Math.min(0.3, (e.end - e.start) / 2));
      }
    },
    setAspect: (aspect) => setProject({ ...projectRef.current, aspect }),
    updateScene,
    split: () => {
      const p = projectRef.current;
      const act = activeAt(buildTimeline(p), timeRef.current);
      if (!act) return;
      const scenes = splitScene(p, act.a.index, timeRef.current);
      if (scenes) {
        setProject({ ...p, scenes });
        setSelectedId(scenes[act.a.index + 1].id);
      }
    },
    remove: (id = selectedId) => {
      if (!id || projectRef.current.scenes.length <= 1) return;
      updateScenes((scenes) => scenes.filter((s) => s.id !== id));
      setSelectedId(null);
    },
    duplicate: (id = selectedId) => {
      const i = id ? indexOf(id) : -1;
      if (i < 0) return;
      const copy = cloneScene(projectRef.current.scenes[i]);
      updateScenes((scenes) => [...scenes.slice(0, i + 1), copy, ...scenes.slice(i + 1)]);
      setSelectedId(copy.id);
    },
    move: (id, to) => {
      const from = indexOf(id);
      if (from < 0 || to === from) return;
      updateScenes((scenes) => {
        const next = [...scenes];
        const [s] = next.splice(from, 1);
        next.splice(Math.max(0, Math.min(next.length, to)), 0, s);
        return next;
      });
    },
    addTitle: () => {
      const s = createTitleScene();
      const i = selectedId ? indexOf(selectedId) + 1 : projectRef.current.scenes.length;
      updateScenes((scenes) => [...scenes.slice(0, i), s, ...scenes.slice(i)]);
      setSelectedId(s.id);
      seek(buildTimeline(projectRef.current).entries[i].start + 0.3);
    },
    addClip: async (file) => {
      setError(null);
      const id = `file_${Date.now().toString(36)}`;
      sourcesRef.current = { ...sourcesRef.current, [id]: file };
      try {
        const meta = await probe(urlFor(id));
        if (!meta.width) throw new Error("That file has no video track.");
        const s = createClipScene(id, 0, meta.duration, meta.width, meta.height, file.name.replace(/\.[^.]+$/, ""));
        const i = selectedId ? indexOf(selectedId) + 1 : projectRef.current.scenes.length;
        updateScenes((scenes) => [...scenes.slice(0, i), s, ...scenes.slice(i)]);
        setSelectedId(s.id);
      } catch (err) {
        setError(err.message);
      }
    },
    exportProject: () => {
      const p = clone(projectRef.current);
      // Only send the sources the project still uses.
      const used = new Set(p.scenes.filter((s) => s.kind === "clip").map((s) => s.source));
      const sources = Object.fromEntries(Object.entries(sourcesRef.current).filter(([id]) => used.has(id)));
      return { project: p, sources };
    },
    allSources: () => sourcesRef.current,
  };

  // Start: a project of the whole recording, or the one being re-edited.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (initialProject) {
        setProject(clone(initialProject), { history: false });
        return;
      }
      try {
        const meta = await probe(urlFor(MAIN_SOURCE));
        if (!cancelled) setProject(createProject(meta.width, meta.height, meta.duration), { history: false });
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      for (const v of videosRef.current.values()) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
      for (const u of urlsRef.current.values()) URL.revokeObjectURL(u);
    };
  }, []);

  // Fit the preview canvas into the stage.
  useEffect(() => {
    if (!project) return;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const { OW, OH } = projectSize(project);
    const fit = () => {
      const box = stage.getBoundingClientRect();
      const s = Math.min(box.width / OW, box.height / OH);
      canvas.style.width = `${Math.floor(OW * s)}px`;
      canvas.style.height = `${Math.floor(OH * s)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [project?.aspect, project?.width, project?.height]);

  const timeline = project ? buildTimeline(project) : { entries: [], duration: 0 };

  return {
    refs: { canvasRef, stageRef },
    project,
    timeline,
    selectedId,
    selected: project?.scenes.find((s) => s.id === selectedId) || null,
    time,
    playing,
    history,
    error,
    actions,
  };
}
