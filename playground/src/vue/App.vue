<template>
  <div class="demo">
    <div class="demo-main">
      <div class="demo-tip">
        Vue 3 · 拖动框选，拖到边缘自动滚动；选区可移动、拖角点调整；触屏长按后拖动；Esc 或点击外部清除
      </div>
      <div class="demo-stage">
        <div class="zoom-wrapper" :style="zoomStyle(config.zoom)">
          <RegionSnap
            ref="snapRef"
            v-model:region="region"
            class="demo-viewer"
            :disabled="config.disabled"
            :editable="config.editable"
            :mask="config.mask"
            :show-size="config.showSize"
            :auto-capture="config.autoCapture"
            :auto-scroll="config.autoScroll"
            :touch-mode="config.touchMode"
            :capture-options="captureOptions"
            @select="(r) => log('select', r)"
            @capture="(_, r) => log('capture', r)"
            @clear="log('clear')"
            @error="(e) => log('error', String(e))"
          >
            <div ref="paperRef" v-html="paperHtml"></div>

            <template #toolbar="{ getImage, getBlob, clear, capturing }">
              <button class="btn btn-primary" :disabled="capturing" @click="handlePreview(getImage, getBlob)">预览截图</button>
              <button class="btn" :disabled="capturing" @click="handleDownload(getImage)">下载</button>
              <button class="btn" @click="clear()">取消</button>
            </template>
          </RegionSnap>
        </div>
      </div>
    </div>

    <div class="demo-side">
      <section class="panel">
        <h3>参数</h3>
        <label v-for="key in switches" :key="key" class="field">
          {{ key }} <input v-model="config[key]" type="checkbox" />
        </label>
        <label class="field">
          touchMode
          <select v-model="config.touchMode">
            <option value="longpress">longpress</option>
            <option value="drag">drag</option>
          </select>
        </label>
        <label class="field">scale（0 = 自动）<input v-model.number="config.scale" type="number" min="0" step="1" /></label>
        <label class="field">minWidth <input v-model.number="config.minWidth" type="number" min="0" step="50" /></label>
        <label class="field">minHeight <input v-model.number="config.minHeight" type="number" min="0" step="50" /></label>
        <label class="field">
          zoom（CSS 缩放）
          <select v-model.number="config.zoom">
            <option :value="1">1</option>
            <option :value="0.75">0.75</option>
            <option :value="1.25">1.25</option>
          </select>
        </label>
      </section>

      <section class="panel">
        <h3>v-model:region</h3>
        <code class="region-value">{{ region ? JSON.stringify(region) : 'null' }}</code>
        <div class="actions">
          <button class="btn" @click="region = { ...PRESET_REGION }">预设选区</button>
          <button class="btn" @click="region = null">清除</button>
        </div>
      </section>

      <section class="panel">
        <h3>
          截图预览
          <span v-if="preview" class="meta">{{ preview.width }} × {{ preview.height }} px · {{ formatBytes(preview.bytes) }}</span>
        </h3>
        <div class="preview">
          <img v-if="preview" :src="preview.src" />
          <span v-else class="placeholder">点击工具栏「预览截图」</span>
        </div>
      </section>

      <section class="panel">
        <h3>事件日志 <button class="btn btn-link" @click="logs = []">清空</button></h3>
        <div class="logs">
          <div v-for="(item, index) in logs" :key="index">{{ item }}</div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { RegionSnap, type CaptureOptions, type Region, type RegionSnapExpose } from '@region-snap/vue'
import {
  PRESET_REGION,
  createPreview,
  defaultConfig,
  download,
  drawChart,
  formatBytes,
  paperHtml,
  zoomStyle,
  type Preview,
} from '../shared/paper'

const switches = ['disabled', 'editable', 'mask', 'showSize', 'autoCapture', 'autoScroll', 'fastCrop'] as const

const snapRef = ref<RegionSnapExpose | null>(null)
const paperRef = ref<HTMLElement | null>(null)
const region = ref<Region | null>(null)
const preview = ref<Preview | null>(null)
const logs = ref<string[]>([])
const config = reactive(defaultConfig())

const captureOptions = computed<CaptureOptions>(() => ({
  scale: config.scale || undefined,
  fastCrop: config.fastCrop,
  minWidth: config.minWidth,
  minHeight: config.minHeight,
}))

const log = (name: string, payload?: unknown) => {
  const time = new Date().toLocaleTimeString()
  logs.value = [`${time}  ${name}${payload === undefined ? '' : '  ' + JSON.stringify(payload)}`, ...logs.value].slice(0, 50)
}

const handlePreview = async (getImage: () => Promise<string | null>, getBlob: () => Promise<Blob | null>) => {
  const [src, blob] = await Promise.all([getImage(), getBlob()])
  preview.value = await createPreview(src, blob)
}

const handleDownload = async (getImage: () => Promise<string | null>) => {
  const src = await getImage()
  if (src) download(src, 'region.png')
}

watch(
  () => config.zoom,
  async () => {
    await nextTick()
    snapRef.value?.refresh()
  },
)

onMounted(() => paperRef.value && drawChart(paperRef.value))
</script>
