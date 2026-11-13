import { describe, expect, it } from 'vitest'
import { SAMPLE_COLUMNS, findOffset, toFrame } from '../src/stitch'

/** 模拟一份长文档：白底上一行行「文字」，段落之间有空白 */
function createDocument(rows: number, seed = 1) {
  let s = seed
  const random = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const data = new Uint8ClampedArray(rows * SAMPLE_COLUMNS * 4).fill(255)
  for (let row = 0; row < rows; row++) {
    const inText = row % 60 < 40 && row % 20 < 14
    if (!inText) continue
    for (let col = 0; col < SAMPLE_COLUMNS; col++) {
      const value = random() < 0.5 ? 30 + random() * 60 : 255
      const i = (row * SAMPLE_COLUMNS + col) * 4
      data[i] = data[i + 1] = data[i + 2] = value
    }
  }
  return data
}

const HEIGHT = 300
const doc = createDocument(3000)
const frameAt = (top: number, height = HEIGHT) =>
  toFrame(doc.subarray(top * SAMPLE_COLUMNS * 4, (top + height) * SAMPLE_COLUMNS * 4), height)

describe('findOffset', () => {
  it('没有滚动时返回 0', () => {
    expect(findOffset(frameAt(500), frameAt(500))).toBe(0)
  })

  it('识别向下、向上滚动的距离', () => {
    expect(findOffset(frameAt(500), frameAt(537))).toBe(37)
    expect(findOffset(frameAt(500), frameAt(720))).toBe(220)
    expect(findOffset(frameAt(500), frameAt(450))).toBe(-50)
  })

  it('匀速滚动时优先用上一次的偏移', () => {
    expect(findOffset(frameAt(500), frameAt(560), 60)).toBe(60)
  })

  it('内容周期性重复（如试卷里相同的题干）时，借助上一次的偏移判断', () => {
    const PERIOD = 57
    const rows = 3000
    let s = 7
    const random = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    const line = Array.from({ length: PERIOD * SAMPLE_COLUMNS }, () => (random() < 0.4 ? 40 : 255))
    const periodic = new Uint8ClampedArray(rows * SAMPLE_COLUMNS * 4)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < SAMPLE_COLUMNS; col++) {
        const value = row % PERIOD < 40 ? line[(row % PERIOD) * SAMPLE_COLUMNS + col] : 255
        periodic.fill(value, (row * SAMPLE_COLUMNS + col) * 4, (row * SAMPLE_COLUMNS + col) * 4 + 3)
      }
    }
    const at = (top: number, noisy = false) => {
      const data = periodic.slice(top * SAMPLE_COLUMNS * 4, (top + HEIGHT) * SAMPLE_COLUMNS * 4)
      if (noisy) for (let i = 0; i < data.length; i++) data[i] += (random() - 0.5) * 16 // 视频流的压缩噪声
      return toFrame(data, HEIGHT)
    }
    expect(findOffset(at(600), at(720, true))).toBe('unknown')
    for (let top = 600; top < 1800; top += 120) {
      expect(findOffset(at(top), at(top + 120, true), 120)).toBe(120)
    }
  })

  it('重叠部分内容很少（如页与页之间的空白）时，仍能找到正确的偏移', () => {
    const sparse = new Uint8ClampedArray(3000 * SAMPLE_COLUMNS * 4).fill(255)
    // 每段 14 行内容：第一段只在前一帧，第二段在两帧的重叠部分，第三段只在当前帧
    for (const start of [900, 1080, 1260]) sparse.set(doc.subarray(start * SAMPLE_COLUMNS * 4, (start + 16) * SAMPLE_COLUMNS * 4), start * SAMPLE_COLUMNS * 4)
    const at = (top: number) => toFrame(sparse.subarray(top * SAMPLE_COLUMNS * 4, (top + HEIGHT) * SAMPLE_COLUMNS * 4), HEIGHT)
    expect(findOffset(at(900), at(1020))).toBe(120)
    expect(findOffset(at(900), at(1020), 120)).toBe(120)
  })

  it('滚动超过一屏、没有重叠时返回 lost', () => {
    expect(findOffset(frameAt(500), frameAt(900))).toBe('lost')
  })

  it('画面是整片空白时返回 unknown', () => {
    const blank = toFrame(new Uint8ClampedArray(HEIGHT * SAMPLE_COLUMNS * 4).fill(255), HEIGHT)
    expect(findOffset(blank, blank)).toBe('unknown')
  })
})
