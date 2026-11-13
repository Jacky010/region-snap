// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RegionSnap, type RegionSnapOptions } from '../src'

let container: HTMLDivElement
let content: HTMLDivElement
let snap: RegionSnap
let scrollTop = 0

const define = (el: HTMLElement, props: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(el, key, { configurable: true, ...(typeof value === 'object' ? value : { value }) })
  }
}

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect

const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init })

const drag = (target: Element, from: [number, number], to: [number, number], init?: PointerEventInit) => {
  target.dispatchEvent(pointer('pointerdown', ...from, init))
  document.dispatchEvent(pointer('pointermove', ...to, init))
  document.dispatchEvent(pointer('pointerup', ...to, init))
}

const selection = () => container.querySelector<HTMLElement>('.region-snap__selection')!
const handle = (name: string) => container.querySelector<HTMLElement>(`[data-handle="${name}"]`)!

const create = (options: RegionSnapOptions = {}) => {
  snap = new RegionSnap(container, content, { autoCapture: false, ...options })
  return snap
}

beforeEach(() => {
  scrollTop = 0
  container = document.createElement('div')
  content = document.createElement('div')
  container.appendChild(content)
  document.body.appendChild(container)
  // 容器位于视口 (100, 50)，可视区域 400 × 300；内容 400 × 1000，随容器滚动
  container.getBoundingClientRect = () => rect(100, 50, 400, 300)
  content.getBoundingClientRect = () => rect(100, 50 - scrollTop, 400, 1000)
  define(container, {
    offsetWidth: 400,
    clientWidth: 400,
    clientHeight: 300,
    scrollLeft: { value: 0, writable: true },
    scrollTop: { get: () => scrollTop, set: (v: number) => (scrollTop = Math.max(0, Math.min(v, 700))) },
  })
  define(content, { offsetWidth: 400, offsetHeight: 1000, scrollWidth: 400, scrollHeight: 1000 })
})

afterEach(() => {
  snap?.destroy()
  container.remove()
  vi.useRealTimers()
})

describe('框选', () => {
  it('拖动后得到相对内容区域的选区，超出边界时裁剪', () => {
    const onSelect = vi.fn()
    create({ onSelect })
    drag(content, [300, 200], [80, 120])

    const region = { x: 0, y: 70, width: 200, height: 80 }
    expect(onSelect).toHaveBeenCalledWith(region)
    expect(snap.state.region).toEqual(region)
    expect(selection().hidden).toBe(false)
    expect(selection().style.left).toBe('0px')
    expect(selection().style.top).toBe('70px')
  })

  it('选区小于 minSize 时忽略', () => {
    const onSelect = vi.fn()
    create({ onSelect, minSize: 10 })
    drag(content, [200, 200], [208, 300])

    expect(onSelect).not.toHaveBeenCalled()
    expect(snap.state.region).toBeNull()
  })

  it('按 Esc 和点击外部都会清除选区', () => {
    const onClear = vi.fn()
    create({ onClear })

    drag(content, [150, 100], [250, 200])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(snap.state.region).toBeNull()

    drag(content, [150, 100], [250, 200])
    document.body.dispatchEvent(pointer('pointerdown', 0, 0))
    expect(snap.state.region).toBeNull()
    expect(onClear).toHaveBeenCalledTimes(2)
  })

  it('禁用时不能框选，且容器带 data-disabled', () => {
    create({ disabled: true })
    drag(content, [150, 100], [250, 200])

    expect(snap.state.region).toBeNull()
    expect(container.hasAttribute('data-disabled')).toBe(true)

    snap.setOptions({ disabled: false })
    expect(container.hasAttribute('data-disabled')).toBe(false)
  })

  it('拖到容器边缘时自动滚动，选区随之扩大', async () => {
    create()
    content.dispatchEvent(pointer('pointerdown', 150, 100))
    document.dispatchEvent(pointer('pointermove', 200, 360)) // 超出容器底部 (350)
    await new Promise((resolve) => setTimeout(resolve, 200))
    document.dispatchEvent(pointer('pointerup', 200, 360))

    expect(scrollTop).toBeGreaterThan(0)
    expect(snap.state.region!.height).toBeGreaterThan(300)
  })
})

describe('编辑选区', () => {
  it('拖动选区可以移动，尺寸不变', () => {
    const onSelect = vi.fn()
    create({ onSelect })
    drag(content, [150, 100], [250, 200]) // x 50, y 50, 100 × 100
    drag(selection(), [200, 150], [230, 170])

    expect(snap.state.region).toEqual({ x: 80, y: 70, width: 100, height: 100 })
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('拖动角点可以调整大小', () => {
    create()
    drag(content, [150, 100], [250, 200])
    drag(handle('se'), [250, 200], [300, 260])
    expect(snap.state.region).toEqual({ x: 50, y: 50, width: 150, height: 160 })

    drag(handle('nw'), [150, 100], [170, 90])
    expect(snap.state.region).toEqual({ x: 70, y: 40, width: 130, height: 170 })
  })

  it('移动中按 Esc 恢复原选区', () => {
    create()
    drag(content, [150, 100], [250, 200])
    selection().dispatchEvent(pointer('pointerdown', 200, 150))
    document.dispatchEvent(pointer('pointermove', 260, 190))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(snap.state.region).toEqual({ x: 50, y: 50, width: 100, height: 100 })
    expect(snap.state.drawing).toBe(false)
  })

  it('editable 为 false 时不响应选区上的拖动', () => {
    create({ editable: false })
    drag(content, [150, 100], [250, 200])
    drag(selection(), [200, 150], [230, 170])

    expect(snap.state.region).toEqual({ x: 50, y: 50, width: 100, height: 100 })
    expect(container.hasAttribute('data-editable')).toBe(false)
  })
})

describe('代码控制', () => {
  it('setRegion 设置选区并裁剪到内容范围，不触发 onSelect', () => {
    const onSelect = vi.fn()
    const onChange = vi.fn()
    create({ onSelect, onChange })
    snap.setRegion({ x: 350, y: 10, width: 100, height: 50 })

    expect(snap.state.region).toEqual({ x: 350, y: 10, width: 50, height: 50 })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalled()

    snap.setRegion(null)
    expect(snap.state.region).toBeNull()
  })

  it('内容宽度变化时清除选区，高度变化时保留', () => {
    create()
    snap.setRegion({ x: 10, y: 10, width: 50, height: 50 })
    const handleResize = (snap as unknown as { handleResize: () => void }).handleResize

    define(content, { offsetHeight: 1200 })
    handleResize()
    expect(snap.state.region).not.toBeNull()

    define(content, { offsetWidth: 300 })
    handleResize()
    expect(snap.state.region).toBeNull()
  })

  it('setOptions 传 undefined 时恢复默认值', () => {
    const onSelect = vi.fn()
    create({ minSize: 100 })
    snap.setOptions({ minSize: undefined, onSelect })
    drag(content, [150, 100], [170, 120])

    expect(onSelect).toHaveBeenCalled()
  })
})

describe('触屏', () => {
  const touch = { pointerType: 'touch', pointerId: 7 }

  it('长按后才开始框选', () => {
    vi.useFakeTimers()
    create()
    content.dispatchEvent(pointer('pointerdown', 150, 100, touch))
    expect(snap.state.drawing).toBe(false)

    vi.advanceTimersByTime(400)
    expect(snap.state.drawing).toBe(true)

    document.dispatchEvent(pointer('pointermove', 250, 200, touch))
    document.dispatchEvent(pointer('pointerup', 250, 200, touch))
    expect(snap.state.region).toEqual({ x: 50, y: 50, width: 100, height: 100 })
  })

  it('长按前手指移动视为滚动，不开始框选', () => {
    vi.useFakeTimers()
    create()
    content.dispatchEvent(pointer('pointerdown', 150, 100, touch))
    document.dispatchEvent(pointer('pointermove', 150, 130, touch))
    vi.advanceTimersByTime(400)

    expect(snap.state.drawing).toBe(false)
  })

  it('touchMode 为 drag 时直接开始框选', () => {
    create({ touchMode: 'drag' })
    drag(content, [150, 100], [250, 200], touch)

    expect(snap.state.region).toEqual({ x: 50, y: 50, width: 100, height: 100 })
    expect(container.dataset.touchMode).toBe('drag')
  })
})

describe('显示', () => {
  it('工具栏默认在选区下方，下方放不下时翻到上方', () => {
    create()
    const toolbar = document.createElement('div')
    define(toolbar, { offsetWidth: 100, offsetHeight: 30 })
    container.appendChild(toolbar)
    snap.setToolbar(toolbar)
    expect(toolbar.hidden).toBe(true)

    drag(content, [150, 100], [250, 150]) // 选区 y 50~100
    expect(toolbar.hidden).toBe(false)
    expect(toolbar.style.top).toBe('110px')
    expect(toolbar.style.left).toBe('50px')

    drag(content, [150, 250], [250, 320]) // 选区 y 200~270，下方只剩 30px
    expect(toolbar.style.top).toBe('160px')
  })

  it('选区上下都放不下工具栏时，工具栏压在选区上、保持在可视区域内', () => {
    create()
    const toolbar = document.createElement('div')
    define(toolbar, { offsetWidth: 100, offsetHeight: 30 })
    container.appendChild(toolbar)
    snap.setToolbar(toolbar)

    drag(content, [150, 55], [250, 345]) // 选区 y 5~295，几乎占满可视区域
    expect(toolbar.style.top).toBe('260px')
  })

  it('容器滚动后重新定位工具栏，使其保持可见', async () => {
    create()
    const toolbar = document.createElement('div')
    define(toolbar, { offsetWidth: 100, offsetHeight: 30 })
    container.appendChild(toolbar)
    snap.setToolbar(toolbar)

    drag(content, [150, 100], [250, 150]) // 选区 y 50~100，工具栏在 110
    expect(toolbar.style.top).toBe('110px')

    container.scrollTop = 200 // 选区滚出可视区域上方，工具栏也随之看不见
    container.dispatchEvent(new Event('scroll'))
    await vi.waitFor(() => expect(toolbar.style.top).toBe('210px'))
  })

  it('mask 和 showSize', () => {
    create({ mask: true, showSize: true })
    drag(content, [150, 52], [250, 152])

    const size = container.querySelector<HTMLElement>('.region-snap__size')!
    expect(container.hasAttribute('data-mask')).toBe(true)
    expect(size.hidden).toBe(false)
    expect(size.textContent).toBe('100 × 100')
    expect(size.hasAttribute('data-inside')).toBe(true)

    snap.setOptions({ showSize: false })
    expect(size.hidden).toBe(true)
  })

  it('destroy 后移除选区元素并不再响应', () => {
    const onSelect = vi.fn()
    create({ onSelect })
    snap.destroy()
    drag(content, [150, 100], [250, 200])

    expect(onSelect).not.toHaveBeenCalled()
    expect(container.querySelector('.region-snap__selection')).toBeNull()
  })
})
