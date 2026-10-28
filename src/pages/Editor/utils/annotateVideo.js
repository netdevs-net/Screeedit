import {
  Input,
  Output,
  BlobSource,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  ALL_FORMATS,
  Conversion,
} from "mediabunny";
import { StaticCanvas } from "../../EditorApp/annotate/fabricKit";
import {
  enlivenDoc,
  baseOf,
  applyTimeToObjects,
  drawFrameWithEffects,
} from "../../EditorApp/annotate/overlayEngine";

// Burns timeline overlays (text, drawings, shapes, images, blur/focus/zoom
// effects) into every frame of the video. Audio is copied through untouched.
export default async function annotateVideo(
  videoBlob,
  overlayDoc,
  onProgress = () => {},
) {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(videoBlob),
  });
  const inputFormat = await input.getFormat();
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error("Annotating failed - no video track");

  // H.264 needs even dimensions.
  const W = videoTrack.displayWidth - (videoTrack.displayWidth % 2);
  const H = videoTrack.displayHeight - (videoTrack.displayHeight % 2);

  // Overlays were authored on a canvas the size of the video; scale if the
  // source changed size since (e.g. a crop after placing overlays).
  const docW = overlayDoc.width || W;
  const docH = overlayDoc.height || H;

  const overlayEl = document.createElement("canvas");
  const overlay = new StaticCanvas(overlayEl, {
    width: W,
    height: H,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  });
  overlay.setZoom(W / docW);

  // Text must render in its real font, so wait for every family used.
  const families = new Set(
    overlayDoc.items.map((i) => i.obj?.fontFamily).filter(Boolean),
  );
  await Promise.all(
    [...families].map((f) =>
      document.fonts?.load(`48px "${f}"`).catch(() => null),
    ),
  );

  const objs = await enlivenDoc(overlayDoc);
  const bases = new Map();
  for (const item of overlayDoc.items) {
    const obj = objs.get(item.id);
    if (!obj) continue;
    bases.set(item.id, baseOf(item.obj));
    overlay.add(obj);
  }

  // Effects are evaluated in doc coordinates, so composite at doc size and
  // scale the result to the output.
  const frameCanvas = new OffscreenCanvas(docW, docH);
  const frameCtx = frameCanvas.getContext("2d");
  const sourceCanvas = new OffscreenCanvas(docW, docH);
  const sourceCtx = sourceCanvas.getContext("2d");
  const outCanvas = new OffscreenCanvas(W, H);
  const outCtx = outCanvas.getContext("2d");

  const targetFormat = inputFormat.name.toLowerCase().includes("mp4")
    ? "mp4"
    : "webm";
  const target = new BufferTarget();
  const output = new Output({
    format:
      targetFormat === "mp4"
        ? new Mp4OutputFormat({ fastStart: "in-memory" })
        : new WebMOutputFormat(),
    target,
  });

  const conversion = await Conversion.init({
    input,
    output,
    video: {
      forceTranscode: true,
      bitrate: 5_000_000,
      processedWidth: W,
      processedHeight: H,
      process: (sample) => {
        const t = sample.timestamp;
        sourceCtx.clearRect(0, 0, docW, docH);
        sample.draw(sourceCtx, 0, 0, docW, docH);
        frameCtx.clearRect(0, 0, docW, docH);
        drawFrameWithEffects(frameCtx, sourceCanvas, overlayDoc, objs, t, docW, docH);

        applyTimeToObjects(overlayDoc, objs, bases, t, docW, docH, {
          animate: true,
          hideEffects: true,
        });
        overlay.renderAll();

        outCtx.clearRect(0, 0, W, H);
        outCtx.drawImage(frameCanvas, 0, 0, W, H);
        outCtx.drawImage(overlayEl, 0, 0, W, H);
        return outCanvas;
      },
    },
  });

  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks
      .map((t) => `${t.track.type}: ${t.reason}`)
      .join(", ");
    throw new Error(`Annotating failed - ${reasons}`);
  }

  conversion.onProgress = onProgress;
  await conversion.execute();
  overlay.dispose();

  if (!target.buffer) throw new Error("Annotating failed - no output buffer");
  return new Blob([target.buffer], {
    type: targetFormat === "mp4" ? "video/mp4" : "video/webm",
  });
}
