# region-snap

[![CI](https://github.com/Jacky010/region-snap/actions/workflows/ci.yml/badge.svg)](https://github.com/Jacky010/region-snap/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@region-snap/core.svg)](https://www.npmjs.com/package/@region-snap/core)
[![license](https://img.shields.io/github/license/Jacky010/region-snap.svg)](./LICENSE)

English | [简体中文](./README.zh-CN.md)

Drag to select any region of a web page and capture it as an image. Framework-agnostic core, with Vue 3 and React components.

- **Any DOM content** – text, images, `<canvas>` (e.g. PDF pages rendered by pdf.js), tables…
- **Fast & sharp** – only the selected area is rendered, at `devicePixelRatio`; regions that fall entirely inside a single `<img>` / `<canvas>` are cropped straight from the source at native resolution
- **Works in real layouts** – scroll containers, auto-scroll while dragging near the edge, CSS `transform: scale()` zoom, re-layout on resize
- **Editable selection** – move it, resize it with 8 handles, or set it from code (`v-model:region` / controlled `region`)
- **Touch support** – long-press to select without breaking scrolling, or drag-to-select mode
- **Bring your own toolbar** – Vue slot / React render prop, auto-positioned next to the selection (flips above when there's no room below, and stays inside the visible area when the selection fills it or is scrolled)
- **Flexible output** – base64 Data URL, `Blob` or `File`; PNG / JPEG / WebP; minimum output size with padding (handy for OCR APIs)
- **Pluggable renderer** – html2canvas by default (lazy loaded), swap in html2canvas-pro or your own
- **Cross-origin iframes** – capture third-party previews (Office Online, OfficeWeb365…) by sharing the current tab, including scrolling screenshots stitched into one long image
- Optional mask and size label; zero CSS imports (styles are injected and easy to override)

| Package | Description |
| --- | --- |
| [`@region-snap/vue`](./packages/vue) | Vue 3.3+ component |
| [`@region-snap/react`](./packages/react) | React 17+ component (works with Next.js App Router) |
| [`@region-snap/core`](./packages/core) | Framework-agnostic core for vanilla JS or other frameworks |

## Install

```bash
npm i @region-snap/vue    # Vue 3
npm i @region-snap/react  # React
npm i @region-snap/core   # vanilla JS / other frameworks
```

## Vue 3

```vue
<template>
  <RegionSnap
    v-model:region="region"
    style="height: 600px"
    mask
    show-size
    :capture-options="{ minWidth: 300, minHeight: 100 }"
    @capture="(imageData) => console.log(imageData.length)"
  >
    <img src="/paper.png" />

    <template #toolbar="{ getFile, clear, capturing }">
      <button :disabled="capturing" @click="upload(getFile, clear)">Recognize</button>
      <button @click="clear()">Cancel</button>
    </template>
  </RegionSnap>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RegionSnap, type Region } from '@region-snap/vue'

const region = ref<Region | null>(null)

const upload = async (getFile: () => Promise<File | null>, clear: () => void) => {
  const file = await getFile() // waits for an in-flight capture
  clear()
  if (file) await ocr(file)
}
</script>
```

Methods are also available through a template ref: `getImage`, `getBlob`, `getFile`, `clear`, `setRegion`, `refresh`.

## React

```tsx
import { useRef, useState } from 'react'
import { RegionSnap, type Region, type RegionSnapHandle } from '@region-snap/react'

export function Viewer() {
  const snapRef = useRef<RegionSnapHandle>(null)
  const [region, setRegion] = useState<Region | null>(null)

  return (
    <RegionSnap
      ref={snapRef}
      region={region}
      onRegionChange={setRegion}
      style={{ height: 600 }}
      mask
      showSize
      captureOptions={{ minWidth: 300, minHeight: 100 }}
      renderToolbar={({ getFile, clear, capturing }) => (
        <>
          <button
            disabled={capturing}
            onClick={async () => {
              const file = await getFile()
              clear()
              if (file) await ocr(file)
            }}
          >
            Recognize
          </button>
          <button onClick={clear}>Cancel</button>
        </>
      )}
    >
      <img src="/paper.png" />
    </RegionSnap>
  )
}
```

`region` is optional – omit it for an uncontrolled component.

## Vanilla JS

```html
<div id="container" style="height: 600px">
  <div id="content"><img src="/paper.png" /></div>
  <div id="toolbar"><button id="ocr">Recognize</button></div>
</div>
```

```ts
import { RegionSnap } from '@region-snap/core'

const snap = new RegionSnap(
  document.getElementById('container')!,
  document.getElementById('content')!,
  { mask: true, onSelect: (region) => console.log(region) },
)
// shown and positioned while there is a selection, hidden otherwise
snap.setToolbar(document.getElementById('toolbar'))

document.getElementById('ocr')!.onclick = async () => {
  const blob = await snap.getBlob()
  snap.clear()
}

snap.setOptions({ disabled: true }) // merge options; pass `undefined` to reset one to its default
snap.destroy()                      // remove listeners and injected elements
```

`container` is the scroll container; `content` is what gets selected and must be a child of `container`.

## API

### Options / Props

Vue uses kebab-case (`auto-capture`), React and vanilla JS use camelCase.

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `region` | `Region \| null` | – | Vue: `v-model:region`; React: controlled value with `onRegionChange`. Vanilla JS: use `setRegion()` |
| `disabled` | `boolean` | `false` | Disable selecting |
| `minSize` | `number` | `5` | Width and height must both exceed this (px) for a selection to count |
| `autoCapture` | `boolean` | `true` | Capture in the background as soon as a selection is made; when `false`, capturing happens on `getImage()` |
| `captureOptions` | `CaptureOptions` | `{}` | See below |
| `editable` | `boolean` | `true` | Move the selection by dragging it, resize it with handles |
| `mask` | `boolean` | `false` | Dim everything outside the selection |
| `showSize` | `boolean` | `false` | Show `width × height` above the selection |
| `autoScroll` | `boolean` | `true` | Scroll the container when dragging near its edges |
| `touchMode` | `'longpress' \| 'drag'` | `'longpress'` | Touch: long-press then drag (swipes still scroll), or drag immediately (content can't be scrolled by touch) |
| `longPressDelay` | `number` | `400` | Long-press duration in ms |
| `toolbarOffset` | `number` | `10` | Gap between selection and toolbar (px) |
| `clearOnClickOutside` | `boolean` | `true` | Clear the selection when clicking outside the component |
| `clearOnEscape` | `boolean` | `true` | Clear the selection / cancel dragging on Esc |
| `clearOnResize` | `boolean` | `true` | Clear when the content width changes (re-layout); when `false` the region keeps its coordinates |

`Region` is `{ x, y, width, height }` in CSS pixels relative to the content's top-left corner. It is measured in layout pixels, so it doesn't change when the content is zoomed with a CSS transform.

### CaptureOptions

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `scale` | `number` | see description | Output pixels per CSS pixel. Defaults to the source resolution for fast crops, `devicePixelRatio` otherwise |
| `type` | `'image/png' \| 'image/jpeg' \| 'image/webp'` | `'image/png'` | Output format |
| `quality` | `number` | – | JPEG / WebP quality, 0–1 |
| `minWidth` | `number` | `0` | Minimum output width (px); smaller images are centered and padded |
| `minHeight` | `number` | `0` | Minimum output height (px) |
| `padColor` | `string` | `'#ffffff'` | Padding color |
| `fastCrop` | `boolean` | `true` | Crop directly from an `<img>` / `<canvas>` when the selection lies entirely inside one that isn't covered by other elements |
| `renderer` | `CaptureRenderer` | html2canvas | Custom renderer, see below |
| `html2canvas` | `Partial<Options>` | – | Extra [html2canvas options](https://html2canvas.hertzen.com/configuration) for the default renderer |

### Events / callbacks

| Vue event | React / vanilla JS | Arguments | Description |
| --- | --- | --- | --- |
| `update:region` | `onRegionChange` (React only) | `(region \| null)` | Selection changed (after drawing, moving, resizing or clearing) |
| `select` | `onSelect` | `(region)` | The user finished drawing, moving or resizing a selection |
| `capture` | `onCapture` | `(imageData, region)` | Capture finished; `imageData` is a base64 Data URL |
| `clear` | `onClear` | `()` | Selection cleared |
| `error` | `onError` | `(error)` | Capture failed |
| – | `onChange` (vanilla JS only) | `(state)` | State changed; not fired for every pointer move while dragging |

### Toolbar

The Vue `#toolbar` slot and React `renderToolbar` receive the same props:

| Name | Type | Description |
| --- | --- | --- |
| `region` | `Region` | Current selection |
| `imageData` | `string \| null` | Capture result, `null` until ready |
| `capturing` | `boolean` | Whether a capture is in flight |
| `scrollCapture` | `{ height, lost } \| null` | Scroll capture progress, `null` when not scroll capturing |
| `getImage` | `() => Promise<string \| null>` | Data URL; waits for an in-flight capture |
| `getBlob` | `() => Promise<Blob \| null>` | `Blob`, ready for `FormData` |
| `getFile` | `(filename?) => Promise<File \| null>` | `File`, defaults to `region.png` / `.jpg` / `.webp` |
| `clear` | `() => void` | Clear the selection |
| `startScrollCapture` / `finishScrollCapture` / `cancelScrollCapture` | | See [scrolling screenshots](#scrolling-screenshots) |

The toolbar isn't shown while dragging.

### Methods

Available on the Vue template ref, React ref and the core instance.

| Method | Description |
| --- | --- |
| `getImage()` / `getBlob()` / `getFile(filename?)` | Capture the current selection; resolves to `null` when there is none |
| `setRegion(region \| null)` | Set the selection from code (clamped to the content); `null` clears. Doesn't fire `select` |
| `clear()` | Clear the selection and discard any in-flight capture |
| `refresh()` | Re-position the selection and toolbar, e.g. after changing the zoom (resizes are detected automatically) |
| `startScrollCapture()` | Start a [scrolling screenshot](#scrolling-screenshots); needs `createScreenCapture().renderer` |
| `finishScrollCapture()` | Stop and resolve to the stitched long image (Data URL) |
| `cancelScrollCapture()` | Stop and go back to the normal selection |
| `setToolbar(el)` | (vanilla JS) Element to use as the toolbar |
| `setOptions(options)` | (vanilla JS) Update options |
| `destroy()` | (vanilla JS) Remove listeners and injected elements |
| `state` | (vanilla JS) Current `{ region, drawing, capturing, imageData, scrollCapture }` |

## Custom renderer

The default renderer lazy-loads html2canvas. To use [html2canvas-pro](https://github.com/yorickshan/html2canvas-pro) (supports `oklch()`, `color()` etc.):

```ts
import html2canvasPro from 'html2canvas-pro'
import { html2canvasRenderer } from '@region-snap/core'

const captureOptions = { renderer: html2canvasRenderer({ backgroundColor: null }, html2canvasPro) }
```

Or write your own, e.g. with [modern-screenshot](https://github.com/qq15725/modern-screenshot). A renderer gets the content element and the region in unscaled layout pixels, and must return a canvas of `width × scale` by `height × scale`:

```ts
import type { CaptureRenderer } from '@region-snap/core'

const renderer: CaptureRenderer = async (element, { x, y, width, height, scale }) => {
  // ...
  return canvas
}
```

## Cross-origin iframes

Browsers don't let scripts read pixels from a cross-origin iframe, so html2canvas (or any DOM-based renderer) can't capture third-party document previews such as Office Online or OfficeWeb365. `createScreenCapture()` works around this by sharing the current tab with [`getDisplayMedia`](https://developer.mozilla.org/docs/Web/API/MediaDevices/getDisplayMedia) and cropping the selection from what's actually on screen:

```vue
<template>
  <button v-if="!snapping" @click="enter">Screenshot mode</button>
  <button v-else @click="exit">Exit</button>

  <RegionSnap :disabled="!snapping" mask :capture-options="{ renderer: screen.renderer }" style="height: 600px">
    <iframe :src="previewUrl" style="display: block; width: 100%; height: 600px; border: 0" />
    <template #toolbar="{ getFile, clear }">...</template>
  </RegionSnap>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { RegionSnap, createScreenCapture } from '@region-snap/vue'

const snapping = ref(false)
const screen = createScreenCapture({ onEnded: () => (snapping.value = false) })

const enter = async () => {
  await screen.start() // must be called from a click; the browser asks for permission
  snapping.value = true
}
const exit = () => {
  screen.stop()
  snapping.value = false
}
onBeforeUnmount(() => screen.stop())
</script>
```

- While selecting is enabled, content that contains an iframe is covered by a transparent layer so drags reach region-snap. Toggle `disabled` to switch between browsing (scrolling the document) and selecting.
- The selection box, mask and toolbar are hidden for a frame while capturing, so they don't end up in the image.
- Desktop Chrome / Edge only; requires HTTPS (or localhost). The browser shows a "sharing this tab" bar while the stream is active – call `stop()` when done.
- Only what's visible on screen can be captured; anything covering the selection (dialogs, tooltips) is captured too.

### Scrolling screenshots

To capture more than fits on screen, start a scroll capture after selecting: the iframe becomes scrollable again, the user scrolls the document inside the selection, and region-snap matches consecutive frames and stitches them into one long image (scrolling back up works too).

```vue
<template #toolbar="{ scrollCapture, startScrollCapture, finishScrollCapture, cancelScrollCapture, getFile }">
  <template v-if="scrollCapture">
    <span>{{ scrollCapture.lost ? 'Too fast – scroll back a little' : `${scrollCapture.height}px` }}</span>
    <button @click="finishScrollCapture()">Done</button>
    <button @click="cancelScrollCapture()">Cancel</button>
  </template>
  <button v-else @click="startScrollCapture()">Scrolling screenshot</button>
</template>
```

`finishScrollCapture()` resolves to the long image, and `getImage()` / `getBlob()` / `getFile()` return it afterwards. Esc cancels. Stitching relies on overlap between frames, so:

- Scroll at a moderate pace – if the content moves more than ~80% of the selection between frames, stitching pauses (`lost: true`) until the user scrolls back into overlap;
- Large blank areas, repeating content, or elements that stay fixed inside the selection (floating toolbars, sticky headers) can confuse matching – keep them out of the selection;
- If the toolbar has to sit on top of the selection (the selection fills the visible area), only the larger uncovered part of the selection above or below it is recorded;
- The long image is limited to 16384 px in height.

## Styling

Styles are injected into `<head>` first, so your own CSS wins.

```css
.region-snap {
  --region-snap-color: #f56c6c; /* handles, size label */
  --region-snap-selection-border: 2px solid #f56c6c;
  --region-snap-selection-bg: rgba(245, 108, 108, 0.15);
  --region-snap-mask: rgba(0, 0, 0, 0.5);
}
.region-snap__toolbar {
  /* white card with a shadow by default */
}
```

| Selector | Element |
| --- | --- |
| `.region-snap` | Scroll container; has `data-disabled`, `data-mask`, `data-editable`, `data-touch-mode`, `data-screen-capturing`, `data-scrolling` attributes |
| `.region-snap__content` | Content wrapper |
| `.region-snap__selection` | Selection box; `data-mode="draw"` while drawing |
| `.region-snap__handle[data-handle="nw"]` | Resize handles: `n`, `s`, `e`, `w`, `nw`, `ne`, `sw`, `se` |
| `.region-snap__size` | Size label; `data-inside` when shown inside the selection |
| `.region-snap__toolbar` | Toolbar |

## Limitations

Fast crops of `<img>` / `<canvas>` are pixel-exact. Everything else is rendered with html2canvas, which means:

- Cross-origin images need CORS headers, otherwise they are missing from the capture;
- Content inside `<iframe>` can't be captured – use [screen capture](#cross-origin-iframes) instead;
- Some newer CSS (e.g. `oklch()` colors) isn't supported – use html2canvas-pro as shown above.

## Development

```bash
pnpm install
pnpm dev        # playground with Vue, React and cross-origin iframe demos
pnpm test       # unit tests (vitest + happy-dom)
pnpm test:e2e   # end-to-end tests (Playwright, first run: pnpm exec playwright install chromium)
pnpm typecheck
pnpm build
```

### Releasing

Versioning uses [changesets](https://github.com/changesets/changesets); all three packages share one version.

1. Run `pnpm changeset` in your PR and describe the change;
2. After merging, the Release workflow opens a "Version Packages" PR;
3. Merging that PR publishes to npm via Trusted Publishing – no token needed (each package must list `Jacky010/region-snap` / `release.yml` as a Trusted Publisher in its npm settings).

To publish manually: `pnpm version-packages && pnpm release`.

## License

region-snap is dual-licensed:

- **[AGPL-3.0](./LICENSE)** – free to use, including in open-source projects, as long as the whole project that uses region-snap (including software offered to users over a network) is released under AGPL-3.0 with its complete source code.
- **Commercial license** – required for closed-source or proprietary products. Contact 1126651826@qq.com.
