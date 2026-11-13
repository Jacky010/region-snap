/** 比对时每行取样的列数：横向缩小，纵向保留全部像素行以保证拼接精度 */
export const SAMPLE_COLUMNS = 32

/** 两帧至少要重叠的比例 */
const MIN_OVERLAP = 0.2
/** 平均每个像素的亮度差低于该值视为匹配 */
const MATCH_THRESHOLD = 10
const QUICK_THRESHOLD = 2
/** 有内容的行：行内亮度差超过该值（纯色背景行不参与比对，否则任何偏移都能匹配） */
const CONTENT_ROW_CONTRAST = 16
/**
 * 可比对的内容行少于该值时不比对。不能太大：对齐时两帧的内容行重合、行数最少，
 * 重叠部分内容稀疏（页间空白、居中的短标题）时会把正确的偏移排除掉
 */
const MIN_CONTENT_ROWS = 8
const COARSE_ROW_STEP = 6
const REFINE_CANDIDATES = 5
/** 最佳偏移的差异要低于次佳（不相邻）偏移的这个比例才算可信 */
const DISTINCT_RATIO = 0.5
/** 多个偏移难以区分时，上一次的偏移比最佳偏移差不超过该值就采用它 */
const HINT_TOLERANCE = 1

export interface Frame {
  height: number
  /** 亮度，按行存储，每行 SAMPLE_COLUMNS 个 */
  luma: Float32Array
  /** 每行是否有内容 */
  content: Uint8Array
}

/** 由宽为 SAMPLE_COLUMNS 的 RGBA 像素生成比对用的帧 */
export function toFrame(rgba: ArrayLike<number>, height: number): Frame {
  const luma = new Float32Array(SAMPLE_COLUMNS * height)
  const content = new Uint8Array(height)
  for (let row = 0; row < height; row++) {
    let min = 255
    let max = 0
    for (let col = 0; col < SAMPLE_COLUMNS; col++) {
      const i = row * SAMPLE_COLUMNS + col
      const value = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
      luma[i] = value
      if (value < min) min = value
      if (value > max) max = value
    }
    content[row] = max - min > CONTENT_ROW_CONTRAST ? 1 : 0
  }
  return { height, luma, content }
}

/** 内容向上移动 offset 行（cur 第 i 行对应 prev 第 i + offset 行）时两帧的平均差异；可比对的行太少时返回 NaN */
function difference(prev: Frame, cur: Frame, offset: number, step: number) {
  const start = Math.max(0, -offset)
  const end = Math.min(cur.height, prev.height - offset)
  let sum = 0
  let rows = 0
  for (let i = start; i < end; i += step) {
    if (!cur.content[i] && !prev.content[i + offset]) continue
    const a = i * SAMPLE_COLUMNS
    const b = (i + offset) * SAMPLE_COLUMNS
    for (let col = 0; col < SAMPLE_COLUMNS; col++) sum += Math.abs(cur.luma[a + col] - prev.luma[b + col])
    rows++
  }
  return rows >= Math.max(2, Math.ceil(MIN_CONTENT_ROWS / step)) ? sum / (rows * SAMPLE_COLUMNS) : NaN
}

/**
 * 求 cur 相对 prev 滚动的行数（向下滚动为正）。
 * 返回 'unknown' 表示无法判断（画面整片空白、或有多个相近的匹配），'lost' 表示找不到重叠部分（滚动过快）。
 */
export function findOffset(prev: Frame, cur: Frame, hint = 0): number | 'lost' | 'unknown' {
  for (const offset of hint ? [0, hint] : [0]) {
    if (difference(prev, cur, offset, 1) < QUICK_THRESHOLD) return offset
  }

  const range = Math.floor(cur.height * (1 - MIN_OVERLAP))
  const coarse: { offset: number; cost: number }[] = []
  for (let offset = -range; offset <= range; offset++) {
    const cost = difference(prev, cur, offset, COARSE_ROW_STEP)
    if (!Number.isNaN(cost)) coarse.push({ offset, cost })
  }
  if (!coarse.length) return 'unknown'

  coarse.sort((a, b) => a.cost - b.cost)
  let best: { offset: number; cost: number } | null = null
  for (const { offset } of coarse.slice(0, REFINE_CANDIDATES)) {
    const cost = difference(prev, cur, offset, 1)
    if (Number.isNaN(cost)) continue
    const closer = best && Math.abs(cost - best.cost) < 0.5 && Math.abs(offset - hint) < Math.abs(best.offset - hint)
    if (!best || cost < best.cost - 0.5 || closer) best = { offset, cost }
  }
  if (!best || best.cost >= MATCH_THRESHOLD) return 'lost'

  // 最佳偏移要明显优于其他（不相邻的）偏移，否则可能是滚动中途取到的帧或重复的内容
  const bestCoarse = coarse.find((c) => c.offset === best!.offset)?.cost ?? coarse[0].cost
  const rival = coarse.find((c) => Math.abs(c.offset - best!.offset) > 2)
  if (!rival || bestCoarse <= rival.cost * DISTINCT_RATIO) return best.offset

  // 难以区分时，滚轮每次滚动的距离固定，上一次的偏移同样匹配得好就采用它，否则跳过这一帧
  if (hint) {
    const hintCost = difference(prev, cur, hint, 1)
    if (hintCost < MATCH_THRESHOLD && hintCost <= best.cost + HINT_TOLERANCE) return hint
  }
  return 'unknown'
}
