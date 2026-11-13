import type { Options as Html2CanvasOptions } from 'html2canvas'

/** 选区，单位为 CSS 像素，相对于内容元素左上角（不受 CSS transform 缩放影响） */
export interface Region {
  x: number
  y: number
  width: number
  height: number
}

/** 截图渲染器收到的参数 */
export interface CaptureRendererOptions {
  /** 选区，相对元素左上角的布局像素（不含 CSS transform 缩放） */
  x: number
  y: number
  width: number
  height: number
  /** 输出像素 / 布局像素 */
  scale: number
}

/** 滚动截图的进度 */
export interface ScrollCaptureProgress {
  /** 已拼接的高度（输出像素） */
  height: number
  /** 滚动过快，找不到与上一帧重叠的部分；往回滚一点即可恢复 */
  lost: boolean
}

export interface ScrollCaptureOptions extends CaptureRendererOptions {
  onProgress?: (progress: ScrollCaptureProgress) => void
}

/** 正在进行的滚动截图 */
export interface ScrollRecorder {
  /** 停止录制，返回拼接好的长图 */
  finish(): Promise<HTMLCanvasElement>
  cancel(): void
}

/** 自定义截图渲染器：按元素未缩放的布局尺寸渲染选区，返回尺寸为 width × height × scale 的 canvas */
export interface CaptureRenderer {
  (element: HTMLElement, options: CaptureRendererOptions): Promise<HTMLCanvasElement>
  /** 支持滚动截图的渲染器提供（如 createScreenCapture().renderer）：用户滚动选区内的内容，边录边拼接 */
  scroll?: (element: HTMLElement, options: ScrollCaptureOptions) => Promise<ScrollRecorder>
}

export interface CaptureOptions {
  /**
   * 截图倍率。未指定时：直接从 img/canvas 裁剪的按源图原始分辨率输出，其他内容按 devicePixelRatio 输出
   */
  scale?: number
  /** 输出图片格式，默认 image/png */
  type?: 'image/png' | 'image/jpeg' | 'image/webp'
  /** jpeg/webp 的图片质量 0~1 */
  quality?: number
  /** 输出图片最小宽度（物理像素），不足时居中并用 padColor 补齐 */
  minWidth?: number
  /** 输出图片最小高度（物理像素），不足时居中并用 padColor 补齐 */
  minHeight?: number
  /** 补齐区域的填充色，默认 #ffffff */
  padColor?: string
  /** 选区完全落在单个 img/canvas 上时直接从源图裁剪（更快、更清晰），默认 true */
  fastCrop?: boolean
  /** 自定义渲染器，默认使用 html2canvas */
  renderer?: CaptureRenderer
  /** 透传给默认渲染器 html2canvas 的参数 */
  html2canvas?: Partial<Html2CanvasOptions>
}

export interface RegionSnapState {
  /** 当前选区，没有选区时为 null */
  region: Region | null
  /** 是否正在拖动（框选、移动或调整选区） */
  drawing: boolean
  /** 是否正在截图 */
  capturing: boolean
  /** 最近一次截图结果（base64 Data URL） */
  imageData: string | null
  /** 滚动截图进度，未在滚动截图时为 null */
  scrollCapture: ScrollCaptureProgress | null
}

/** 触屏上开始框选的方式：长按后拖动（不影响滚动）或直接拖动（内容区域不能滚动） */
export type TouchMode = 'longpress' | 'drag'

export interface RegionSnapOptions {
  /** 禁用框选，默认 false */
  disabled?: boolean
  /** 选区宽高都超过该值才算有效选区，默认 5 */
  minSize?: number
  /** 框选完成后立即在后台截图，默认 true；为 false 时调用 getImage 才截图 */
  autoCapture?: boolean
  captureOptions?: CaptureOptions
  /** 选区完成后可拖动移动、拖动角点调整大小，默认 true */
  editable?: boolean
  /** 选区外显示半透明遮罩，默认 false */
  mask?: boolean
  /** 在选区上方显示尺寸，默认 false */
  showSize?: boolean
  /** 拖动到容器边缘时自动滚动，默认 true */
  autoScroll?: boolean
  /** 触屏上开始框选的方式，默认 longpress */
  touchMode?: TouchMode
  /** 长按多久开始框选（毫秒），默认 400 */
  longPressDelay?: number
  /** 工具栏与选区的间距，默认 10 */
  toolbarOffset?: number
  /** 点击外部时清除选区，默认 true */
  clearOnClickOutside?: boolean
  /** 按 Esc 时清除选区，默认 true */
  clearOnEscape?: boolean
  /** 内容宽度变化（重新排版）时清除选区，默认 true；为 false 时保持选区坐标不变 */
  clearOnResize?: boolean
  /** 状态变化回调（拖动过程中的每次移动不会触发） */
  onChange?: (state: RegionSnapState) => void
  /** 用户框选、移动或调整选区完成 */
  onSelect?: (region: Region) => void
  onCapture?: (imageData: string, region: Region) => void
  onClear?: () => void
  onError?: (error: unknown) => void
}
