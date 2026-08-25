const path = require('path')
const { pathToFileURL } = require('url')
const { chromium } = require('C:/Users/sheng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

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
  if ((await desktop.locator('.feature-card--lead h3').innerText()) !== 'AI 提出聚焦方向建议，\n由你确认投入方向。') throw new Error('说明页 AI 标题错误')
  if (consoleErrors.length) throw new Error(`Console errors: ${consoleErrors.join(' | ')}`)

  await browser.close()
  console.log('GUIDE_BROWSER_ACCEPTANCE=PASS')
})().catch((error) => { console.error(error); process.exit(1) })
