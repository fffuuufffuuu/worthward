const path = require('path')
const { pathToFileURL } = require('url')
const { chromium } = require('C:/Users/sheng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

function contrastRatio(foreground, background) {
  const parse = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number)
  const luminance = (color) => {
    const [red, green, blue] = parse(color).map((channel) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
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
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const consoleErrors = []
  desktop.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await desktop.goto(pathToFileURL(path.resolve('guide/使用说明.html')).href)
  await desktop.waitForLoadState('load')

  const startBackground = await desktop.locator('.nav-start').evaluate((element) => getComputedStyle(element).backgroundColor)
  if (startBackground !== 'rgb(23, 51, 65)') throw new Error(`开始使用按钮不是深绿色: ${startBackground}`)
  if ((await desktop.locator('.footer-author').innerText()) !== '作者：CashewLab') throw new Error('说明页作者错误')
  if (await desktop.locator('.footer-github').getAttribute('href') !== 'https://github.com/fffuuufffuuu/worthward') throw new Error('说明页 GitHub 地址错误')
  if (await desktop.locator('.footer-github').getAttribute('aria-disabled')) throw new Error('说明页 GitHub 链接仍被禁用')
  const githubStyle = await desktop.locator('.footer-github').evaluate((element) => {
    const style = getComputedStyle(element)
    return { cursor: style.cursor, textDecorationLine: style.textDecorationLine }
  })
  if (githubStyle.cursor !== 'pointer') throw new Error(`说明页 GitHub 链接没有指针光标: ${githubStyle.cursor}`)
  if (!githubStyle.textDecorationLine.includes('underline')) throw new Error(`说明页 GitHub 链接没有下划线: ${githubStyle.textDecorationLine}`)
  const guideBackground = await desktop.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor)
  for (const selector of ['.brand-en', '.footer-line', '.footer-github', '.footer-note']) {
    const foreground = await desktop.locator(selector).evaluate((element) => getComputedStyle(element).color)
    const ratio = contrastRatio(foreground, guideBackground)
    if (ratio < 4.5) throw new Error(`${selector} 对比度不足: ${ratio.toFixed(2)}:1`)
  }
  if ((await desktop.locator('.feature-card--lead h3').innerText()) !== 'AI 提出聚焦方向建议，\n由你确认投入方向。') throw new Error('说明页 AI 标题错误')
  await desktop.screenshot({ path: path.resolve('work/guide-worthward-desktop.png'), fullPage: true })

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await mobile.goto(pathToFileURL(path.resolve('guide/使用说明.html')).href)
  await mobile.waitForLoadState('load')
  if (await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
    throw new Error('说明页手机端发生横向溢出')
  }
  if (!(await mobile.locator('.brand-en').isVisible())) throw new Error('说明页手机端缺少 WORTHWARD')
  await mobile.screenshot({ path: path.resolve('work/guide-worthward-mobile.png'), fullPage: true })
  if (consoleErrors.length) throw new Error(`Console errors: ${consoleErrors.join(' | ')}`)

  await browser.close()
  console.log('GUIDE_BROWSER_ACCEPTANCE=PASS')
})().catch((error) => { console.error(error); process.exit(1) })
