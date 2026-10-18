/**
 * Turns the designed icon artwork into the assets the app ships.
 *
 * Run by hand, not by `postinstall`, because its inputs are design files that
 * change about once a year and its outputs are committed:
 *
 *     pnpm run icons
 *
 * Three jobs, and the reason they are one script is that all three have to
 * agree on the same geometry down to the pixel:
 *
 *   1. **Shape the eight.** The artwork arrives from Figma as full-bleed
 *      1024×1024 squares. macOS does not round an app icon the way iOS does —
 *      whatever is in the `.icns` is what the Dock draws — so the squircle and
 *      the padding are applied here.
 *   2. **Cut the mark out.** Every icon is the same mark over a different
 *      background, and the mark's frame is `white` at 60% opacity, which is why
 *      it reads pink on the orange one and lilac on the purple one. Rendered
 *      once on transparent, it can be laid over *any* background — which is
 *      what lets main generate a ninth icon from the open project's hue.
 *   3. **Emit the squircle as a mask.** Main needs the same shape to clip its
 *      generated gradient to. It loads this PNG rather than recomputing the
 *      curve, so there is exactly one definition of the silhouette and no way
 *      for the generated icon to sit a pixel off from the designed ones.
 *
 * It runs under Electron so that the compositing happens in Chromium. The
 * backgrounds arrive already rasterized — Figma flattened its blurs and grain
 * into the PNGs — but the mark is a path, the squircle has to be antialiased
 * against it, and canvas does both for free. A hand-rolled bezier rasterizer
 * would be a worse answer to a problem the browser already solves.
 *
 * It is also why nothing here may `await` at the top level: see the note on
 * `main` below, which is the trap this script fell into first.
 */
import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'resources/icons/source/svg');
const OUT = join(ROOT, 'resources/icons');
const PREVIEWS = join(ROOT, 'src/renderer/public/assets/icons');

/** Big enough for a retina swatch in the settings dialog, and no bigger. */
const PREVIEW_SIZE = 128;

/**
 * The Figma frame each icon came out of, and the key it is known by.
 *
 * The keys are what land in `~/.frodon/config.json`, so they are names rather
 * than numbers: `Frame 7` tells a person reading their own config nothing, and
 * renaming one later means breaking every config that already chose it.
 */
const ICONS = {
  silk: 'Frame 4',
  ember: 'Frame 5',
  holo: 'Frame 6',
  acid: 'Frame 7',
  dune: 'Frame 8',
  mint: 'Frame 9',
  matrix: 'Frame 10',
  orchid: 'Frame 11',
};

/** Which one is baked into the bundle, and so shown by Finder forever. */
const BUNDLE_ICON = 'silk';

/* -------------------------------------------------------------------------
 * Geometry
 *
 * Apple's icon grid: a 1024 canvas with the art inside an 824 square, which
 * leaves 100 of transparent padding on every side. The padding is not waste —
 * it is what the Dock's shadow and the drag image need, and an icon drawn to
 * the edge sits visibly larger than its neighbours.
 * ---------------------------------------------------------------------- */

const CANVAS = 1024;
const ART = 824;
/** 22.5% of the art box, which is the corner macOS has used since Big Sur. */
const RADIUS = ART * 0.225;

/**
 * How much bigger the mark is drawn than the artwork was designed with.
 *
 * In the Figma frames the mark spans 54% of a full-bleed square. Shaping those
 * to Apple's grid keeps that proportion — everything scales together — so the
 * mark came out at 54% of the squircle, which read small once the tile had its
 * padding. This grows it.
 *
 * This is only possible because the background and the mark are composited
 * here rather than arriving flattened. The mark is stripped out of each source
 * SVG and drawn back on top at whatever size this says — so it can grow or
 * shrink freely, with no old copy underneath to hide.
 *
 * Compositing over the flattened PNG exports was tried first and is the reason
 * that matters: the enlarged mark has to cover the original exactly, the black
 * body is only a little smaller than its translucent frame, and at any
 * plausible scale a seam of the old outline shows through the new one. Visible
 * on `dune` at a glance. The cost of going back to vector is grain — Chromium
 * runs the `feTurbulence` each icon carries at a coarser amplitude than Figma
 * does, and supersampling barely helps — so the icons are fractionally
 * noisier than the exports, and nothing is doubled.
 *
 * One number for all nine icons, including the generated one, whose overlay
 * is rendered through the same call.
 */
const MARK_SCALE = 1.18;

/**
 * The mark elements, as they appear at the end of every source frame.
 *
 * Identical in all eight but for a thousandth of a unit on one eye, which is
 * Figma rounding and not a difference — hence the one loose digit. Removing
 * them leaves the background alone, so the mark can be drawn back at any size.
 */
const MARK_ELEMENTS = [
  /<path d="M236\.362 314\.96.*?\/>/s,
  /<path d="M276\.191 320\.328.*?\/>/s,
  /<circle cx="421\.56[89]".*?\/>/s,
  /<ellipse cx="421\.568".*?\/>/s,
  /<circle cx="600\.801".*?\/>/s,
  /<ellipse cx="600\.801".*?\/>/s,
];

/** One frame with its mark removed, as a data URL Chromium can draw. */
function background(svg) {
  let stripped = svg;
  for (const pattern of MARK_ELEMENTS) {
    if (!pattern.test(stripped)) {
      throw new Error(`a mark element is missing from a source frame: ${pattern}`);
    }
    stripped = stripped.replace(pattern, '');
  }
  return `data:image/svg+xml;base64,${Buffer.from(stripped).toString('base64')}`;
}

/**
 * The mark, lifted straight out of the Figma export.
 *
 * Four shapes and no filters, which is the whole reason this can be a string
 * in a script rather than another file to keep in sync. The first path is the
 * frame — `white` at 60%, so whatever is behind it shows through — and the
 * rest is the mark proper: body, two sockets, two pupils.
 *
 * In the source artwork's own 1024 coordinates. The draw below scales it into
 * the art box with everything else, so the mark shrinks by the same 20% the
 * backgrounds do and stays registered against them.
 */
const MARK = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">
  <path d="M236.362 314.96C236.362 277.949 276.617 254.982 308.478 273.815L487.861 379.846C502.862 388.713 521.5 388.713 536.501 379.846L715.884 273.815C747.745 254.982 788 277.949 788 314.96V709.141C788 735.538 766.601 756.937 740.204 756.937H284.158C257.761 756.937 236.362 735.538 236.362 709.141V314.96Z" fill="white" fill-opacity="0.6"/>
  <path d="M276.191 320.328C276.191 314.259 282.685 310.4 288.016 313.301L508.356 433.233C510.741 434.531 513.621 434.531 516.005 433.233L736.345 313.301C741.676 310.4 748.17 314.259 748.17 320.328V713.091C748.17 717.509 744.588 721.091 740.17 721.091H284.191C279.773 721.091 276.191 717.509 276.191 713.091V320.328Z" fill="black"/>
  <circle cx="421.568" cy="575.711" r="53.7697" fill="white"/>
  <ellipse cx="421.568" cy="575.714" rx="17.9232" ry="29.8721" fill="black"/>
  <circle cx="600.801" cy="575.711" r="53.7697" fill="white"/>
  <ellipse cx="600.801" cy="575.714" rx="17.9232" ry="29.8721" fill="black"/>
</svg>`;

/**
 * Runs inside the page: the background into the art box, then the mark on top.
 *
 * Two layers rather than one image, which is what lets the mark be sized
 * independently of the artwork it sits on — see `MARK_SCALE`. The background
 * is clipped to the squircle; the mark is not, because it sits well inside
 * the shape and clipping would only cost it its own antialiasing.
 *
 * `shape: true` fills the squircle solid white and draws nothing — that is
 * the mask main clips its generated gradient with. A call with no background
 * produces the mark alone on transparent, which is the overlay main lays over
 * that gradient.
 *
 * Every number it needs is an argument. This function is stringified and
 * evaluated in Chromium, so anything it closed over would have to be injected
 * as a global beside it — which type-checks nowhere, lints as undefined, and
 * breaks silently the day one of them is renamed.
 */
function draw(options) {
  const {
    background = null,
    mark = null,
    markScale = 1,
    shape = false,
    size,
    canvas: full,
    art,
    radius,
  } = options;

  const load = (source) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('could not decode a source image'));
      image.src = source;
    });

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const scale = size / full;
  const ART = art * scale;
  const INSET = (size - ART) / 2;
  const RADIUS = radius * scale;

  const squircle = () => {
    ctx.beginPath();
    ctx.roundRect(INSET, INSET, ART, ART, RADIUS);
  };

  if (shape) {
    squircle();
    ctx.fillStyle = '#fff';
    ctx.fill();
    return Promise.resolve(canvas.toDataURL('image/png'));
  }

  return (async () => {
    if (background) {
      // Rasterized at its own size first, then downsampled into the art box.
      // Drawing the SVG straight into a smaller box makes Chromium run each
      // icon's grain filter at the *destination* resolution, which comes out
      // coarser still. One extra buffer per icon, and the tooth stays fine.
      const natural = document.createElement('canvas');
      natural.width = natural.height = full;
      natural.getContext('2d').drawImage(await load(background), 0, 0, full, full);

      ctx.save();
      squircle();
      ctx.clip();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(natural, INSET, INSET, ART, ART);
      ctx.restore();
    }

    if (mark) {
      // Scaled about the tile's centre, so a larger mark grows evenly into
      // its margins rather than drifting toward one corner.
      const span = ART * markScale;
      const origin = size / 2 - span / 2;
      ctx.drawImage(await load(mark), origin, origin, span, span);
    }

    return canvas.toDataURL('image/png');
  })();
}

function writePng(name, dataUrl) {
  const path = join(OUT, name);
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return path;
}

/**
 * Everything below runs from `whenReady`, and **never from a top-level
 * `await`**.
 *
 * Electron awaits the evaluation of an ESM entrypoint before it emits `ready`.
 * So `await app.whenReady()` at the top level of this file is a deadlock: the
 * module never finishes evaluating, the event therefore never fires, and the
 * promise it is waiting on is the one that would have let it finish. No error,
 * no exit — it simply stops, which is how it was found.
 *
 * `main/index.ts` has always done it this way. That is not a style preference
 * over there either.
 */
function main() {
  // Never shown. It exists only to be a Chromium that can rasterize and a
  // canvas that can composite; nothing is captured off the window itself.
  //
  // `about:blank` rather than a `data:` document, because Chromium blocks
  // top-level navigation to `data:` URLs. Nothing is needed from the page
  // anyway — the canvas is built in script.
  const window = new BrowserWindow({
    show: false,
    width: CANVAS,
    height: CANVAS,
  });

  /**
   * Runs one of the page-side functions above in Chromium.
   *
   * The geometry is folded in here rather than at each call site, so there is
   * one description of the icon grid and every drawing and every check agrees
   * on it by construction.
   */
  async function call(fn, options) {
    const args = {
      size: CANVAS,
      canvas: CANVAS,
      art: ART,
      radius: RADIUS,
      ...options,
    };
    const source = `(${fn.toString()})(${JSON.stringify(args)})`;
    return window.webContents.executeJavaScript(`(async()=>${source})()`);
  }

  const render = (options) => call(draw, options);

  function writePreview(name, dataUrl) {
    writeFileSync(
      join(PREVIEWS, name),
      Buffer.from(dataUrl.split(',')[1], 'base64')
    );
  }

  return (async () => {
    await window.loadURL('about:blank');

    mkdirSync(OUT, { recursive: true });
    mkdirSync(PREVIEWS, { recursive: true });

    const svg = Buffer.from(MARK).toString('base64');
    const mark = `data:image/svg+xml;base64,${svg}`;

    for (const [key, frame] of Object.entries(ICONS)) {
      const source = readFileSync(join(SOURCE, `${frame}.svg`), 'utf8');
      const layers = {
        background: background(source),
        mark,
        markScale: MARK_SCALE,
      };

      const out = await render(layers);
      writePng(`${key}.png`, out);

      // The settings picker needs to show these, and the renderer cannot read
      // a file — it has no Node and no business asking main for megabytes of
      // artwork to draw eight swatches. A small copy in `public/` is served
      // like any other asset and costs a few kilobytes each.
      writePreview(`${key}.png`, await render({ ...layers, size: PREVIEW_SIZE }));

      // electron-builder reads the bundle icon from `build/`, by its own
      // convention — a 1024 PNG there is what becomes the `.icns`.
      if (key === BUNDLE_ICON) {
        mkdirSync(join(ROOT, 'build'), { recursive: true });
        writeFileSync(
          join(ROOT, 'build/icon.png'),
          Buffer.from(out.split(',')[1], 'base64')
        );
      }

      console.log(`${frame} -> ${key}.png`);
    }

    // The mark alone, at the same scale it was just drawn at on the other
    // eight, so main's generated tile lines up with them exactly.
    const overlay = { mark, markScale: MARK_SCALE };
    writePng('mark.png', await render(overlay));

    // And again small. The generated icon is the one tile the picker cannot
    // ship a picture of — it does not exist until a project is open — so its
    // swatch is a CSS gradient with this laid over it, which is the same two
    // layers main composites, in the same order.
    writePreview('mark.png', await render({ ...overlay, size: PREVIEW_SIZE }));
    console.log('mark -> mark.png');

    writePng('squircle.png', await render({ shape: true }));
    console.log('squircle -> squircle.png');
  })();
}

app.whenReady().then(
  () => main().then(() => app.quit()),
  (error) => {
    console.error(error);
    app.exit(1);
  }
);

// A rejection inside `main` would otherwise be an unhandled promise and a zero
// exit code, which is a build step that reports success having written nothing.
process.on('unhandledRejection', (error) => {
  console.error(error);
  app.exit(1);
});
