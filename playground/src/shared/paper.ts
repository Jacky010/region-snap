const choice = (i: number) => `
  <div class="question">
    <p><b>${i}.</b> 已知函数 f(x) = x² - 2ax + 3，若 f(x) 在区间 [1, ${i + 2}] 上单调递增，求实数 a 的取值范围。</p>
    <p class="options">A. a ≤ 1　　B. a ≥ 1　　C. a ≤ ${i}　　D. a ≥ ${i + 1}</p>
  </div>`

const triangle = (i: number) => `
  <div class="question">
    <p><b>${i + 8}.</b> 在 △ABC 中，角 A、B、C 所对的边分别为 a、b、c，已知 a = ${i + 2}，b = ${i + 3}，cos C = 1/${i + 1}，求 c 的值及 △ABC 的面积。</p>
  </div>`

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

/** 演示用的模拟试卷：文字、canvas 图表、表格 */
export const paperHtml = `
  <div class="paper">
    <h2 class="paper-title">2026 学年第一学期期中考试 · 数学</h2>
    <p class="paper-sub">（满分 150 分，考试时间 120 分钟）</p>
    ${range(6).map(choice).join('')}
    <p><b>7.</b> 某班学生数学成绩分布如下图所示，求该班成绩的平均分与中位数。</p>
    <canvas class="chart" width="960" height="480" style="width: 480px; height: 240px"></canvas>
    <p><b>8.</b> 根据下表数据，求 y 关于 x 的线性回归方程。</p>
    <table class="table">
      <tr><th>x</th>${range(6).map((n) => `<td>${n}</td>`).join('')}</tr>
      <tr><th>y</th>${range(6).map((n) => `<td>${(n * 2.3 + 1).toFixed(1)}</td>`).join('')}</tr>
    </table>
    ${range(4).map(triangle).join('')}
  </div>`

export function drawChart(root: ParentNode) {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas.chart')
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  const data = [3, 8, 15, 12, 6]
  const labels = ['60-70', '70-80', '80-90', '90-100', '100+']
  // 画布是显示尺寸的 2 倍，用来验证直接裁剪时按原始分辨率输出
  ctx.scale(2, 2)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, 480, 240)
  ctx.strokeStyle = '#333'
  ctx.beginPath()
  ctx.moveTo(40, 10)
  ctx.lineTo(40, 210)
  ctx.lineTo(470, 210)
  ctx.stroke()
  ctx.font = '12px sans-serif'
  data.forEach((value, i) => {
    const x = 60 + i * 82
    const h = value * 12
    ctx.fillStyle = '#409eff'
    ctx.fillRect(x, 210 - h, 60, h)
    ctx.fillStyle = '#333'
    ctx.fillText(String(value), x + 24, 205 - h)
    ctx.fillText(labels[i], x + 10, 228)
  })
}

export interface Preview {
  src: string
  width: number
  height: number
  bytes: number
}

/** 读取截图的像素尺寸和文件大小 */
export async function createPreview(src: string | null, blob: Blob | null): Promise<Preview | null> {
  if (!src || !blob) return null
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.src = src
  })
  return { src, width, height, bytes: blob.size }
}

export const formatBytes = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`)

export const PRESET_REGION = { x: 40, y: 140, width: 320, height: 90 }

export interface DemoConfig {
  disabled: boolean
  editable: boolean
  mask: boolean
  showSize: boolean
  autoCapture: boolean
  autoScroll: boolean
  fastCrop: boolean
  touchMode: 'longpress' | 'drag'
  scale: number
  minWidth: number
  minHeight: number
  zoom: number
}

export const defaultConfig = (): DemoConfig => ({
  disabled: false,
  editable: true,
  mask: false,
  showSize: true,
  autoCapture: true,
  autoScroll: true,
  fastCrop: true,
  touchMode: 'longpress',
  scale: 0,
  minWidth: 0,
  minHeight: 0,
  zoom: 1,
})

export const zoomStyle = (zoom: number) => ({
  transform: `scale(${zoom})`,
  transformOrigin: '0 0',
  width: `${100 / zoom}%`,
  height: `${100 / zoom}%`,
})

export function download(src: string, filename: string) {
  const a = document.createElement('a')
  a.href = src
  a.download = filename
  a.click()
}
