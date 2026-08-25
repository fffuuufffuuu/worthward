const path = require('path')
const { chromium } = require('C:/Users/sheng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

function channelLuminance(channel) {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function parseRgba(color) {
  const channels = color.match(/[\d.]+/g)?.map(Number)
  if (!channels || channels.length < 3) throw new Error(`无法解析颜色: ${color}`)
  const rgb = channels.slice(0, 3)
  return {
    rgb: color.startsWith('color(srgb') ? rgb.map((channel) => channel * 255) : rgb,
    alpha: channels[3] ?? 1,
  }
}

function contrastRatio(foreground, background, canvas) {
  const canvasRgb = parseRgba(canvas).rgb
  const composite = (color) => {
    const { rgb, alpha } = parseRgba(color)
    return rgb.map((channel, index) => channel * alpha + canvasRgb[index] * (1 - alpha))
  }
  const luminance = (color) => {
    const [red, green, blue] = composite(color).map(channelLuminance)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

;(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const root = __dirname
  const consoleErrors = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.goto(process.env.WORTHWARD_URL ?? 'http://127.0.0.1:4174')
  await page.waitForLoadState('networkidle')

  async function assertBoardViewport(width, height, expectScroller) {
    await page.setViewportSize({ width, height })
    await page.getByRole('button', { name: '探索', exact: true }).click()
    await page.waitForTimeout(150)
    const board = page.locator('.board-grid')
    const metrics = await board.evaluate(async (element) => {
      element.scrollLeft = element.scrollWidth
      await new Promise((resolve) => requestAnimationFrame(() => resolve()))
      const boardRect = element.getBoundingClientRect()
      const columns = [...element.querySelectorAll('.stage-column')]
      const lastRect = columns.at(-1)?.getBoundingClientRect()
      return {
        columns: columns.length,
        overflowX: getComputedStyle(element).overflowX,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollLeft: element.scrollLeft,
        lastReachable: Boolean(lastRect && lastRect.left >= boardRect.left - 1 && lastRect.right <= boardRect.right + 1),
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })
    if (metrics.columns !== 4) throw new Error(`${width}px: 四列看板缺失`)
    if (metrics.documentOverflow) throw new Error(`${width}px: 页面发生横向溢出`)
    if (expectScroller) {
      if (!['auto', 'scroll'].includes(metrics.overflowX)) throw new Error(`${width}px: 看板没有水平滚动容器`)
      if (metrics.scrollWidth <= metrics.clientWidth || metrics.scrollLeft <= 0) throw new Error(`${width}px: 看板无法水平滚动`)
      if (!metrics.lastReachable) throw new Error(`${width}px: 最右列无法滚动到可见区域`)
    }
  }

  await assertBoardViewport(1440, 1000, false)
  await page.screenshot({ path: path.join(root, 'desktop-board.png'), fullPage: true })
  await assertBoardViewport(900, 900, true)
  await page.screenshot({ path: path.join(root, 'board-900.png') })
  await assertBoardViewport(820, 900, true)
  await page.screenshot({ path: path.join(root, 'board-820.png') })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: '探索', exact: true }).click()
  const canvas = await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor)
  for (const [foregroundSelector, backgroundSelector] of [
    ['.stage-header p', '.stage-header'],
    ['.brand-title-row b', '.topbar'],
    ['.brand small', '.topbar'],
    ['.app-footer-brand span', 'body'],
    ['.app-footer-meta', 'body'],
  ]) {
    const foreground = await page.locator(foregroundSelector).first().evaluate((element) => getComputedStyle(element).color)
    const background = await page.locator(backgroundSelector).first().evaluate((element) => getComputedStyle(element).backgroundColor)
    const ratio = contrastRatio(foreground, background, canvas)
    if (ratio < 4.5) throw new Error(`${foregroundSelector} 对比度不足: ${ratio.toFixed(2)}:1`)
  }

  await page.getByRole('button', { name: '洞察' }).click()
  await page.getByRole('heading', { name: '注意力洞察' }).waitFor()
  await page.screenshot({ path: path.join(root, 'desktop-insights.png'), fullPage: true })

  await page.getByRole('button', { name: '打开归档' }).click()
  await page.getByRole('heading', { name: '归档' }).waitFor()
  await page.getByRole('contentinfo').getByText('CashewLab').waitFor()
  await page.getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('heading', { name: '工作台设置' }).waitFor()
  await page.getByRole('button', { name: '记录想法' }).click()
  await page.getByRole('dialog', { name: '先接住，再决定' }).waitFor()
  await page.screenshot({ path: path.join(root, 'desktop-settings-dialog.png'), fullPage: true })
  await page.getByRole('button', { name: '关闭' }).click()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '探索', exact: true }).click()
  await page.waitForTimeout(150)
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
    throw new Error('Mobile page overflow outside the intended board scroller')
  }
  if (!(await page.getByRole('navigation', { name: '主导航' }).isVisible())) {
    throw new Error('Mobile navigation is not visible')
  }
  const mobileLayout = await page.evaluate(() => {
    const brandRect = document.querySelector('.brand').getBoundingClientRect()
    const navRect = document.querySelector('.main-nav').getBoundingClientRect()
    return {
      navAtBottom: Math.abs(navRect.bottom - window.innerHeight) <= 1,
      brandOverlapped: brandRect.left < navRect.right
        && brandRect.right > navRect.left
        && brandRect.top < navRect.bottom
        && brandRect.bottom > navRect.top,
    }
  })
  if (!mobileLayout.navAtBottom) throw new Error('Mobile navigation is not anchored to the viewport bottom')
  if (mobileLayout.brandOverlapped) throw new Error('Mobile navigation overlaps the Worthward brand')
  const mobileEnglishName = page.locator('.brand-title-row b')
  if (!(await mobileEnglishName.isVisible()) || (await mobileEnglishName.innerText()) !== 'WORTHWARD') {
    throw new Error('Mobile brand does not retain WORTHWARD')
  }
  await page.getByRole('contentinfo').getByText('CashewLab').waitFor()
  await page.screenshot({ path: path.join(root, 'mobile-board.png'), fullPage: true })

  const mobileTop = await browser.newPage({ viewport: { width: 390, height: 844 } })
  mobileTop.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await mobileTop.goto(process.env.WORTHWARD_URL ?? 'http://127.0.0.1:4174')
  await mobileTop.waitForLoadState('networkidle')
  const freshMobileEnglishName = mobileTop.locator('.brand-title-row b')
  if (!(await freshMobileEnglishName.isVisible()) || (await freshMobileEnglishName.innerText()) !== 'WORTHWARD') {
    throw new Error('Fresh mobile viewport does not retain WORTHWARD')
  }
  await mobileTop.screenshot({ path: path.join(root, 'mobile-top.png') })

  if (consoleErrors.length) throw new Error(`Console errors: ${consoleErrors.join(' | ')}`)
  await browser.close()
  console.log('BROWSER_ACCEPTANCE=PASS')
})().catch((error) => { console.error(error); process.exit(1) })
