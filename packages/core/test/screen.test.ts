// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createScreenCapture } from '../src'

const mockDisplayMedia = (displaySurface: string) => {
  const track = { stop: vi.fn(), getSettings: () => ({ displaySurface }), addEventListener: vi.fn() }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  const getDisplayMedia = vi.fn().mockResolvedValue(stream)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } })
  return { track, getDisplayMedia }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createScreenCapture', () => {
  it('共享的不是标签页时拒绝并停止共享', async () => {
    const { track } = mockDisplayMedia('monitor')
    const screen = createScreenCapture()
    await expect(screen.start()).rejects.toThrow('current tab')
    expect(track.stop).toHaveBeenCalled()
    expect(screen.active).toBe(false)
  })

  it('请求共享当前标签页，并发调用 start 只请求一次', async () => {
    const { getDisplayMedia } = mockDisplayMedia('browser')
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'srcObject', 'set').mockImplementation(() => {})
    const screen = createScreenCapture()
    await Promise.all([screen.start(), screen.start()])
    expect(getDisplayMedia).toHaveBeenCalledTimes(1)
    expect(getDisplayMedia.mock.calls[0][0]).toMatchObject({ preferCurrentTab: true, audio: false })
    expect(screen.active).toBe(true)

    screen.stop()
    expect(screen.active).toBe(false)
  })
})
