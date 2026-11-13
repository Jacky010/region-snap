# region-snap

[![CI](https://github.com/Jacky010/region-snap/actions/workflows/ci.yml/badge.svg)](https://github.com/Jacky010/region-snap/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@region-snap/core.svg)](https://www.npmjs.com/package/@region-snap/core)
[![license](https://img.shields.io/github/license/Jacky010/region-snap.svg)](./LICENSE)

[English](./README.md) | 简体中文

在网页上拖动框选任意区域并截图。核心逻辑与框架无关，同时提供 Vue 3 和 React 组件。

- **框选任意 DOM 内容**：文字、图片、`<canvas>`（如 pdf.js 渲染的 PDF 页）、表格……
- **快且清晰**：只渲染选中区域，按 `devicePixelRatio` 输出；选区完全落在单个 `<img>` / `<canvas>` 上时直接从源图按原始分辨率裁剪
- **适应真实布局**：滚动容器、拖到边缘自动滚动、CSS `transform: scale()` 缩放、内容重新排版
- **选区可编辑**：拖动移动、8 个手柄调整大小，也可以用代码设置（`v-model:region` / 受控 `region`）
- **支持触屏**：长按后框选，不影响正常滑动滚动；也可切换为直接拖动框选
- **工具栏完全自定义**：Vue 用插槽，React 用 render 函数，自动定位在选区旁（下方放不下时翻到上方；选区占满可视区域或容器滚动时，始终保持在可视区域内）
- **输出灵活**：base64 Data URL、`Blob` 或 `File`；PNG / JPEG / WebP；可设置最小输出尺寸并自动补白（适合 OCR 接口）
- **渲染器可替换**：默认使用按需加载的 html2canvas，可换成 html2canvas-pro 或自己实现
- **跨域 iframe**：通过共享当前标签页截取第三方文档预览（Office Online、OfficeWeb365 等），支持滚动拼接长图
- 可选遮罩和尺寸提示；无需引入 CSS（样式自动注入，且易于覆盖）

| 包 | 说明 |
| --- | --- |
| [`@region-snap/vue`](./packages/vue) | Vue 3.3+ 组件 |
| [`@region-snap/react`](./packages/react) | React 17+ 组件（支持 Next.js App Router） |
| [`@region-snap/core`](./packages/core) | 框架无关的核心，可用于原生 JS 或其他框架 |

## 安装

```bash
npm i @region-snap/vue    # Vue 3
npm i @region-snap/react  # React
npm i @region-snap/core   # 原生 JS / 其他框架
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
      <button :disabled="capturing" @click="upload(getFile, clear)">识别文字</button>
      <button @click="clear()">取消</button>
    </template>
  </RegionSnap>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RegionSnap, type Region } from '@region-snap/vue'

const region = ref<Region | null>(null)

const upload = async (getFile: () => Promise<File | null>, clear: () => void) => {
  const file = await getFile() // 截图未完成时会等待
  clear()
  if (file) await ocr(file)
}
</script>
```

通过模板 ref 也可以调用 `getImage`、`getBlob`、`getFile`、`clear`、`setRegion`、`refresh`。

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
            识别文字
          </button>
          <button onClick={clear}>取消</button>
        </>
      )}
    >
      <img src="/paper.png" />
    </RegionSnap>
  )
}
```

`region` 可以不传，此时为非受控组件。

## 原生 JS

```html
<div id="container" style="height: 600px">
  <div id="content"><img src="/paper.png" /></div>
  <div id="toolbar"><button id="ocr">识别文字</button></div>
</div>
```

```ts
import { RegionSnap } from '@region-snap/core'

const snap = new RegionSnap(
  document.getElementById('container')!,
  document.getElementById('content')!,
  { mask: true, onSelect: (region) => console.log(region) },
)
// 有选区时自动显示并定位，没有选区时自动隐藏
snap.setToolbar(document.getElementById('toolbar'))

document.getElementById('ocr')!.onclick = async () => {
  const blob = await snap.getBlob()
  snap.clear()
}

snap.setOptions({ disabled: true }) // 合并配置；传 undefined 恢复默认值
snap.destroy()                      // 移除事件监听和注入的元素
```

`container` 是滚动容器，`content` 是被框选的内容，必须是 `container` 的子元素。

## API

### 配置项 / Props

Vue 中使用 kebab-case（如 `auto-capture`），React 和原生 JS 使用 camelCase。

| 名称 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `region` | `Region \| null` | – | Vue 用 `v-model:region`；React 配合 `onRegionChange` 受控使用；原生 JS 用 `setRegion()` |
| `disabled` | `boolean` | `false` | 禁用框选 |
| `minSize` | `number` | `5` | 选区宽高都超过该值（px）才算有效 |
| `autoCapture` | `boolean` | `true` | 框选完成后立即在后台截图；为 `false` 时调用 `getImage()` 才截图 |
| `captureOptions` | `CaptureOptions` | `{}` | 截图参数，见下表 |
| `editable` | `boolean` | `true` | 选区可拖动移动、拖动手柄调整大小 |
| `mask` | `boolean` | `false` | 选区外显示半透明遮罩 |
| `showSize` | `boolean` | `false` | 在选区上方显示 `宽 × 高` |
| `autoScroll` | `boolean` | `true` | 拖到容器边缘时自动滚动 |
| `touchMode` | `'longpress' \| 'drag'` | `'longpress'` | 触屏：长按后拖动（滑动仍可滚动），或直接拖动（内容区域不能用手指滚动） |
| `longPressDelay` | `number` | `400` | 长按时长（毫秒） |
| `toolbarOffset` | `number` | `10` | 工具栏与选区的间距（px） |
| `clearOnClickOutside` | `boolean` | `true` | 点击组件外部时清除选区 |
| `clearOnEscape` | `boolean` | `true` | 按 Esc 时清除选区 / 取消拖动 |
| `clearOnResize` | `boolean` | `true` | 内容宽度变化（重新排版）时清除选区；为 `false` 时保持选区坐标不变 |

`Region` 为 `{ x, y, width, height }`，单位 CSS 像素，相对于内容区域左上角。它按布局像素计算，内容被 CSS transform 缩放时不会变化。

### CaptureOptions

| 名称 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `scale` | `number` | 见说明 | 每个 CSS 像素对应的输出像素。直接裁剪时默认按源图分辨率，其他情况默认 `devicePixelRatio` |
| `type` | `'image/png' \| 'image/jpeg' \| 'image/webp'` | `'image/png'` | 输出格式 |
| `quality` | `number` | – | JPEG / WebP 的质量，0 ~ 1 |
| `minWidth` | `number` | `0` | 输出图片最小宽度（px），不足时居中补齐 |
| `minHeight` | `number` | `0` | 输出图片最小高度（px） |
| `padColor` | `string` | `'#ffffff'` | 补齐区域的颜色 |
| `fastCrop` | `boolean` | `true` | 选区完全落在单个未被遮挡的 `<img>` / `<canvas>` 上时直接从源图裁剪 |
| `renderer` | `CaptureRenderer` | html2canvas | 自定义渲染器，见下文 |
| `html2canvas` | `Partial<Options>` | – | 透传给默认渲染器的 [html2canvas 参数](https://html2canvas.hertzen.com/configuration) |

### 事件 / 回调

| Vue 事件 | React / 原生 JS | 参数 | 说明 |
| --- | --- | --- | --- |
| `update:region` | `onRegionChange`（仅 React） | `(region \| null)` | 选区变化（框选、移动、调整、清除完成后） |
| `select` | `onSelect` | `(region)` | 用户完成框选、移动或调整选区 |
| `capture` | `onCapture` | `(imageData, region)` | 截图完成，`imageData` 为 base64 Data URL |
| `clear` | `onClear` | `()` | 选区被清除 |
| `error` | `onError` | `(error)` | 截图失败 |
| – | `onChange`（仅原生 JS） | `(state)` | 状态变化，拖动过程中的每次移动不会触发 |

### 工具栏

Vue 的 `#toolbar` 插槽和 React 的 `renderToolbar` 收到相同的参数：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `region` | `Region` | 当前选区 |
| `imageData` | `string \| null` | 截图结果，完成前为 `null` |
| `capturing` | `boolean` | 是否正在截图 |
| `scrollCapture` | `{ height, lost } \| null` | 滚动截图进度，未在滚动截图时为 `null` |
| `getImage` | `() => Promise<string \| null>` | 获取 Data URL，截图中会等待其完成 |
| `getBlob` | `() => Promise<Blob \| null>` | 获取 `Blob`，可直接放进 `FormData` 上传 |
| `getFile` | `(filename?) => Promise<File \| null>` | 获取 `File`，默认文件名 `region.png` / `.jpg` / `.webp` |
| `clear` | `() => void` | 清除选区 |
| `startScrollCapture` / `finishScrollCapture` / `cancelScrollCapture` | | 见[滚动截图](#滚动截图长图) |

拖动过程中不显示工具栏。

### 实例方法

Vue 模板 ref、React ref 和 core 实例上都可以调用。

| 方法 | 说明 |
| --- | --- |
| `getImage()` / `getBlob()` / `getFile(filename?)` | 获取当前选区截图，没有选区时返回 `null` |
| `setRegion(region \| null)` | 用代码设置选区（会裁剪到内容范围内），传 `null` 清除；不会触发 `select` |
| `clear()` | 清除选区，并作废进行中的截图 |
| `refresh()` | 重新定位选区和工具栏，如修改缩放之后（尺寸变化会自动检测） |
| `startScrollCapture()` | 开始[滚动截图](#滚动截图长图)，需要 `createScreenCapture().renderer` |
| `finishScrollCapture()` | 结束滚动截图，返回拼接好的长图（Data URL） |
| `cancelScrollCapture()` | 取消滚动截图，回到普通选区 |
| `setToolbar(el)` | （仅原生 JS）指定工具栏元素 |
| `setOptions(options)` | （仅原生 JS）更新配置 |
| `destroy()` | （仅原生 JS）移除事件监听和注入的元素 |
| `state` | （仅原生 JS）当前状态 `{ region, drawing, capturing, imageData, scrollCapture }` |

## 自定义渲染器

默认渲染器按需加载 html2canvas。如需使用 [html2canvas-pro](https://github.com/yorickshan/html2canvas-pro)（支持 `oklch()`、`color()` 等）：

```ts
import html2canvasPro from 'html2canvas-pro'
import { html2canvasRenderer } from '@region-snap/core'

const captureOptions = { renderer: html2canvasRenderer({ backgroundColor: null }, html2canvasPro) }
```

也可以自己实现，如基于 [modern-screenshot](https://github.com/qq15725/modern-screenshot)。渲染器收到内容元素和按未缩放布局像素计算的选区，需要返回 `width × scale` 乘 `height × scale` 的 canvas：

```ts
import type { CaptureRenderer } from '@region-snap/core'

const renderer: CaptureRenderer = async (element, { x, y, width, height, scale }) => {
  // ...
  return canvas
}
```

## 跨域 iframe

浏览器不允许脚本读取跨域 iframe 的像素，所以 html2canvas（以及任何基于 DOM 的渲染器）都截不到 Office Online、OfficeWeb365 这类第三方文档预览。`createScreenCapture()` 通过 [`getDisplayMedia`](https://developer.mozilla.org/zh-CN/docs/Web/API/MediaDevices/getDisplayMedia) 共享当前标签页，从屏幕上实际显示的画面中裁剪选区：

```vue
<template>
  <button v-if="!snapping" @click="enter">截图模式</button>
  <button v-else @click="exit">退出</button>

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
  await screen.start() // 必须在点击事件中调用，浏览器会请求授权
  snapping.value = true
}
const exit = () => {
  screen.stop()
  snapping.value = false
}
onBeforeUnmount(() => screen.stop())
</script>
```

- 可以框选时，包含 iframe 的内容上会盖一层透明遮挡，拖动才能被 region-snap 接收。用 `disabled` 在「浏览（滚动文档）」和「框选」之间切换；
- 截图时会隐藏选区框、遮罩和工具栏一帧，不会出现在截图里；
- 仅支持桌面端 Chrome / Edge，需要 HTTPS（或 localhost）。共享期间浏览器会显示「正在共享此标签页」提示条，用完调用 `stop()`；
- 只能截到屏幕上可见的部分；盖在选区上的弹窗、提示等也会被截进去。

### 滚动截图（长图）

需要截取超过一屏的内容时，框选后开始滚动截图：iframe 恢复可滚动，用户在选区内滚动文档，region-snap 比对相邻帧的重叠部分，拼接成一张长图（往回滚也可以）。

```vue
<template #toolbar="{ scrollCapture, startScrollCapture, finishScrollCapture, cancelScrollCapture, getFile }">
  <template v-if="scrollCapture">
    <span>{{ scrollCapture.lost ? '滚动太快，请往回滚一点' : `已拼接 ${scrollCapture.height}px` }}</span>
    <button @click="finishScrollCapture()">完成</button>
    <button @click="cancelScrollCapture()">取消</button>
  </template>
  <button v-else @click="startScrollCapture()">滚动截图</button>
</template>
```

`finishScrollCapture()` 返回长图，之后 `getImage()` / `getBlob()` / `getFile()` 返回的也是长图；按 Esc 取消。拼接依赖相邻帧的重叠部分，因此：

- 滚动速度适中：两帧之间内容移动超过选区高度的约 80% 时会暂停拼接（`lost: true`），往回滚到有重叠的位置即可继续；
- 大片空白、重复的内容、在选区内固定不动的元素（悬浮工具条、吸顶表头）会影响比对，尽量不要框进选区；
- 选区占满可视区域、工具栏只能压在选区上时，只录制选区中没被工具栏挡住的（上方或下方较大的）那部分；
- 长图高度上限为 16384 像素。

## 自定义样式

样式插入在 `<head>` 最前面，你自己的 CSS 优先级更高。

```css
.region-snap {
  --region-snap-color: #f56c6c; /* 手柄、尺寸提示 */
  --region-snap-selection-border: 2px solid #f56c6c;
  --region-snap-selection-bg: rgba(245, 108, 108, 0.15);
  --region-snap-mask: rgba(0, 0, 0, 0.5);
}
.region-snap__toolbar {
  /* 默认是带阴影的白色卡片 */
}
```

| 选择器 | 元素 |
| --- | --- |
| `.region-snap` | 滚动容器；带有 `data-disabled`、`data-mask`、`data-editable`、`data-touch-mode`、`data-screen-capturing`、`data-scrolling` 属性 |
| `.region-snap__content` | 内容区域 |
| `.region-snap__selection` | 选区框；框选过程中带 `data-mode="draw"` |
| `.region-snap__handle[data-handle="nw"]` | 调整手柄：`n`、`s`、`e`、`w`、`nw`、`ne`、`sw`、`se` |
| `.region-snap__size` | 尺寸提示；显示在选区内部时带 `data-inside` |
| `.region-snap__toolbar` | 工具栏 |

## 注意事项

直接裁剪 `<img>` / `<canvas>` 是像素级精确的；其他内容通过 html2canvas 渲染，因此：

- 跨域图片需要服务端返回 CORS 头，否则截图中会缺失；
- `<iframe>` 内的内容无法截取，请改用[共享标签页截图](#跨域-iframe)；
- 部分新的 CSS 特性（如 `oklch()` 颜色）不受支持，可按上文换用 html2canvas-pro。

## 开发

```bash
pnpm install
pnpm dev        # 启动 playground（Vue / React / 跨域 iframe 示例）
pnpm test       # 单元测试（vitest + happy-dom）
pnpm test:e2e   # 端到端测试（Playwright，首次运行先执行 pnpm exec playwright install chromium）
pnpm typecheck  # 类型检查
pnpm build      # 构建所有包
```

### 发布

使用 [changesets](https://github.com/changesets/changesets) 管理版本，三个包版本号保持一致。

1. 在 PR 中执行 `pnpm changeset`，描述本次改动；
2. 合并后 Release 工作流会自动创建「Version Packages」PR；
3. 合并该 PR 即通过 npm 可信发布（Trusted Publishing）发布到 npm，无需 token（需要在三个包的 npm 设置中把 `Jacky010/region-snap` 的 `release.yml` 登记为 Trusted Publisher）。

手动发布：`pnpm version-packages && pnpm release`。

## License

region-snap 采用双协议授权：

- **[AGPL-3.0](./LICENSE)**：可以免费使用（包括用在开源项目中），前提是使用了 region-snap 的整个项目（包括通过网络向用户提供服务的软件）也以 AGPL-3.0 协议公开完整源代码。
- **商业授权**：闭源或商业产品需购买商业授权，请联系 1126651826@qq.com。
