import { cropFromMedia, html2canvasRenderer, padCanvas } from './capture'
import { injectStyle } from './style'
import type { Region, RegionSnapOptions, RegionSnapState, ScrollRecorder, TouchMode } from './types'

const DEFAULT_OPTIONS = {
  disabled: false,
  minSize: 5,
  autoCapture: true,
  editable: true,
  mask: false,
  showSize: false,
  autoScroll: true,
  touchMode: 'longpress' as TouchMode,
  longPressDelay: 400,
  toolbarOffset: 10,
  clearOnClickOutside: true,
  clearOnEscape: true,
  clearOnResize: true,
}

type ResolvedOptions = RegionSnapOptions & typeof DEFAULT_OPTIONS

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = (typeof HANDLES)[number]
type Mode = 'draw' | 'move' | 'resize'

interface Point {
  x: number
  y: number
}

interface PointerInput {
  clientX: number
  clientY: number
  pointerId: number
}

interface Interaction {
  mode: Mode
  handle?: Handle
  pointerId: number
  /** 按下时的内容坐标 */
  start: Point
  /** 移动/调整前的选区 */
  startRegion: Region | null
}

interface PendingTouch {
  pointerId: number
  x: number
  y: number
  timer: ReturnType<typeof setTimeout>
}

const AUTO_SCROLL_EDGE = 40
const AUTO_SCROLL_MAX_SPEED = 24
const LONG_PRESS_TOLERANCE = 8
const SIZE_LABEL_HEIGHT = 24
/** 滚动截图避开工具栏时额外留出的距离（工具栏阴影） */
const TOOLBAR_CLEARANCE = 8
const MIN_SCROLL_CAPTURE_HEIGHT = 40

/** 值为 undefined 的配置项回退到默认值 */
const resolveOptions = (options: RegionSnapOptions): ResolvedOptions => ({
  ...DEFAULT_OPTIONS,
  ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)),
})

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const rectFromPoints = (a: Point, b: Point): Region => {
  const x = Math.round(Math.min(a.x, b.x))
  const y = Math.round(Math.min(a.y, b.y))
  return {
    x,
    y,
    width: Math.round(Math.max(a.x, b.x)) - x,
    height: Math.round(Math.max(a.y, b.y)) - y,
  }
}

/** 指针距离容器边缘越近（或越过边缘越多），滚动越快 */
const edgeSpeed = (pos: number, start: number, end: number) => {
  const edge = Math.min(AUTO_SCROLL_EDGE, (end - start) / 4)
  if (pos < start + edge) return -Math.ceil(Math.min(1, (start + edge - pos) / edge) * AUTO_SCROLL_MAX_SPEED)
  if (pos > end - edge) return Math.ceil(Math.min(1, (pos - end + edge) / edge) * AUTO_SCROLL_MAX_SPEED)
  return 0
}

export const isSameRegion = (a?: Region | null, b?: Region | null) =>
  a === b ||
  (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)

export const createInitialState = (): RegionSnapState => ({
  region: null,
  drawing: false,
  capturing: false,
  imageData: null,
  scrollCapture: null,
})

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/**
 * 在 content 元素上拖动框选区域并截图。
 * container 是滚动容器，选区框和工具栏都定位在它里面；content 是被框选的内容，必须是 container 的子元素。
 */
export class RegionSnap {
  private options: ResolvedOptions
  private readonly doc: Document
  private readonly selectionEl: HTMLDivElement
  private readonly sizeEl: HTMLDivElement
  private readonly resizeObserver?: ResizeObserver
  private toolbarEl: HTMLElement | null = null
  private positioned: { el: HTMLElement; region: Region } | null = null
  private interaction: Interaction | null = null
  private pending: PendingTouch | null = null
  private lastPointer: Point | null = null
  private frame = 0
  private scrollFrame = 0
  private lastContentWidth: number
  private captureSeq = 0
  private capturePromise: Promise<HTMLCanvasElement | null> | null = null
  private lastResult: { canvas: HTMLCanvasElement; imageData: string } | null = null
  private recorder: Promise<ScrollRecorder> | null = null
  private scrollSeq = 0
  private current: RegionSnapState = createInitialState()
  private destroyed = false

  constructor(
    private readonly container: HTMLElement,
    private readonly content: HTMLElement,
    options: RegionSnapOptions = {},
  ) {
    this.options = resolveOptions(options)
    this.doc = container.ownerDocument
    injectStyle(this.doc)

    container.classList.add('region-snap')
    content.classList.add('region-snap__content')

    this.selectionEl = this.createDiv('region-snap__selection')
    this.selectionEl.hidden = true
    this.sizeEl = this.createDiv('region-snap__size')
    this.selectionEl.appendChild(this.sizeEl)
    for (const handle of HANDLES) {
      this.selectionEl.appendChild(this.createDiv('region-snap__handle')).dataset.handle = handle
    }
    container.appendChild(this.selectionEl)
    this.syncAttributes()

    content.addEventListener('pointerdown', this.handleContentPointerDown)
    content.addEventListener('dragstart', this.preventDefault)
    content.addEventListener('contextmenu', this.handleContextMenu)
    content.addEventListener('touchmove', this.handleTouchMove, { passive: false })
    this.selectionEl.addEventListener('pointerdown', this.handleSelectionPointerDown)
    this.doc.addEventListener('pointerdown', this.handleDocumentPointerDown)
    this.doc.addEventListener('keydown', this.handleKeyDown)
    container.addEventListener('scroll', this.handleScroll, { passive: true })

    this.lastContentWidth = content.offsetWidth
    const ResizeObserverCtor = this.view?.ResizeObserver
    if (ResizeObserverCtor) {
      this.resizeObserver = new ResizeObserverCtor(this.handleResize)
      this.resizeObserver.observe(content)
      this.resizeObserver.observe(container)
    }
  }

  get state(): RegionSnapState {
    return this.current
  }

  /** 合并更新配置；显式传 undefined 的项会恢复默认值 */
  setOptions(options: RegionSnapOptions) {
    this.options = resolveOptions({ ...this.options, ...options })
    this.syncAttributes()
    this.syncSelection()
    if (this.options.disabled) {
      this.cancelPending()
      this.cancelInteraction()
      this.cancelScrollCapture()
    }
  }

  /**
   * 指定工具栏元素。有选区时会显示并自动定位到选区下方（放不下时放到上方），没有选区时隐藏。
   * 传 null 解除绑定。
   */
  setToolbar(el: HTMLElement | null) {
    this.toolbarEl = el
    if (!el) return
    el.classList.add('region-snap__toolbar')
    this.syncToolbar()
  }

  /** 用代码设置选区（会裁剪到内容范围内），传 null 清除。不会触发 onSelect */
  setRegion = (region: Region | null) => {
    this.cancelPending()
    if (this.interaction) this.endInteraction()
    if (!region) {
      this.clear()
      return
    }

    const { width: maxWidth, height: maxHeight } = this.getContentSize()
    let { x, y, width, height } = region
    if (maxWidth > 0 && maxHeight > 0) {
      x = clamp(x, 0, maxWidth)
      y = clamp(y, 0, maxHeight)
      width = clamp(width, 0, maxWidth - x)
      height = clamp(height, 0, maxHeight - y)
    }
    const next = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
    if (isSameRegion(next, this.current.region)) {
      if (this.current.drawing) this.update({ drawing: false })
      return
    }

    this.stopScrollCapture()
    this.invalidateCapture()
    this.update({ region: next, drawing: false })
    if (this.options.autoCapture) this.capture(next)
  }

  /** 内容缩放、位置变化后重新定位选区框和工具栏 */
  refresh = () => {
    this.syncSelection()
    this.positioned = null
    this.syncToolbar()
  }

  /** 获取当前选区的截图（base64 Data URL），截图进行中会等待其完成 */
  getImage = async (): Promise<string | null> => {
    const canvas = await this.getCanvas()
    if (!canvas) return null
    if (this.lastResult?.canvas === canvas) return this.lastResult.imageData
    const { type = 'image/png', quality } = this.options.captureOptions ?? {}
    return canvas.toDataURL(type, quality)
  }

  /** 获取当前选区的截图（Blob），适合直接上传 */
  getBlob = async (): Promise<Blob | null> => {
    const canvas = await this.getCanvas()
    if (!canvas) return null
    const { type = 'image/png', quality } = this.options.captureOptions ?? {}
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
  }

  /** 获取当前选区的截图（File），默认文件名 region.png / region.jpg / region.webp */
  getFile = async (filename?: string): Promise<File | null> => {
    const blob = await this.getBlob()
    if (!blob) return null
    return new File([blob], filename ?? `region.${EXTENSIONS[blob.type] ?? 'png'}`, { type: blob.type })
  }

  /**
   * 开始滚动截图：之后用户滚动选区内的内容（如 iframe 中的文档），组件持续取帧并拼接，
   * 调用 finishScrollCapture() 得到长图。需要渲染器支持，如 createScreenCapture().renderer
   */
  startScrollCapture = async (): Promise<void> => {
    const r = this.current.region
    const renderer = this.options.captureOptions?.renderer
    if (!r || this.current.drawing || this.current.scrollCapture || this.options.disabled) return
    if (!renderer?.scroll) {
      this.reportError(new Error('region-snap: scroll capture requires a renderer that supports it, e.g. createScreenCapture().renderer'))
      return
    }

    this.cancelPending()
    this.invalidateCapture()
    const seq = ++this.scrollSeq
    this.update({ scrollCapture: { height: 0, lost: false } })

    const { contentScale: k } = this.measure()
    const scale = (this.options.captureOptions?.scale ?? (this.view?.devicePixelRatio || 1)) * k
    const recorder = renderer.scroll(this.content, {
      ...this.excludeToolbar(r),
      scale,
      onProgress: (progress) => {
        if (seq === this.scrollSeq) this.update({ scrollCapture: progress })
      },
    })
    this.recorder = recorder
    try {
      await recorder
    } catch (error) {
      if (seq !== this.scrollSeq) return
      this.stopScrollCapture()
      this.update({})
      this.reportError(error)
    }
  }

  /** 结束滚动截图，返回长图（base64 Data URL）；之后 getImage / getBlob / getFile 返回的也是长图 */
  finishScrollCapture = async (): Promise<string | null> => {
    const recorder = this.recorder
    const r = this.current.region
    if (!recorder || !r) return null
    this.recorder = null
    const seq = ++this.scrollSeq

    const { minWidth = 0, minHeight = 0, padColor = '#ffffff' } = this.options.captureOptions ?? {}
    const rendering = recorder
      .then((rec) => rec.finish())
      .then((canvas) => padCanvas(canvas, minWidth, minHeight, padColor))
      .catch((error) => {
        this.reportError(error)
        return null
      })
      .then((canvas) => {
        if (seq === this.scrollSeq) this.resetScrollState()
        return canvas
      })
    const canvas = await this.capture(r, rendering)
    return canvas ? this.current.imageData : null
  }

  /** 取消滚动截图，回到普通选区 */
  cancelScrollCapture = () => {
    if (!this.current.scrollCapture) return
    this.stopScrollCapture()
    this.update({})
    const r = this.current.region
    if (r && this.options.autoCapture) this.capture(r)
  }

  /** 清除选区，并作废进行中的截图 */
  clear = () => {
    this.stopScrollCapture()
    this.cancelPending()
    if (this.interaction) this.endInteraction()
    const hadRegion = !!this.current.region
    this.invalidateCapture()
    this.update({ region: null, drawing: false })
    if (hadRegion) this.options.onClear?.()
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.captureSeq++
    this.stopScrollCapture()
    this.cancelPending()
    if (this.interaction) this.endInteraction()
    this.resizeObserver?.disconnect()
    this.content.removeEventListener('pointerdown', this.handleContentPointerDown)
    this.content.removeEventListener('dragstart', this.preventDefault)
    this.content.removeEventListener('contextmenu', this.handleContextMenu)
    this.content.removeEventListener('touchmove', this.handleTouchMove)
    this.doc.removeEventListener('pointerdown', this.handleDocumentPointerDown)
    this.doc.removeEventListener('keydown', this.handleKeyDown)
    this.container.removeEventListener('scroll', this.handleScroll)
    if (this.scrollFrame) this.view?.cancelAnimationFrame(this.scrollFrame)
    this.selectionEl.remove()
    this.toolbarEl = null
  }

  private get view() {
    return this.doc.defaultView
  }

  private createDiv(className: string) {
    const el = this.doc.createElement('div')
    el.className = className
    return el
  }

  // ---------- 状态与渲染 ----------

  private update(patch: Partial<RegionSnapState>, silent = false) {
    this.current = { ...this.current, ...patch }
    this.syncSelection()
    if (silent) return
    this.syncToolbar()
    this.options.onChange?.(this.current)
  }

  /** 工具栏压在选区上时，滚动截图只录制选区中没被工具栏挡住的（较大的）那部分，否则工具栏会被拼进长图 */
  private excludeToolbar(r: Region): Region {
    const el = this.toolbarEl
    if (!el || el.hidden) return r
    const { contentRect, contentScale: k } = this.measure()
    const rect = el.getBoundingClientRect()
    const top = (rect.top - contentRect.top) / k - TOOLBAR_CLEARANCE
    const bottom = (rect.bottom - contentRect.top) / k + TOOLBAR_CLEARANCE
    const left = (rect.left - contentRect.left) / k
    const right = (rect.right - contentRect.left) / k
    if (bottom <= r.y || top >= r.y + r.height || right <= r.x || left >= r.x + r.width) return r

    const above = Math.floor(top - r.y)
    const below = Math.floor(r.y + r.height - bottom)
    if (Math.max(above, below) < MIN_SCROLL_CAPTURE_HEIGHT) return r
    return above >= below ? { ...r, height: above } : { ...r, y: r.y + r.height - below, height: below }
  }

  /** 停止滚动截图并重置状态（不触发回调） */
  private stopScrollCapture() {
    this.scrollSeq++
    const recorder = this.recorder
    this.recorder = null
    recorder?.then(
      (rec) => rec.cancel(),
      () => {},
    )
    this.resetScrollState()
  }

  private resetScrollState() {
    if (!this.current.scrollCapture) return
    this.current = { ...this.current, scrollCapture: null }
    this.syncSelection()
  }

  private invalidateCapture() {
    this.captureSeq++
    this.capturePromise = null
    this.current = { ...this.current, capturing: false, imageData: null }
  }

  private syncAttributes() {
    const { container, options } = this
    container.toggleAttribute('data-disabled', options.disabled)
    container.toggleAttribute('data-editable', options.editable)
    container.toggleAttribute('data-mask', options.mask)
    container.dataset.touchMode = options.touchMode
    this.sizeEl.hidden = !options.showSize
  }

  private syncSelection() {
    this.container.toggleAttribute('data-scrolling', !!this.current.scrollCapture)
    const r = this.current.region
    this.selectionEl.hidden = !r
    if (!r) return

    const box = this.toContainerBox(r)
    const { style } = this.selectionEl
    style.left = `${box.left}px`
    style.top = `${box.top}px`
    style.width = `${box.width}px`
    style.height = `${box.height}px`
    this.selectionEl.dataset.mode = this.interaction?.mode ?? 'idle'

    if (this.options.showSize) {
      this.sizeEl.textContent = `${r.width} × ${r.height}`
      this.sizeEl.toggleAttribute('data-inside', box.top - this.container.scrollTop < SIZE_LABEL_HEIGHT)
    }
  }

  private syncToolbar() {
    const el = this.toolbarEl
    if (!el) return
    const r = this.current.region
    const visible = !!r && !this.current.drawing
    el.hidden = !visible
    if (!visible) {
      this.positioned = null
      return
    }
    if (this.positioned?.el === el && this.positioned.region === r) return
    this.positionToolbar(el, r)
    this.positioned = { el, region: r }
  }

  /**
   * 工具栏优先放在选区下方，下方可视区域放不下时放到上方；
   * 上下都放不下（选区占满可视区域）或选区滚出可视区域时，限制在可视区域内，压在选区上
   */
  private positionToolbar(el: HTMLElement, r: Region) {
    const { container } = this
    const sel = this.toContainerBox(r)
    const { offsetWidth: width, offsetHeight: height } = el
    const offset = this.options.toolbarOffset
    const viewTop = container.scrollTop
    const viewBottom = viewTop + container.clientHeight
    const viewLeft = container.scrollLeft
    const viewRight = viewLeft + container.clientWidth

    let top = sel.top + sel.height + offset
    if (top + height > viewBottom && sel.top - offset - height >= viewTop) {
      top = sel.top - offset - height
    }
    top = clamp(top, viewTop + offset, Math.max(viewTop + offset, viewBottom - height - offset))
    const left = clamp(sel.left + sel.width / 2 - width / 2, viewLeft, Math.max(viewLeft, viewRight - width))

    el.style.top = `${top}px`
    el.style.left = `${left}px`
  }

  // ---------- 坐标换算 ----------

  /** 内容与容器的视口矩形，以及各自的 CSS transform 缩放比例 */
  private measure() {
    const { container, content } = this
    const contentRect = content.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    return {
      contentRect,
      containerRect,
      contentScale: content.offsetWidth ? contentRect.width / content.offsetWidth : 1,
      containerScale: container.offsetWidth ? containerRect.width / container.offsetWidth : 1,
    }
  }

  private getContentSize() {
    const { content } = this
    return {
      width: Math.max(content.offsetWidth, content.scrollWidth),
      height: Math.max(content.offsetHeight, content.scrollHeight),
    }
  }

  /** 视口坐标 → 内容坐标（裁剪到内容范围内） */
  private toContentPoint(clientX: number, clientY: number): Point {
    const { contentRect, contentScale } = this.measure()
    const { width, height } = this.getContentSize()
    return {
      x: clamp((clientX - contentRect.left) / contentScale, 0, width),
      y: clamp((clientY - contentRect.top) / contentScale, 0, height),
    }
  }

  /** 内容坐标的选区 → 容器内的绝对定位坐标 */
  private toContainerBox(r: Region) {
    const { container } = this
    const { contentRect, containerRect, contentScale, containerScale } = this.measure()
    const k = contentScale / containerScale
    const originX = (contentRect.left - containerRect.left) / containerScale - container.clientLeft + container.scrollLeft
    const originY = (contentRect.top - containerRect.top) / containerScale - container.clientTop + container.scrollTop
    return { left: originX + r.x * k, top: originY + r.y * k, width: r.width * k, height: r.height * k }
  }

  // ---------- 指针交互 ----------

  private handleContentPointerDown = (event: PointerEvent) => {
    if (this.options.disabled || event.button !== 0 || this.interaction || this.pending || this.current.scrollCapture) return
    if (event.pointerType === 'touch' && this.options.touchMode === 'longpress') {
      this.startLongPress(event)
      return
    }
    event.preventDefault()
    this.begin('draw', event)
  }

  private handleSelectionPointerDown = (event: PointerEvent) => {
    const { disabled, editable } = this.options
    if (disabled || !editable || event.button !== 0 || this.interaction || !this.current.region || this.current.scrollCapture) return
    event.preventDefault()
    const handle = (event.target as HTMLElement).dataset?.handle as Handle | undefined
    this.begin(handle ? 'resize' : 'move', event, handle)
  }

  private begin(mode: Mode, input: PointerInput, handle?: Handle) {
    const start = this.toContentPoint(input.clientX, input.clientY)
    const startRegion = mode === 'draw' ? null : this.current.region
    if (mode === 'draw') this.clear()

    this.interaction = { mode, handle, pointerId: input.pointerId, start, startRegion }
    this.lastPointer = { x: input.clientX, y: input.clientY }
    this.update({ drawing: true, region: startRegion ?? { ...start, width: 0, height: 0 } })

    this.doc.addEventListener('pointermove', this.handlePointerMove)
    this.doc.addEventListener('pointerup', this.handlePointerUp)
    this.doc.addEventListener('pointercancel', this.cancelInteraction)
  }

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.interaction || event.pointerId !== this.interaction.pointerId) return
    this.lastPointer = { x: event.clientX, y: event.clientY }
    this.applyPointer()
    this.startAutoScroll()
  }

  private applyPointer() {
    const it = this.interaction
    const pointer = this.lastPointer
    if (!it || !pointer) return

    const p = this.toContentPoint(pointer.x, pointer.y)
    const s = it.startRegion
    let region: Region

    if (it.mode === 'draw' || !s) {
      region = rectFromPoints(it.start, p)
    } else {
      const { width: maxWidth, height: maxHeight } = this.getContentSize()
      const dx = p.x - it.start.x
      const dy = p.y - it.start.y
      if (it.mode === 'move') {
        region = {
          x: Math.round(clamp(s.x + dx, 0, maxWidth - s.width)),
          y: Math.round(clamp(s.y + dy, 0, maxHeight - s.height)),
          width: s.width,
          height: s.height,
        }
      } else {
        const handle = it.handle!
        let x1 = s.x
        let y1 = s.y
        let x2 = s.x + s.width
        let y2 = s.y + s.height
        if (handle.includes('w')) x1 += dx
        if (handle.includes('e')) x2 += dx
        if (handle.includes('n')) y1 += dy
        if (handle.includes('s')) y2 += dy
        region = rectFromPoints(
          { x: clamp(x1, 0, maxWidth), y: clamp(y1, 0, maxHeight) },
          { x: clamp(x2, 0, maxWidth), y: clamp(y2, 0, maxHeight) },
        )
      }
    }
    this.update({ region }, true)
  }

  private handlePointerUp = (event: PointerEvent) => {
    const it = this.interaction
    if (!it || event.pointerId !== it.pointerId) return
    this.endInteraction()

    const r = this.current.region
    const tooSmall = !r || r.width <= this.options.minSize || r.height <= this.options.minSize
    if (it.mode === 'draw' && tooSmall) {
      this.update({ drawing: false, region: null })
      return
    }
    if (it.mode !== 'draw' && (tooSmall || isSameRegion(r, it.startRegion))) {
      this.update({ drawing: false, region: it.startRegion })
      return
    }

    this.invalidateCapture()
    this.update({ drawing: false })
    this.options.onSelect?.({ ...r! })
    if (this.options.autoCapture) this.capture(r!)
  }

  /** 取消正在进行的拖动：框选则清除，移动/调整则恢复原选区 */
  private cancelInteraction = () => {
    const it = this.interaction
    if (!it) return
    this.endInteraction()
    this.update({ drawing: false, region: it.mode === 'draw' ? null : it.startRegion })
  }

  private endInteraction() {
    this.interaction = null
    this.lastPointer = null
    if (this.frame) this.view?.cancelAnimationFrame(this.frame)
    this.frame = 0
    this.doc.removeEventListener('pointermove', this.handlePointerMove)
    this.doc.removeEventListener('pointerup', this.handlePointerUp)
    this.doc.removeEventListener('pointercancel', this.cancelInteraction)
  }

  private startAutoScroll() {
    if (!this.options.autoScroll || this.frame || !this.view) return
    this.frame = this.view.requestAnimationFrame(this.autoScrollStep)
  }

  private autoScrollStep = () => {
    this.frame = 0
    const pointer = this.lastPointer
    if (!this.interaction || !pointer) return

    const { container } = this
    const rect = container.getBoundingClientRect()
    const dx = edgeSpeed(pointer.x, rect.left, rect.right)
    const dy = edgeSpeed(pointer.y, rect.top, rect.bottom)
    if (!dx && !dy) return

    const { scrollLeft, scrollTop } = container
    if (dx) container.scrollLeft += dx
    if (dy) container.scrollTop += dy
    if (container.scrollLeft !== scrollLeft || container.scrollTop !== scrollTop) this.applyPointer()
    this.frame = this.view!.requestAnimationFrame(this.autoScrollStep)
  }

  // ---------- 触屏长按 ----------

  private startLongPress(event: PointerEvent) {
    const { pointerId, clientX, clientY } = event
    const timer = setTimeout(() => {
      this.cancelPending()
      this.begin('draw', { pointerId, clientX, clientY })
      this.view?.navigator.vibrate?.(10)
    }, this.options.longPressDelay)

    this.pending = { pointerId, x: clientX, y: clientY, timer }
    this.doc.addEventListener('pointermove', this.handlePendingMove)
    this.doc.addEventListener('pointerup', this.cancelPending)
    this.doc.addEventListener('pointercancel', this.cancelPending)
  }

  private handlePendingMove = (event: PointerEvent) => {
    const p = this.pending
    if (!p || event.pointerId !== p.pointerId) return
    if (Math.hypot(event.clientX - p.x, event.clientY - p.y) > LONG_PRESS_TOLERANCE) this.cancelPending()
  }

  private cancelPending = () => {
    if (!this.pending) return
    clearTimeout(this.pending.timer)
    this.pending = null
    this.doc.removeEventListener('pointermove', this.handlePendingMove)
    this.doc.removeEventListener('pointerup', this.cancelPending)
    this.doc.removeEventListener('pointercancel', this.cancelPending)
  }

  /** 长按开始框选后阻止页面滚动 */
  private handleTouchMove = (event: TouchEvent) => {
    if (this.interaction && event.cancelable) event.preventDefault()
  }

  private handleContextMenu = (event: Event) => {
    if (this.pending || this.interaction) event.preventDefault()
  }

  // ---------- 其他事件 ----------

  private handleDocumentPointerDown = (event: PointerEvent) => {
    if (!this.options.clearOnClickOutside || this.interaction || this.current.scrollCapture) return
    if (!this.container.contains(event.target as Node)) this.clear()
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!this.options.clearOnEscape || event.key !== 'Escape') return
    if (this.current.scrollCapture) this.cancelScrollCapture()
    else if (this.pending) this.cancelPending()
    else if (this.interaction) this.cancelInteraction()
    else this.clear()
  }

  private handleResize = () => {
    const width = this.content.offsetWidth
    const widthChanged = width !== this.lastContentWidth
    this.lastContentWidth = width
    if (widthChanged && this.options.clearOnResize && this.current.region && !this.interaction) {
      this.clear()
      return
    }
    this.refresh()
  }

  /** 容器滚动后重新定位工具栏，避免随选区滚出可视区域 */
  private handleScroll = () => {
    if (this.scrollFrame || this.interaction || !this.view) return
    this.scrollFrame = this.view.requestAnimationFrame(() => {
      this.scrollFrame = 0
      this.positioned = null
      this.syncToolbar()
    })
  }

  private preventDefault = (event: Event) => event.preventDefault()

  // ---------- 截图 ----------

  private getCanvas(): Promise<HTMLCanvasElement | null> {
    const { region, drawing } = this.current
    if (!region || drawing) return Promise.resolve(null)
    return this.capturePromise ?? this.capture(region)
  }

  private capture(r: Region, rendering: Promise<HTMLCanvasElement | null> = this.renderCanvas(r)) {
    const seq = ++this.captureSeq
    this.update({ capturing: true, imageData: null })

    const promise = rendering.then((rendered) => {
      if (seq !== this.captureSeq) return rendered
      let canvas = rendered
      let imageData: string | null = null
      if (canvas) {
        try {
          const { type = 'image/png', quality } = this.options.captureOptions ?? {}
          imageData = canvas.toDataURL(type, quality)
          this.lastResult = { canvas, imageData }
        } catch (error) {
          this.reportError(error)
          canvas = null
        }
      }
      if (!canvas) this.capturePromise = null
      this.update({ capturing: false, imageData })
      if (imageData) this.options.onCapture?.(imageData, { ...r })
      return canvas
    })
    this.capturePromise = promise
    return promise
  }

  private async renderCanvas(r: Region): Promise<HTMLCanvasElement | null> {
    const {
      scale,
      fastCrop = true,
      renderer,
      html2canvas,
      minWidth = 0,
      minHeight = 0,
      padColor = '#ffffff',
    } = this.options.captureOptions ?? {}

    try {
      const { contentRect, contentScale: k } = this.measure()
      const box = { x: r.x * k, y: r.y * k, width: r.width * k, height: r.height * k }
      const clientRect = { left: contentRect.left + box.x, top: contentRect.top + box.y, width: box.width, height: box.height }

      let canvas = fastCrop ? cropFromMedia(this.content, clientRect, scale) : null
      if (!canvas) {
        const render = renderer ?? html2canvasRenderer(html2canvas)
        const outputScale = (scale ?? (this.view?.devicePixelRatio || 1)) * k
        // 只渲染选区范围，避免长文档整页渲染过慢或超出浏览器 canvas 尺寸上限
        canvas = await render(this.content, { x: r.x, y: r.y, width: r.width, height: r.height, scale: outputScale })
      }
      return padCanvas(canvas, minWidth, minHeight, padColor)
    } catch (error) {
      this.reportError(error)
      return null
    }
  }

  private reportError(error: unknown) {
    if (!this.destroyed) this.options.onError?.(error)
  }
}
