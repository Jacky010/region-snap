import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  RegionSnap as RegionSnapCore,
  createInitialState,
  isSameRegion,
  type Region,
  type RegionSnapOptions,
  type ScrollCaptureProgress,
} from '@region-snap/core'

export { createScreenCapture, html2canvasRenderer } from '@region-snap/core'
export type {
  CaptureOptions,
  CaptureRenderer,
  Html2CanvasLike,
  Region,
  RegionSnapState,
  ScreenCapture,
  ScreenCaptureOptions,
  ScrollCaptureProgress,
  TouchMode,
} from '@region-snap/core'

interface ScrollCaptureMethods {
  /** 开始滚动截图，需要 createScreenCapture().renderer */
  startScrollCapture: () => Promise<void>
  /** 结束滚动截图，返回长图 */
  finishScrollCapture: () => Promise<string | null>
  cancelScrollCapture: () => void
}

export interface ToolbarRenderProps extends ScrollCaptureMethods {
  region: Region
  imageData: string | null
  capturing: boolean
  /** 滚动截图进度，未在滚动截图时为 null */
  scrollCapture: ScrollCaptureProgress | null
  getImage: () => Promise<string | null>
  getBlob: () => Promise<Blob | null>
  getFile: (filename?: string) => Promise<File | null>
  clear: () => void
}

export interface RegionSnapProps extends Omit<RegionSnapOptions, 'onChange'> {
  children?: ReactNode
  /** 选区。传入后会同步到组件，配合 onRegionChange 使用 */
  region?: Region | null
  /** 选区变化（框选、移动、调整、清除完成后） */
  onRegionChange?: (region: Region | null) => void
  /** 渲染选区工具栏，不传则不显示工具栏 */
  renderToolbar?: (props: ToolbarRenderProps) => ReactNode
  className?: string
  style?: CSSProperties
}

export interface RegionSnapHandle extends ScrollCaptureMethods {
  getImage: () => Promise<string | null>
  getBlob: () => Promise<Blob | null>
  getFile: (filename?: string) => Promise<File | null>
  clear: () => void
  setRegion: (region: Region | null) => void
  refresh: () => void
}

export const RegionSnap = forwardRef<RegionSnapHandle, RegionSnapProps>(function RegionSnap(
  {
    children,
    region: regionProp,
    onRegionChange,
    renderToolbar,
    className,
    style,
    disabled,
    minSize,
    autoCapture,
    captureOptions,
    editable,
    mask,
    showSize,
    autoScroll,
    touchMode,
    longPressDelay,
    toolbarOffset,
    clearOnClickOutside,
    clearOnEscape,
    clearOnResize,
    onSelect,
    onCapture,
    onClear,
    onError,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const coreRef = useRef<RegionSnapCore | null>(null)
  const emittedRef = useRef<Region | null>(regionProp ?? null)
  const [state, setState] = useState(createInitialState)

  useEffect(() => {
    const core = new RegionSnapCore(containerRef.current!, contentRef.current!)
    coreRef.current = core
    return () => {
      core.destroy()
      coreRef.current = null
    }
  }, [])

  // 每次渲染都同步一次，回调始终是最新的，不会出现闭包过期
  useEffect(() => {
    coreRef.current?.setOptions({
      disabled,
      minSize,
      autoCapture,
      captureOptions,
      editable,
      mask,
      showSize,
      autoScroll,
      touchMode,
      longPressDelay,
      toolbarOffset,
      clearOnClickOutside,
      clearOnEscape,
      clearOnResize,
      onChange: (s) => {
        setState(s)
        if (!s.drawing && !isSameRegion(s.region, emittedRef.current)) {
          emittedRef.current = s.region
          onRegionChange?.(s.region)
        }
      },
      onSelect,
      onCapture,
      onClear,
      onError,
    })
  })

  useEffect(() => {
    const core = coreRef.current
    if (!core || regionProp === undefined || isSameRegion(regionProp, core.state.region)) return
    emittedRef.current = regionProp
    core.setRegion(regionProp)
  }, [regionProp?.x, regionProp?.y, regionProp?.width, regionProp?.height, regionProp === null])

  const getImage = useCallback(() => coreRef.current?.getImage() ?? Promise.resolve(null), [])
  const getBlob = useCallback(() => coreRef.current?.getBlob() ?? Promise.resolve(null), [])
  const getFile = useCallback((filename?: string) => coreRef.current?.getFile(filename) ?? Promise.resolve(null), [])
  const clear = useCallback(() => coreRef.current?.clear(), [])
  const setRegion = useCallback((region: Region | null) => coreRef.current?.setRegion(region), [])
  const refresh = useCallback(() => coreRef.current?.refresh(), [])
  const startScrollCapture = useCallback(() => coreRef.current?.startScrollCapture() ?? Promise.resolve(), [])
  const finishScrollCapture = useCallback(() => coreRef.current?.finishScrollCapture() ?? Promise.resolve(null), [])
  const cancelScrollCapture = useCallback(() => coreRef.current?.cancelScrollCapture(), [])
  const toolbarRef = useCallback((el: HTMLDivElement | null) => coreRef.current?.setToolbar(el), [])

  useImperativeHandle(
    ref,
    () => ({
      getImage,
      getBlob,
      getFile,
      clear,
      setRegion,
      refresh,
      startScrollCapture,
      finishScrollCapture,
      cancelScrollCapture,
    }),
    [getImage, getBlob, getFile, clear, setRegion, refresh, startScrollCapture, finishScrollCapture, cancelScrollCapture],
  )

  const { region, drawing, capturing, imageData, scrollCapture } = state

  return (
    <div ref={containerRef} className={className ? `region-snap ${className}` : 'region-snap'} style={style}>
      <div ref={contentRef} className="region-snap__content">
        {children}
      </div>
      {region && !drawing && renderToolbar && (
        <div ref={toolbarRef} className="region-snap__toolbar">
          {renderToolbar({
            region,
            imageData,
            capturing,
            scrollCapture,
            getImage,
            getBlob,
            getFile,
            clear,
            startScrollCapture,
            finishScrollCapture,
            cancelScrollCapture,
          })}
        </div>
      )}
    </div>
  )
})

export default RegionSnap
