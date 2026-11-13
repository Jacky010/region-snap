import { expect, test, type Page } from '@playwright/test'

test.use({
  launchOptions: { args: ['--auto-accept-this-tab-capture', '--use-fake-ui-for-media-stream'] },
})

/** 读取预览图上若干点的颜色 */
const samplePixels = (page: Page, points: [number, number][]) =>
  page.locator('.preview img').evaluate(async (img: HTMLImageElement, points) => {
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return points.map(([x, y]) => {
      const px = x < 0 ? canvas.width + x : x
      const py = y < 0 ? canvas.height + y : y
      return Array.from(ctx.getImageData(px, py, 1, 1).data.slice(0, 3))
    })
  }, points)

test.describe('跨域 iframe（共享标签页截图）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/screen.html')
    await expect(page.frameLocator('.doc-frame').locator('#red-block')).toBeVisible()
  })

  test('浏览模式下不能框选，iframe 可以正常交互', async ({ page }) => {
    const block = (await page.frameLocator('.doc-frame').locator('#red-block').boundingBox())!
    await page.mouse.move(block.x + 20, block.y + 20)
    await page.mouse.down()
    await page.mouse.move(block.x + 180, block.y + 80, { steps: 5 })
    await page.mouse.up()
    await expect(page.locator('.region-snap__selection')).toBeHidden()
  })

  test('截图模式下框选 iframe 内容，截图中不含选区框和遮罩', async ({ page }) => {
    await page.getByRole('button', { name: '开启截图模式' }).click()
    await expect(page.getByRole('button', { name: '退出截图模式' })).toBeVisible()

    const block = (await page.frameLocator('.doc-frame').locator('#red-block').boundingBox())!
    await page.mouse.move(block.x + 20, block.y + 20)
    await page.mouse.down()
    await page.mouse.move(block.x + 180, block.y + 80, { steps: 5 })
    await page.mouse.up()

    await expect(page.locator('.region-snap__size')).toHaveText('160 × 60')
    await expect(page.locator('.preview-size')).toHaveText('160 × 60')
    // 截图完成后选区框和工具栏恢复显示
    await expect(page.locator('.region-snap__selection')).toBeVisible()
    await expect(page.locator('.region-snap__toolbar')).toBeVisible()

    const pixels = await samplePixels(page, [[0, 0], [-1, -1], [80, 30], [0, -1], [-1, 0]])
    for (const [r, g, b] of pixels) {
      expect(r).toBeGreaterThan(220)
      expect(g).toBeLessThan(40)
      expect(b).toBeLessThan(40)
    }
  })

  test('滚动截图：在选区内滚动 iframe，拼接成长图', async ({ page }) => {
    await page.getByRole('button', { name: '开启截图模式' }).click()
    await expect(page.getByRole('button', { name: '退出截图模式' })).toBeVisible()

    const frame = page.frameLocator('.doc-frame')
    const view = (await page.locator('.doc-frame').boundingBox())!
    const docPage = (await frame.locator('.page').first().boundingBox())!
    const left = Math.round(docPage.x + 40)
    const width = Math.round(docPage.width - 80)
    const top = Math.round(view.y + 100)
    const height = 300
    await page.mouse.move(left, top)
    await page.mouse.down()
    await page.mouse.move(left + width, top + height, { steps: 5 })
    await page.mouse.up()
    await expect(page.locator('.preview-size')).toHaveText(`${width} × ${height}`)

    const markers = await frame.locator('.marker').evaluateAll((els) =>
      els.map((el) => ({ y: el.getBoundingClientRect().top, color: getComputedStyle(el).backgroundColor })),
    )
    const iframeTop = view.y
    const scrollY = () => frame.locator('body').evaluate(() => window.scrollY)
    const before = await scrollY()

    await page.getByRole('button', { name: '滚动截图' }).click()
    await expect(page.locator('.scroll-status')).toContainText(`已拼接 ${height}px`)
    await page.mouse.move(left + width / 2, top + height / 2)
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 120)
      await page.waitForTimeout(150)
    }
    const scrolled = (await scrollY()) - before
    expect(scrolled).toBeGreaterThan(1000)
    await page.waitForTimeout(300)
    await expect(page.locator('.scroll-status')).toContainText(`已拼接 ${height + scrolled}px`)

    await page.getByRole('button', { name: '完成' }).click()
    await expect(page.locator('.preview-size')).toHaveText(`${width} × ${height + scrolled}`)
    await expect(page.getByRole('button', { name: '滚动截图' })).toBeVisible()

    // 每一页的彩色标记都应出现在长图中对应的位置
    const visible = markers
      .map((m) => ({ ...m, y: Math.round(iframeTop + m.y - top + 6) }))
      .filter((m) => m.y > 0 && m.y < height + scrolled)
    expect(visible.length).toBeGreaterThanOrEqual(2)
    // 视频流有色彩误差，判断取到的像素最接近哪种标记颜色
    const palette = [...markers.map((m) => m.color), 'rgb(255, 255, 255)'].map((c) => c.match(/\d+/g)!.map(Number))
    const nearest = (rgb: number[]) =>
      palette.reduce((best, c, i) => {
        const d = Math.hypot(...c.map((v, ch) => v - rgb[ch]))
        return d < best.d ? { i, d } : best
      }, { i: -1, d: Infinity }).i
    const pixels = await samplePixels(page, visible.map((m) => [width / 2, m.y] as [number, number]))
    visible.forEach((m, i) => expect(nearest(pixels[i])).toBe(markers.findIndex((x) => x.color === m.color)))
  })

  test('选区占满预览区域时工具栏仍可见，滚动截图避开工具栏', async ({ page }) => {
    await page.getByRole('button', { name: '开启截图模式' }).click()
    await expect(page.getByRole('button', { name: '退出截图模式' })).toBeVisible()

    const frame = page.frameLocator('.doc-frame')
    const view = (await page.locator('.doc-frame').boundingBox())!
    const docPage = (await frame.locator('.page').first().boundingBox())!
    const left = Math.round(docPage.x + 40)
    const width = Math.round(docPage.width - 80)
    const top = Math.round(view.y + 4)
    const height = Math.round(view.height - 8)
    await page.mouse.move(left, top)
    await page.mouse.down()
    await page.mouse.move(left + width, top + height, { steps: 5 })
    await page.mouse.up()

    const toolbar = (await page.locator('.region-snap__toolbar').boundingBox())!
    expect(toolbar.y).toBeGreaterThanOrEqual(view.y)
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(view.y + view.height)

    const markers = await frame.locator('.marker').evaluateAll((els) =>
      els.map((el) => ({ y: el.getBoundingClientRect().top, color: getComputedStyle(el).backgroundColor })),
    )
    const scrollY = () => frame.locator('body').evaluate(() => window.scrollY)
    await page.getByRole('button', { name: '滚动截图' }).click()
    await expect(page.locator('.scroll-status')).toContainText('已拼接')
    const recorded = Number((await page.locator('.scroll-status').textContent())!.match(/(\d+)px/)![1])
    // 只录制工具栏上方的部分
    expect(recorded).toBeLessThan(toolbar.y - top)
    expect(recorded).toBeGreaterThan(toolbar.y - top - 30)

    await page.mouse.move(left + width / 2, top + 150)
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 120)
      await page.waitForTimeout(150)
    }
    const scrolled = await scrollY()
    expect(scrolled).toBe(720)
    await page.getByRole('button', { name: '完成' }).click()
    await expect(page.locator('.preview-size')).toHaveText(`${width} × ${recorded + scrolled}`)

    const palette = [...markers.map((m) => m.color), 'rgb(255, 255, 255)'].map((c) => c.match(/\d+/g)!.map(Number))
    const nearest = (rgb: number[]) =>
      palette.reduce((best, c, i) => {
        const d = Math.hypot(...c.map((v, ch) => v - rgb[ch]))
        return d < best.d ? { i, d } : best
      }, { i: -1, d: Infinity }).i
    const visible = markers
      .map((m, index) => ({ index, y: Math.round(view.y + m.y - top + 6) }))
      .filter((m) => m.y > 0 && m.y < recorded + scrolled)
    expect(visible.length).toBeGreaterThanOrEqual(1)
    const pixels = await samplePixels(page, visible.map((m) => [width / 2, m.y] as [number, number]))
    visible.forEach((m, i) => expect(nearest(pixels[i])).toBe(m.index))
  })

  test('截图模式下 iframe 重新加载（如切换文件）后，滚动截图仍能滚动', async ({ page }) => {
    await page.getByRole('button', { name: '开启截图模式' }).click()
    await expect(page.getByRole('button', { name: '退出截图模式' })).toBeVisible()
    await page.locator('.doc-frame').evaluate((el: HTMLIFrameElement) => (el.srcdoc += ' '))
    const frame = page.frameLocator('.doc-frame')
    await expect(frame.locator('#red-block')).toBeVisible()

    const view = (await page.locator('.doc-frame').boundingBox())!
    await page.mouse.move(view.x + 120, view.y + 100)
    await page.mouse.down()
    await page.mouse.move(view.x + 520, view.y + 400, { steps: 5 })
    await page.mouse.up()
    await page.getByRole('button', { name: '滚动截图' }).click()
    await expect(page.locator('.scroll-status')).toContainText('已拼接 300px')

    await page.mouse.move(view.x + 320, view.y + 250)
    await page.mouse.wheel(0, 120)
    await expect.poll(() => frame.locator('body').evaluate(() => window.scrollY)).toBe(120)
    await expect(page.locator('.scroll-status')).toContainText('已拼接 420px')
  })
})
