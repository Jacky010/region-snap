<template>
  <div class="demo">
    <div class="demo-main">
      <div class="demo-tip">
        <template v-if="snapping">截图模式：拖动框选 iframe 中的任意内容，Esc 清除选区。</template>
        <template v-else>浏览模式：可以正常滚动 iframe 中的文档。点击右侧「开启截图模式」后框选。</template>
      </div>
      <div class="demo-stage">
        <RegionSnap
          class="demo-viewer screen-viewer"
          :disabled="!snapping"
          mask
          show-size
          :capture-options="captureOptions"
          @capture="onCapture"
          @clear="preview = null"
          @error="(e) => log(`截图失败：${String(e)}`)"
        >
          <iframe class="doc-frame" sandbox="allow-scripts" :srcdoc="frameHtml" title="文档预览"></iframe>

          <template
            #toolbar="{ getImage, clear, capturing, scrollCapture, startScrollCapture, finishScrollCapture, cancelScrollCapture }"
          >
            <template v-if="scrollCapture">
              <span class="scroll-status" :class="{ lost: scrollCapture.lost }">
                {{
                  scrollCapture.lost
                    ? '滚动太快，请往回滚一点'
                    : scrollCapture.height
                      ? `已拼接 ${scrollCapture.height}px，继续滚动`
                      : '准备中…'
                }}
              </span>
              <button class="btn btn-primary" :disabled="capturing" @click="finishScrollCapture()">完成</button>
              <button class="btn" @click="cancelScrollCapture()">取消滚动</button>
            </template>
            <template v-else>
              <button class="btn" @click="startScrollCapture()">滚动截图</button>
              <button class="btn btn-primary" :disabled="capturing" @click="save(getImage)">下载</button>
              <button class="btn" @click="clear()">取消</button>
            </template>
          </template>
        </RegionSnap>
      </div>
    </div>

    <div class="demo-side">
      <div class="panel">
        <h3>截图模式</h3>
        <div class="actions">
          <button v-if="!snapping" class="btn btn-primary" @click="enter">开启截图模式</button>
          <button v-else class="btn" @click="exit">退出截图模式</button>
        </div>
        <p class="note">
          iframe 与页面不同源，html2canvas 无法截取。这里使用 <code>createScreenCapture()</code>：开启时浏览器会请求共享当前标签页，
          之后每次框选都从屏幕画面中裁剪。仅支持桌面端 Chrome / Edge。
        </p>
        <p class="note">
          长截图：框选后点工具栏的「滚动截图」，在选区内用滚轮往下滚动文档，点「完成」得到拼接好的长图。
        </p>
      </div>

      <div class="panel">
        <h3>
          截图预览
          <span v-if="preview" class="meta preview-size">{{ preview.width }} × {{ preview.height }}</span>
        </h3>
        <div class="preview">
          <img v-if="preview" :src="preview.src" alt="截图预览" />
          <span v-else class="placeholder">框选后显示截图</span>
        </div>
      </div>

      <div class="panel">
        <h3>事件</h3>
        <div class="logs">
          <div v-for="(item, i) in logs" :key="i">{{ item }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { RegionSnap, createScreenCapture, type CaptureOptions } from '@region-snap/vue'
import { download } from '../shared/paper'
import { frameHtml } from './frame'

const snapping = ref(false)
const preview = ref<{ src: string; width: number; height: number } | null>(null)
const logs = ref<string[]>([])

const log = (message: string) => {
  logs.value.unshift(`${new Date().toLocaleTimeString()} ${message}`)
}

const screen = createScreenCapture({
  onEnded: () => {
    snapping.value = false
    log('已停止共享，退出截图模式')
  },
})
const captureOptions: CaptureOptions = { renderer: screen.renderer }

const enter = async () => {
  try {
    await screen.start()
    snapping.value = true
    log('开始共享当前标签页')
  } catch (error) {
    log(`未能开始共享：${String(error)}`)
  }
}

const exit = () => {
  screen.stop()
  snapping.value = false
  log('退出截图模式')
}

const onCapture = (src: string) => {
  const img = new Image()
  img.onload = () => {
    preview.value = { src, width: img.naturalWidth, height: img.naturalHeight }
  }
  img.src = src
  log('截图完成')
}

const save = async (getImage: () => Promise<string | null>) => {
  const src = await getImage()
  if (src) download(src, 'region.png')
}

onBeforeUnmount(() => screen.stop())
</script>

<style>
.screen-viewer { overflow: hidden; }
.screen-viewer > .region-snap__content { height: 100%; }
.doc-frame { display: block; width: 100%; height: 100%; border: 0; }
.note { margin: 10px 0 0; font-size: 12px; line-height: 1.7; color: #909399; }
.scroll-status { align-self: center; font-size: 12px; color: #606266; }
.scroll-status.lost { color: #f56c6c; }
</style>
