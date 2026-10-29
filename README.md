<p align="center">
  <img src="src/assets/editor/logo.svg" alt="Screeedit" height="40">
</p>

# Screeedit

**Record your screen, then edit it right in the browser.** Screeedit is a Chrome extension that pairs a capable screen recorder with an on-device video editor: timeline text and drawing, word-by-word captions, backdrops and device frames, multi-scene projects, and automatic zoom on your clicks. Everything runs locally. There's no account, no upload, and no server.

Screeedit is built on [**Screenity**](https://github.com/alyssaxuu/screenity) by [Alyssa X](https://alyssax.com). See [Credits](#credits).

## What it adds

Screenity's recorder and editor are the foundation. Screeedit adds an editing layer on top:

- **Text & drawing on a timeline.** Titles, lower thirds, labels, counters and scrolling credits; pen, highlighter, arrows, lines, shapes and images; blur, spotlight and zoom effects. Each overlay gets a bar on the timeline you can drag and resize, with in, out and loop animations, undo/redo, and burn-in on save. Saved overlays stay editable.
- **Word-by-word captions.** Speech-to-text runs on your computer with OpenAI Whisper (via transformers.js), or against any OpenAI-compatible Whisper server you point it at. Karaoke, highlight-box, pop-in, one-word and classic styles; edit any line; export `.srt` and `.vtt`.
- **Backdrops and device frames.** Put the recording on a gradient, color, image or blurred-video background; switch to 16:9, 9:16, 1:1 or 4:5; frame it in a browser window, macOS window, MacBook, iPad or iPhone.
- **Scenes.** Split the recording, add other videos and title cards, drag scenes into order, give each its own layout and motion, and join them with cut, fade, slide, wipe, zoom or a smooth transition that animates one layout into the next. Audio crossfades with the picture.
- **Auto-zoom.** Clicks made during tab, region and full-screen recordings are logged locally, and one button turns them into zooms that pan from one click to the next.
- **Fixes.** Trim honors the start point exactly, a failed edit no longer locks the editor, MP4/WebM/GIF export converts properly in both directions, and downloads no longer hang on "Downloading…".

Everything Screenity's recorder already does is still here: tab, area, desktop, window and camera recording, microphone and system audio, live annotation, camera backgrounds, blur, cursor effects, and MP4, WebM and GIF export.

## Install

1. Build it (see Develop below).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the `build` folder.

## Develop

Requires Node.js 24.

```bash
npm install
npm run build:release
```

Load the `build` folder as an unpacked extension. Run `npm start` for a watching development build.

The editor additions live in:

| Area | Code |
| --- | --- |
| Text & drawing, captions, backdrops | `src/pages/EditorApp/annotate/`, `src/pages/EditorApp/layout/annotate/` |
| Scenes | `src/pages/EditorApp/annotate/scenes.js`, `src/pages/EditorApp/layout/scenes/` |
| Rendering and export | `src/pages/Editor/utils/annotateVideo.js`, `src/pages/Editor/utils/renderScenes.js` |
| Click log for auto-zoom | `src/pages/Background/messaging/handlers.js`, `src/pages/Content/cursor/trackClicks.js` |

## Credits

**Screeedit is a modified version of [Screenity](https://github.com/alyssaxuu/screenity), created and maintained by [Alyssa X](https://alyssax.com).** The recorder, the original editor, the annotation tools, and most of this codebase are her work. Screeedit was forked from Screenity 4.7.2 in October 2026; the changes are listed above and in the commit history.

Screeedit is an independent project. It is not affiliated with or endorsed by Screenity or Alyssa X, and Screenity's name and logo belong to their owner. If you find Screeedit useful, please also support the original project: [Screenity](https://screenity.io) and [Screenity Pro](https://screenity.io/pro).

Screeedit also builds on:

- [OpenAI Whisper](https://github.com/openai/whisper) speech recognition (MIT), run through [Transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0) and [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT)
- [Mediabunny](https://github.com/Vanilagy/mediabunny) for decoding and encoding video (MPL-2.0)
- [Fabric.js](https://github.com/fabricjs/fabric.js) for the overlay canvas (MIT)

The full list of bundled third-party code and its licenses is in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## License

Like Screenity, Screeedit is licensed under the [GNU General Public License v3.0](./LICENSE). Under GPL-3.0 §5, this notice states that the work has been modified from Screenity; the date of modification and the changes are recorded in this README and the git history.

Built by [Web Devs](https://webdevs.net).
