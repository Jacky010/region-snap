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

  it('滚动超过一屏、没有重叠时返回 lost', () => {
    expect(findOffset(frameAt(500), frameAt(900))).toBe('lost')
  })

  it('画面是整片空白时返回 unknown', () => {
    const blank = toFrame(new Uint8ClampedArray(HEIGHT * SAMPLE_COLUMNS * 4).fill(255), HEIGHT)
    expect(findOffset(blank, blank)).toBe('unknown')
  })
})
