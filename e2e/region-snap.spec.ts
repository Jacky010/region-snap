import { expect, test, type Locator, type Page } from '@playwright/test'

const PRESET_REGION = { x: 40, y: 140, width: 320, height: 90 }

const bbox = async (locator: Locator) => (await locator.boundingBox())!

async function drag(page: Page, from: [number, number], to: [number, number], steps = 8) {
  await page.mouse.move(...from)
  await page.mouse.down()
  await page.mouse.move(...to, { steps })
  await page.mouse.up()
}

const regionValue = async (page: Page) => JSON.parse((await page.locator('.region-value').textContent())!)

/** 点击「预览截图」，返回截图的像素尺寸 */
async function previewSize(page: Page) {
  const meta = page.locator('.panel h3 .meta')
  const before = (await meta.count()) ? await meta.textContent() : null
  await page.locator('.region-snap__toolbar .btn-primary').click()
  await expect.poll(async () => ((await meta.count()) ? await meta.textContent() : null)).not.toBe(before)
  const [, width, height] = (await meta.textContent())!.match(/(\d+) × (\d+) px/)!
  return { width: Number(width), height: Number(height) }
}

const setCheckbox = (page: Page, label: string, checked: boolean) =>
  page.locator('.field', { hasText: label }).locator('input').setChecked(checked)

for (const framework of ['vue', 'react']) {
  test.describe(framework, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/${framework}.html`)
      await expect(page.locator('.region-snap')).toBeVisible()
    })

    test('框选后显示选区、尺寸和工具栏，截图尺寸与选区一致', async ({ page }) => {
      const view = await bbox(page.locator('.region-snap'))
      await drag(page, [view.x + 40, view.y + 120], [view.x + 340, view.y + 200])

      const sel = await bbox(page.locator('.region-snap__selection'))
      expect(sel.width).toBeCloseTo(300, 0)
      expect(sel.height).toBeCloseTo(80, 0)
      await expect(page.locator('.region-snap__size')).toHaveText('300 × 80')

      const toolbar = await bbox(page.locator('.region-snap__toolbar'))
      expect(toolbar.y).toBeGreaterThanOrEqual(sel.y + sel.height)

      expect(await previewSize(page)).toEqual({ width: 300, height: 80 })

      await page.keyboard.press('Escape')
      await expect(page.locator('.region-snap__selection')).toBeHidden()
      await expect(page.locator('.region-snap__toolbar')).toHaveCount(0)
    })

    test('拖到容器底部外时自动滚动', async ({ page }) => {
      const viewer = page.locator('.region-snap')
      const view = await bbox(viewer)
      await page.mouse.move(view.x + 40, view.y + 60)
      await page.mouse.down()
      await page.mouse.move(view.x + 300, view.y + view.height + 30, { steps: 5 })
      await page.waitForTimeout(800)
      await page.mouse.up()

      expect(await viewer.evaluate((el) => el.scrollTop)).toBeGreaterThan(200)
      expect((await regionValue(page)).height).toBeGreaterThan(view.height)
    })

    test('拖动选区移动，拖动角点调整大小', async ({ page }) => {
      const view = await bbox(page.locator('.region-snap'))
      await drag(page, [view.x + 40, view.y + 120], [view.x + 240, view.y + 220])
      const start = await regionValue(page)

      await drag(page, [view.x + 140, view.y + 170], [view.x + 170, view.y + 190])
      const moved = await regionValue(page)
      expect(moved).toEqual({ ...start, x: start.x + 30, y: start.y + 20 })

      const se = await bbox(page.locator('[data-handle="se"]'))
      await drag(page, [se.x + se.width / 2, se.y + se.height / 2], [se.x + se.width / 2 + 40, se.y + se.height / 2 + 30])
      expect(await regionValue(page)).toEqual({ ...moved, width: moved.width + 40, height: moved.height + 30 })
    })

    test('选区落在 canvas 上时直接裁剪，按原始分辨率输出', async ({ page }) => {
      const chart = page.locator('canvas.chart')
      await chart.scrollIntoViewIfNeeded()
      const c = await bbox(chart)
      // 源图像素 / 内容区显示像素（canvas 有边框，内容区比外框略小）
      const ratio = await chart.evaluate((el: HTMLCanvasElement) => ({ x: el.width / el.clientWidth, y: el.height / el.clientHeight }))
      await drag(page, [c.x + 20, c.y + 20], [c.x + 220, c.y + 120])
      expect(await previewSize(page)).toEqual({ width: Math.round(200 * ratio.x), height: Math.round(100 * ratio.y) })

      await setCheckbox(page, 'fastCrop', false)
      await drag(page, [c.x + 20, c.y + 20], [c.x + 220, c.y + 120])
      expect(await previewSize(page)).toEqual({ width: 200, height: 100 })
    })

    test('受控选区：外部设置和清除', async ({ page }) => {
      await page.getByRole('button', { name: '预设选区' }).click()
      await expect(page.locator('.region-snap__selection')).toBeVisible()
      expect(await regionValue(page)).toEqual(PRESET_REGION)
      const sel = await bbox(page.locator('.region-snap__selection'))
      expect(sel.width).toBeCloseTo(PRESET_REGION.width, 0)

      await page.getByRole('button', { name: '清除' }).click()
      await expect(page.locator('.region-snap__selection')).toBeHidden()
      await expect(page.locator('.region-value')).toHaveText('null')
    })

    test('遮罩开关', async ({ page }) => {
      await setCheckbox(page, 'mask', true)
      await expect(page.locator('.region-snap')).toHaveAttribute('data-mask', '')
    })

    test('外层 CSS 缩放时选区与指针对齐，坐标按未缩放的内容计算', async ({ page }) => {
      await page.locator('.field', { hasText: 'zoom' }).locator('select').selectOption('0.75')
      const view = await bbox(page.locator('.region-snap'))
      await drag(page, [view.x + 30, view.y + 90], [view.x + 230, view.y + 165])

      const sel = await bbox(page.locator('.region-snap__selection'))
      expect(sel.x).toBeCloseTo(view.x + 30, 0)
      expect(sel.width).toBeCloseTo(200, 0)
      const region = await regionValue(page)
      expect(region.width).toBeCloseTo(200 / 0.75, -1)
      expect(region.height).toBeCloseTo(75 / 0.75, -1)

      const size = await previewSize(page)
      expect(Math.abs(size.width - 200)).toBeLessThanOrEqual(1)
      expect(Math.abs(size.height - 75)).toBeLessThanOrEqual(1)
    })
  })

  test.describe(`${framework} 触屏`, () => {
    test.use({ hasTouch: true })

    test.beforeEach(async ({ page }) => {
      await page.goto(`/${framework}.html`)
      await expect(page.locator('.region-snap')).toBeVisible()
    })

    async function touch(page: Page, points: [number, number][], holdMs: number) {
      const cdp = await page.context().newCDPSession(page)
      const [first, ...rest] = points
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: first[0], y: first[1] }] })
      await page.waitForTimeout(holdMs)
      for (const [x, y] of rest) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
        await page.waitForTimeout(16)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }

    const path = (from: [number, number], to: [number, number], steps = 10) =>
      Array.from({ length: steps + 1 }, (_, i): [number, number] => [
        from[0] + ((to[0] - from[0]) * i) / steps,
        from[1] + ((to[1] - from[1]) * i) / steps,
      ])

    test('长按后拖动框选', async ({ page }) => {
      const view = await bbox(page.locator('.region-snap'))
      await touch(page, path([view.x + 40, view.y + 120], [view.x + 240, view.y + 200]), 600)

      await expect(page.locator('.region-snap__selection')).toBeVisible()
      const region = await regionValue(page)
      expect(region.width).toBeCloseTo(200, -1)
      expect(region.height).toBeCloseTo(80, -1)
    })

    test('不长按直接滑动是滚动，不会框选', async ({ page }) => {
      const view = await bbox(page.locator('.region-snap'))
      await touch(page, path([view.x + 200, view.y + 300], [view.x + 200, view.y + 100]), 0)

      await expect(page.locator('.region-snap__selection')).toBeHidden()
      await expect.poll(() => page.locator('.region-snap').evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    })
  })
}
