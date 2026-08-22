# vas

A local-first handwriting notebook and whiteboard that runs entirely in the browser.
Open a page and start writing — no download, no account, no backend. Your notes stay on
your device.

**[Online demo](https://gengyunmaster.github.io/vas/)** — works on desktop, tablet, and
phone. Notebooks are stored per origin in the browser's IndexedDB, so the demo site and a
self-hosted instance keep separate data; use export / import to move notebooks around.

## Features

- **Natural pen feel** — pressure-sensitive strokes (Apple Pencil & compatible pens),
  velocity-simulated pressure for finger and mouse, low-latency canvas rendering
- **Paginated notebooks** — continuous vertical scrolling, pinch zoom up to 20x with
  crisp vector redraw; page size is per-page (A4-proportioned 794×1123 by default,
  adjustable per page from 200 to 5000 px, mixed sizes within one notebook)
- **Tools** — pen, highlighter, stroke eraser, laser pointer (for teaching), and shapes
  (line / arrow / rectangle / ellipse)
- **Lasso selection** — circle content to select it, then move, scale / stretch (staying
  vector), recolor, delete, and cut / copy / paste — across pages and notebooks
- **Images** — insert images (button or paste from the system clipboard) and annotate
  over them; images move / scale / copy along with the selection; oversized images are
  auto-fit to the page and stored at original quality
- **PDF import** — import a PDF from the home screen to create a notebook, or into the
  open notebook (pages inserted after the current one, inheriting its style); every page
  is rendered at 4x point resolution, scaled to fill the sheet, and locked in place
  (lasso can't select it); home-screen imports size each page after its PDF page;
  annotate freely on top; password-protected PDFs are decrypted in the
  browser on import (qpdf-wasm, password prompted once) and stored without a password,
  so exports can re-embed them as true vector pages
- **Per-page paper** — paper colors (presets incl. blackboard green and calligraphy tan,
  plus custom hex) and background templates (blank / lined / grid / dots / rice grid),
  with contrast-aware guide lines
- **Page management** — insert / delete / clear pages, automatic page continuation,
  thumbnail sidebar with aspect-accurate previews and long-press drag to reorder
- **Presentation mode** — full-screen slideshow: one page fitted to the screen on a
  black backdrop, wheel / swipe / arrow-key paging with a scroll animation, writing
  stays enabled
- **Multiple notebooks** — home screen with create / rename / delete, plus merging:
  select notebooks to combine their pages into a new one (selection order preserved;
  a single selection duplicates a notebook; shared images stay stored once)
- **Local-first storage** — IndexedDB autosave, per-notebook view state (scroll position
  and zoom restored on reopen, also carried in exports), JSON export for image-less
  notebooks and zip export (JSON + image files) for notebooks with images, both
  re-importable
- **Vector PDF export** — strokes stay sharp at any zoom level, inserted SVG images stay
  vector too, raster images embedded from the original bytes (JPEG/PNG); imported PDF
  pages keep their original bytes, which are re-embedded as a true vector layer beneath
  your annotations on export (with raster fallback for encrypted files)
- **Flexible export scopes** — every export offers three scopes: the current selection
  (clipped to its bounds, transparent background, no paper color / guides / PDF base
  image — white background for PDF, which has no transparency concept), the current
  page, or the whole notebook (trailing blank pages trimmed); pick PDF, vector SVG, or
  2x PNG, and multi-page SVG/PNG exports download as a zip
- **PWA** — installable and fully offline; all assets (including the on-demand PDF
  engine) are precached

## Screenshots

| Calligraphy practice (tan paper preset)           | Annotating an imported PDF                |
| ------------------------------------------------- | ----------------------------------------- |
| ![Calligraphy practice](docs/calligraphy.png)     | ![PDF annotation](docs/pdf-annotation.png) |

## Tech stack

React 19 · TypeScript · Vite · zustand · perfect-freehand · idb · jsPDF + svg2pdf.js
(lazy-loaded) · pdfjs-dist (lazy-loaded) · pdf-lib (lazy-loaded) · @neslinesli93/qpdf-wasm
(lazy-loaded) · fflate ·
vite-plugin-pwa · Biome · Vitest — no UI component library, no backend.

## Project structure

```
src/
  components/    React UI (Home, Toolbar, SettingsPanel, PageSidebar, SelectionBar, ...)
  engine/        rendering engine: board, viewport, pageCache, imageCache,
                 renderPage/renderStroke/patterns/shapes, canvas
  model/         data model & pure functions: stroke, page, color, image, viewState,
                 hitTest, patternLayout, shapeGeometry, selection, transform
  store/         zustand stores
  persistence/   IndexedDB (db, notebooks, images, transfer, autosave, prefs, session),
                 insertImage, importPdf, rasterize, exportPdf, exportImage, exportSvg
  pwa/           service worker registration
public/          PWA icons (generated by scripts/generate-icons.mjs)
scripts/         one-off utility scripts
deploy/          nginx config for the Docker runtime stage
```

## Getting started (development)

Requirements: **Node.js >= 20.19** (22 or 24 LTS recommended).

```bash
git clone <repo-url>
cd vas
npm ci
npm run dev
```

Open <http://localhost:5173> in your browser.

### Scripts

| Command           | Description                              |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Start the dev server                     |
| `npm run build`   | Type-check + production build            |
| `npm run preview` | Preview the production build             |
| `npm test`        | Run unit tests                           |
| `npm run lint`    | Biome check                              |
| `npm run format`  | Biome auto-format                        |

## Docker

The image is a multi-stage build: the app is compiled in a Node stage (lint + tests as a
quality gate) and served by an unprivileged nginx in the runtime stage.

```bash
docker build -t vas:latest .
docker run -d --name vas -p 8080:8080 vas:latest
```

Or with Docker Compose:

```bash
docker compose up -d --build
```

The container serves plain HTTP on port **8080**. Put your TLS-terminating reverse proxy
in front of it — HTTPS (or localhost) is required for the PWA features (install to home
screen, offline use), because service workers only run in a secure context.

## Offline / air-gapped deployment

Export the built image as a `.tar.gz` archive, copy it to a machine without internet
access (USB drive, scp, ...), and load it there:

```bash
# on the build machine
docker save vas:latest | gzip > vas-latest.tar.gz

# on the offline target machine
gunzip -c vas-latest.tar.gz | docker load
docker run -d --name vas -p 8080:8080 vas:latest
```

Then open `http://<host>:8080` in a browser.

## Data & privacy

All notes live in the browser's IndexedDB on the device they were written on — nothing
leaves your device. Use the JSON/zip export on the home screen to back up or move a
notebook between devices (zip when the notebook contains images or PDF pages).

## Contributing

Bug reports and pull requests are welcome. `AGENTS.md` (Chinese) contains the full
architecture and conventions guide for developers and AI coding assistants — please read
it before making changes.

## License

[MIT](LICENSE)
