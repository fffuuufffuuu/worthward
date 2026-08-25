const path = require('path')
const { chromium } = require('C:/Users/sheng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

const url = process.env.WORTHWARD_URL
if (!url) throw new Error('WORTHWARD_URL is required for isolated capacity alert acceptance')
const target = new URL(url)
if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.port !== '4174') {
  throw new Error('WORTHWARD_URL must use http://127.0.0.1:4174 for isolated capacity alert acceptance')
}

;(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const requests = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => localStorage.getItem('attention-workbench:v1') !== null)
  await page.evaluate(() => {
    const key = 'attention-workbench:v1'
    const state = JSON.parse(localStorage.getItem(key))
    const timestamp = '2026-08-25T00:00:00.000Z'
    state.items = {}
    const add = (stage, count) => {
      for (let index = 0; index < count; index += 1) {
        const id = `${stage}-${index + 1}`
        state.items[id] = {
          id,
          title: `${stage} ${index + 1}`,
          description: '',
          board: index % 2 ? 'create' : 'explore',
          category: null,
          topics: [],
          stage,
          capturedAt: timestamp,
          stageEnteredAt: timestamp,
          lastTouchedAt: timestamp,
          lastProgressAt: null,
          version: 1,
        }
      }
    }
    add('focus', 2)
    add('engage', 3)
    state.settings.focusWipLimit = 2
    state.settings.engageWipLimit = 2
    localStorage.setItem(key, JSON.stringify(state))
  })
  await page.reload()
  await page.getByRole('button', { name: '洞察' }).click()
  const focus = page.locator('.capacity-metric').filter({ hasText: '正在 Focus' })
  const engage = page.locator('.capacity-metric').filter({ hasText: '正在 Engage' })
  if (!(await focus.getAttribute('class')).includes('capacity-full')) throw new Error('Focus full state missing')
  if (!(await engage.getAttribute('class')).includes('capacity-over')) throw new Error('Engage over state missing')
  await focus.getByText('已达上限').waitFor()
  await engage.getByText('超出 1 项').waitFor()
  await page.screenshot({ path: path.join(__dirname, 'capacity-alerts-desktop.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
    throw new Error('Capacity alert mobile layout overflow')
  }
  await page.screenshot({ path: path.join(__dirname, 'capacity-alerts-mobile.png'), fullPage: true })
  const apiRequest = requests.find((requestUrl) => new URL(requestUrl).pathname.startsWith('/api'))
  if (apiRequest) throw new Error(`Capacity alert acceptance must not call /api: ${apiRequest}`)
  await browser.close()
  console.log('CAPACITY_ALERT_ACCEPTANCE=PASS')
})().catch((error) => { console.error(error); process.exit(1) })
