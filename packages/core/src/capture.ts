import type { CaptureOptions, CaptureRenderer } from './types'

interface ClientRect {
  left: number
  top: number
  width: number
  height: number
}

type Html2CanvasOptions = NonNullable<CaptureOptions['html2canvas']>

/** 与 html2canvas 签名兼容的实现，如 html2canvas-pro */
export type Html2CanvasLike = (element: HTMLElement, options?: Html2CanvasOptions) => Promise<HTMLCanvasElement>

/**
 * 基于 html2canvas 的渲染器。
 * 渲染前去掉克隆文档中祖先元素的 transform，按未缩放的布局尺寸渲染，避免缩放后文字错位。
 */
export const html2canvasRenderer =
  (extraOptions?: Html2CanvasOptions, implementation?: Html2CanvasLike): CaptureRenderer =>
  async (element, { x, y, width, height, scale }) => {
    const render = implementation ?? ((await import('html2canvas')).default as Html2CanvasLike)
    return render(element, {
      useCORS: true,
      logging: false,
      ...extraOptions,
      x,
      y,
      width,
      height,
      scale,
      onclone: (doc, cloned) => {
        for (let el: HTMLElement | null = cloned; el; el = el.parentElement) el.style.transform = 'none'
        return extraOptions?.onclone?.(doc, cloned)
      },
    })
  }

/** 元素内容区（去掉边框和内边距）的视口坐标 */
function getContentBox(el: HTMLElement): ClientRect {
  const rect = el.getBoundingClientRect()
  const style = el.ownerDocument.defaultView!.getComputedStyle(el)
  const kx = el.offsetWidth ? rect.width / el.offsetWidth : 1
  const ky = el.offsetHeight ? rect.height / el.offsetHeight : 1
  const left = (parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)) * kx || 0
  const right = (parseFloat(style.borderRightWidth) + parseFloat(style.paddingRight)) * kx || 0
  const top = (parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)) * ky || 0
  const bottom = (parseFloat(style.borderBottomWidth) + parseFloat(style.paddingBottom)) * ky || 0
  return { left: rect.left + left, top: rect.top + top, width: rect.width - left - right, height: rect.height - top - bottom }
}

const contains = (outer: ClientRect, inner: ClientRect, tolerance = 0.5) =>
  inner.left >= outer.left - tolerance &&
  inner.top >= outer.top - tolerance &&
  inner.left + inner.width <= outer.left + outer.width + tolerance &&
  inner.top + inner.height <= outer.top + outer.height + tolerance

/**
 * 选区完全落在单个 img/canvas 上、且没有被其他元素遮挡时，直接从源图裁剪。
 * 不满足条件（或图片跨域导致画布被污染）时返回 null，由调用方回退到渲染器。
 */
export function cropFromMedia(content: HTMLElement, rect: ClientRect, scale?: number): HTMLCanvasElement | null {
  const doc = content.ownerDocument
  const media = content.querySelectorAll<HTMLImageElement | HTMLCanvasElement>('img, canvas')

  for (const el of Array.from(media)) {
    const box = getContentBox(el)
    if (box.width <= 0 || box.height <= 0 || !contains(box, rect)) continue

    const topmost = doc
      .elementsFromPoint?.(rect.left + rect.width / 2, rect.top + rect.height / 2)
      .find((node) => content.contains(node))
    if (topmost && topmost !== el) return null

    let sourceWidth: number
    let sourceHeight: number
    if (el.tagName === 'IMG') {
      const img = el as HTMLImageElement
      const fit = doc.defaultView!.getComputedStyle(img).objectFit
      if (!img.complete || !img.naturalWidth || (fit && fit !== 'fill')) return null
      sourceWidth = img.naturalWidth
      sourceHeight = img.naturalHeight
    } else {
      sourceWidth = (el as HTMLCanvasElement).width
      sourceHeight = (el as HTMLCanvasElement).height
    }

    const kx = sourceWidth / box.width
    const ky = sourceHeight / box.height
    const sw = rect.width * kx
    const sh = rect.height * ky
    const canvas = doc.createElement('canvas')
    canvas.width = Math.max(1, Math.round(scale ? rect.width * scale : sw))
    canvas.height = Math.max(1, Math.round(scale ? rect.height * scale : sh))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(el, (rect.left - box.left) * kx, (rect.top - box.top) * ky, sw, sh, 0, 0, canvas.width, canvas.height)

    try {
      ctx.getImageData(0, 0, 1, 1)
    } catch {
      return null
    }
    return canvas
  }
  return null
}

/** 尺寸不足时居中补齐到最小宽高 */
export function padCanvas(canvas: HTMLCanvasElement, minWidth: number, minHeight: number, color: string) {
  if (canvas.width >= minWidth && canvas.height >= minHeight) return canvas
  const padded = canvas.ownerDocument.createElement('canvas')
  padded.width = Math.max(canvas.width, minWidth)
  padded.height = Math.max(canvas.height, minHeight)
  const ctx = padded.getContext('2d')
  if (!ctx) return canvas
  ctx.fillStyle = color
  ctx.fillRect(0, 0, padded.width, padded.height)
  ctx.drawImage(canvas, (padded.width - canvas.width) / 2, (padded.height - canvas.height) / 2)
  return padded
}
