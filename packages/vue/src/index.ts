import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type PropType,
  type SlotsType,
  type VNode,
} from 'vue'
import {
  RegionSnap as RegionSnapCore,
  createInitialState,
  isSameRegion,
  type CaptureOptions,
  type Region,
  type RegionSnapOptions,
  type ScrollCaptureProgress,
  type TouchMode,
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

export interface ToolbarSlotProps extends ScrollCaptureMethods {
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

export interface RegionSnapExpose extends ScrollCaptureMethods {
  getImage: () => Promise<string | null>
  getBlob: () => Promise<Blob | null>
  getFile: (filename?: string) => Promise<File | null>
  clear: () => void
  setRegion: (region: Region | null) => void
  refresh: () => void
}

export const RegionSnap = defineComponent({
  name: 'RegionSnap',
  props: {
    /** 选区，支持 v-model:region */
    region: { type: Object as PropType<Region | null>, default: undefined },
    disabled: { type: Boolean, default: false },
    minSize: { type: Number, default: 5 },
    autoCapture: { type: Boolean, default: true },
    captureOptions: { type: Object as PropType<CaptureOptions>, default: undefined },
    editable: { type: Boolean, default: true },
    mask: { type: Boolean, default: false },
    showSize: { type: Boolean, default: false },
    autoScroll: { type: Boolean, default: true },
    touchMode: { type: String as PropType<TouchMode>, default: 'longpress' },
    longPressDelay: { type: Number, default: 400 },
    toolbarOffset: { type: Number, default: 10 },
    clearOnClickOutside: { type: Boolean, default: true },
    clearOnEscape: { type: Boolean, default: true },
    clearOnResize: { type: Boolean, default: true },
  },
  emits: {
    'update:region': (_region: Region | null) => true,
    select: (_region: Region) => true,
    capture: (_imageData: string, _region: Region) => true,
    clear: () => true,
    error: (_error: unknown) => true,
  },
  slots: Object as SlotsType<{
    default?: () => VNode[]
    toolbar?: (props: ToolbarSlotProps) => VNode[]
  }>,
  setup(props, { emit, slots, expose }) {
    const containerRef = ref<HTMLElement | null>(null)
    const contentRef = ref<HTMLElement | null>(null)
    const state = shallowRef(createInitialState())
    let core: RegionSnapCore | null = null
    let emittedRegion: Region | null = props.region ?? null

    const getOptions = (): RegionSnapOptions => ({
      disabled: props.disabled,
      minSize: props.minSize,
      autoCapture: props.autoCapture,
      captureOptions: props.captureOptions,
      editable: props.editable,
      mask: props.mask,
      showSize: props.showSize,
      autoScroll: props.autoScroll,
      touchMode: props.touchMode,
      longPressDelay: props.longPressDelay,
      toolbarOffset: props.toolbarOffset,
      clearOnClickOutside: props.clearOnClickOutside,
      clearOnEscape: props.clearOnEscape,
      clearOnResize: props.clearOnResize,
      onChange: (s) => {
        state.value = s
        if (!s.drawing && !isSameRegion(s.region, emittedRegion)) {
          emittedRegion = s.region
          emit('update:region', s.region)
        }
      },
      onSelect: (r) => emit('select', r),
      onCapture: (data, r) => emit('capture', data, r),
      onClear: () => emit('clear'),
      onError: (e) => emit('error', e),
    })

    const getImage = () => core?.getImage() ?? Promise.resolve(null)
    const getBlob = () => core?.getBlob() ?? Promise.resolve(null)
    const getFile = (filename?: string) => core?.getFile(filename) ?? Promise.resolve(null)
    const clear = () => core?.clear()
    const setRegion = (region: Region | null) => core?.setRegion(region)
    const refresh = () => core?.refresh()
    const startScrollCapture = () => core?.startScrollCapture() ?? Promise.resolve()
    const finishScrollCapture = () => core?.finishScrollCapture() ?? Promise.resolve(null)
    const cancelScrollCapture = () => core?.cancelScrollCapture()
    const scrollMethods = { startScrollCapture, finishScrollCapture, cancelScrollCapture }
    const setToolbar = (el: unknown) => core?.setToolbar(el as HTMLElement | null)

    onMounted(() => {
      core = new RegionSnapCore(containerRef.value!, contentRef.value!, getOptions())
      if (props.region) core.setRegion(props.region)
    })

    watch(
      () => ({ ...props }),
      () => core?.setOptions(getOptions()),
      { deep: true },
    )

    watch(
      () => props.region,
      (region) => {
        if (!core || region === undefined || isSameRegion(region, core.state.region)) return
        emittedRegion = region
        core.setRegion(region)
      },
      { deep: true },
    )

    onBeforeUnmount(() => {
      core?.destroy()
      core = null
    })

    expose({ getImage, getBlob, getFile, clear, setRegion, refresh, ...scrollMethods } satisfies RegionSnapExpose)

    return () => {
      const { region, drawing, capturing, imageData, scrollCapture } = state.value
      const toolbar = region && !drawing && slots.toolbar
        ? h(
            'div',
            { ref: setToolbar, class: 'region-snap__toolbar' },
            slots.toolbar({
              region,
              imageData,
              capturing,
              scrollCapture,
              getImage,
              getBlob,
              getFile,
              clear,
              ...scrollMethods,
            }),
          )
        : null

      return h('div', { ref: containerRef, class: 'region-snap' }, [
        h('div', { ref: contentRef, class: 'region-snap__content' }, slots.default?.()),
        toolbar,
      ])
    }
  },
})

export default RegionSnap
