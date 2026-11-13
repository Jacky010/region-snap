import { SAMPLE_COLUMNS, findOffset, toFrame } from './stitch'
import type { CaptureRenderer, CaptureRendererOptions, ScrollCaptureOptions, ScrollRecorder } from './types'

/** 滚动截图的最大高度（输出像素），避免超出浏览器 canvas 尺寸上限 */
const MAX_SCROLL_HEIGHT = 16384
/** 滚动截图的取帧间隔 */
const SCROLL_INTERVAL = 100

const createCanvas = (doc: Document, width: number, height: number) => {
  const canvas = doc.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

export interface ScreenCaptureOptions {
  /** 用户在浏览器的共享提示条上点了「停止共享」 */
  onEnded?: () => void
}

export interface ScreenCapture {
  /** 请求共享当前标签页。浏览器要求在点击等用户操作中调用；已在共享时直接返回 */
  start(): Promise<void>
  /** 停止共享 */
  stop(): void
  /** 是否正在共享 */
  readonly active: boolean
  /** 传给 captureOptions.renderer；未开始共享时会先调用 start() */
  readonly renderer: CaptureRenderer
}

const nextAnimationFrame = (view: Window) => new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()))

/** 等待视频流的下一帧；画面静止时浏览器可能不再产出新帧，超时后直接用当前帧 */
const nextVideoFrame = (video: HTMLVideoElement, timeout = 300) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeout)
    video.requestVideoFrameCallback?.(() => {
      clearTimeout(timer)
      resolve()
    })
  })

/**
 * 通过共享当前标签页截图，按屏幕上实际显示的画面裁剪选区。
 * 可以截取跨域 iframe（如 Office 在线预览）、视频、WebGL 等 html2canvas 无法渲染的内容；
 * 需要用户授权，仅桌面端 Chromium 内核浏览器支持，且只能截到当前可见的部分。
 */
export function createScreenCapture(options: ScreenCaptureOptions = {}): ScreenCapture {
  let stream: MediaStream | null = null
  let video: HTMLVideoElement | null = null
  let starting: Promise<void> | null = null

  const stop = () => {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    if (video) video.srcObject = null
    video = null
  }

  const open = async () => {
    const media = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
    } as DisplayMediaStreamOptions)
    const track = media.getVideoTracks()[0]
    const surface = track?.getSettings().displaySurface
    if (!track || (surface && surface !== 'browser')) {
      media.getTracks().forEach((t) => t.stop())
      throw new Error('region-snap: the current tab must be shared')
    }

    const el = document.createElement('video')
    el.muted = true
    el.playsInline = true
    el.srcObject = media
    await el.play()
    track.addEventListener('ended', () => {
      if (stream !== media) return
      stop()
      options.onEnded?.()
    })
    stream = media
    video = el
  }

  const start = () => {
    if (stream) return Promise.resolve()
    starting ??= open().finally(() => {
      starting = null
    })
    return starting
  }

  /** 等页面样式变化绘制出来，并且出现在视频流里 */
  const settle = async (view: Window) => {
    await nextAnimationFrame(view)
    await nextAnimationFrame(view)
    await nextVideoFrame(video!)
    await nextVideoFrame(video!)
  }

  /** 选区在视频帧中的位置 */
  const sourceRect = (element: HTMLElement, { x, y, width, height }: CaptureRendererOptions) => {
    const view = element.ownerDocument.defaultView!
    const rect = element.getBoundingClientRect()
    const k = element.offsetWidth ? rect.width / element.offsetWidth : 1
    const fx = video!.videoWidth / view.innerWidth
    const fy = video!.videoHeight / view.innerHeight
    return { sx: (rect.left + x * k) * fx, sy: (rect.top + y * k) * fy, sw: width * k * fx, sh: height * k * fy }
  }

  const render = async (element: HTMLElement, options: CaptureRendererOptions) => {
    await start()
    const container = element.closest<HTMLElement>('.region-snap')
    // 选区框、遮罩和工具栏都在屏幕上，截图前先隐藏，等新的一帧画面
    container?.setAttribute('data-screen-capturing', '')
    try {
      await settle(element.ownerDocument.defaultView!)
      const { sx, sy, sw, sh } = sourceRect(element, options)
      const canvas = createCanvas(element.ownerDocument, options.width * options.scale, options.height * options.scale)
      canvas.getContext('2d')!.drawImage(video!, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      return canvas
    } finally {
      container?.removeAttribute('data-screen-capturing')
    }
  }

  /** 用户滚动选区内的内容时持续取帧，按相邻两帧的重叠部分拼接；也支持往回滚 */
  const scroll = async (element: HTMLElement, options: ScrollCaptureOptions): Promise<ScrollRecorder> => {
    await start()
    const doc = element.ownerDocument
    await settle(doc.defaultView!)

    const first = sourceRect(element, options)
    const width = Math.max(1, Math.round(first.sw))
    const height = Math.max(1, Math.round(first.sh))
    const frameCanvas = createCanvas(doc, width, height)
    const frameCtx = frameCanvas.getContext('2d')!
    const sampleCanvas = createCanvas(doc, SAMPLE_COLUMNS, height)
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })!
    /** 输出像素 / 视频帧像素 */
    const outputScale = (options.width * options.scale) / width

    const grab = () => {
      if (!video) return null
      const { sx, sy, sw, sh } = sourceRect(element, options)
      frameCtx.clearRect(0, 0, width, height)
      frameCtx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height)
      sampleCtx.clearRect(0, 0, SAMPLE_COLUMNS, height)
      sampleCtx.drawImage(frameCanvas, 0, 0, SAMPLE_COLUMNS, height)
      return toFrame(sampleCtx.getImageData(0, 0, SAMPLE_COLUMNS, height).data, height)
    }

    // 拼接结果由若干条带组成，y 为条带在长图中的位置（向上滚动时可以为负）
    const strips: { canvas: HTMLCanvasElement; y: number }[] = []
    const addStrip = (sourceY: number, rows: number, y: number) => {
      const strip = createCanvas(doc, width, rows)
      strip.getContext('2d')!.drawImage(frameCanvas, 0, sourceY, width, rows, 0, 0, width, rows)
      strips.push({ canvas: strip, y })
    }

    let prev = grab()!
    addStrip(0, height, 0)
    /** 当前帧顶部在长图中的位置 */
    let pos = 0
    let top = 0
    let bottom = height
    let hint = 0
    let lost = false
    const maxRows = Math.floor(MAX_SCROLL_HEIGHT / outputScale)

    const report = () => options.onProgress?.({ height: Math.round((bottom - top) * outputScale), lost })

    const step = () => {
      const cur = grab()
      if (!cur) return
      const offset = findOffset(prev, cur, hint)
      if (offset === 'unknown') return
      if (offset === 'lost') {
        if (!lost) {
          lost = true
          report()
        }
        return
      }

      let changed = lost
      lost = false
      prev = cur
      if (offset) hint = offset
      pos += offset
      if (pos + height > bottom) {
        const rows = Math.min(pos + height - bottom, maxRows - (bottom - top))
        if (rows > 0) {
          addStrip(bottom - pos, rows, bottom)
          bottom += rows
          changed = true
        }
      }
      if (pos < top) {
        const rows = Math.min(top - pos, maxRows - (bottom - top))
        if (rows > 0) {
          addStrip(top - pos - rows, rows, top - rows)
          top -= rows
          changed = true
        }
      }
      if (changed) report()
    }

    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (stopped) return
      step()
      timer = setTimeout(tick, SCROLL_INTERVAL)
    }
    timer = setTimeout(tick, SCROLL_INTERVAL)
    report()

    const halt = () => {
      stopped = true
      clearTimeout(timer)
    }

    return {
      finish: async () => {
        if (!stopped) {
          halt()
          step()
        }
        const out = createCanvas(doc, options.width * options.scale, (bottom - top) * outputScale)
        const ctx = out.getContext('2d')!
        for (const strip of strips) {
          const y0 = Math.round((strip.y - top) * outputScale)
          const y1 = Math.round((strip.y + strip.canvas.height - top) * outputScale)
          ctx.drawImage(strip.canvas, 0, y0, out.width, y1 - y0)
        }
        return out
      },
      cancel: halt,
    }
  }

  const renderer: CaptureRenderer = Object.assign(render, { scroll })

  return {
    start,
    stop,
    get active() {
      return !!stream
    },
    renderer,
  }
}
