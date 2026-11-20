// Capturas de pantalla de la web compilada (solo en GitHub Actions, con Playwright).
//
//   node scripts/experiments/screenshots.mjs --url http://localhost:4173/homebrew-radar/ --out experiments/screenshots
//
// Móvil: WebKit con el perfil de iPhone 13 (motor de Safari, NO un iPhone físico).
// Escritorio: Chromium a 1440×900. Para cada pantalla comprueba que no haya
// desbordamiento horizontal, que los campos de texto tengan al menos 16 px (evita el
// zoom automático de Safari) y que los botones principales tengan un área táctil cómoda.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, devices, webkit } from 'playwright'

const arg = (name, fallback) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback }
const base = arg('--url', 'http://localhost:4173/')
const out = resolve(arg('--out', 'experiments/screenshots'))
mkdirSync(out, { recursive: true })

const SCREENS = [
  { id: 'portada', hash: '#/descubrir' },
  { id: 'consolas', hash: '#/consolas' },
  { id: 'buscar', hash: '#/buscar?q=' + encodeURIComponent('Homebrew para Nintendo Switch'), wait: 6000 },
  { id: 'buscar-idioma', hash: '#/buscar?q=' + encodeURIComponent('gestor de contraseñas'), wait: 6000, language: 'es' },
  { id: 'ficha', hash: '#/descubrir', openSheet: true },
  { id: 'biblioteca', hash: '#/biblioteca' },
  { id: 'ajustes', hash: '#/ajustes' },
]

const PROFILES = [
  { id: 'movil', engine: webkit, options: { ...devices['iPhone 13'] } },
  { id: 'escritorio', engine: chromium, options: { viewport: { width: 1440, height: 900 } } },
]

async function audit(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const overflow = doc.scrollWidth - doc.clientWidth
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > doc.clientWidth + 1) && getComputedStyle(el).position !== 'fixed' && !el.closest('.card-rail, .topic-strip, .facet-group, .example-chips') })
      .slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
    const smallInputs = [...document.querySelectorAll('input, select, textarea')]
      .filter((el) => el.offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${el.tagName.toLowerCase()} ${getComputedStyle(el).fontSize}`)
    const smallTargets = [...document.querySelectorAll('.icon-button, .tab, .primary-button, .secondary-button, .chip')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.height < 36 || r.width < 36) })
      .slice(0, 5).map((el) => `${el.className} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`)
    const tinyText = [...document.querySelectorAll('body *')]
      .filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && el.offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 12)
      .slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${getComputedStyle(el).fontSize}`)
    return { overflow, wide, smallInputs, smallTargets, tinyText, cards: document.querySelectorAll('.project-card').length }
  })
}

const report = { at: new Date().toISOString(), base, note: 'Móvil emulado con WebKit (perfil iPhone 13); no es un iPhone físico.', results: [] }
for (const profile of PROFILES) {
  const browser = await profile.engine.launch()
  for (const screen of SCREENS) {
    const context = await browser.newContext({ ...profile.options, locale: 'es-ES', colorScheme: 'dark' })
    if (screen.language) {
      await context.addInitScript((lang) => {
        try { const raw = JSON.parse(localStorage.getItem('homebrew-radar-library') || 'null') ?? { version: 2 }; raw.prefs = { ...(raw.prefs ?? {}), docLanguage: lang }; localStorage.setItem('homebrew-radar-library', JSON.stringify(raw)) } catch { /* sin almacenamiento */ }
      }, screen.language)
    }
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base + screen.hash, { waitUntil: 'networkidle' }).catch((error) => errors.push(String(error)))
    await page.waitForTimeout(screen.wait ?? 1500)
    if (screen.openSheet) {
      await page.locator('.card-identity').first().click().catch((error) => errors.push(String(error)))
      await page.waitForTimeout(2500)
    }
    const file = `${profile.id}-${screen.id}.png`
    // Las páginas muy largas (muchos resultados) se recortan: WebKit no admite más de 32767 px.
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    const width = page.viewportSize().width
    await page.screenshot(screen.openSheet ? { path: resolve(out, file) } : { path: resolve(out, file), fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(height, 6000) } })
    const result = { profile: profile.id, screen: screen.id, file, errors, ...(await audit(page)) }
    report.results.push(result)
    console.log(`${profile.id} · ${screen.id}: ${result.cards} tarjetas · desbordamiento ${result.overflow}px · campos <16px ${result.smallInputs.length} · objetivos pequeños ${result.smallTargets.length} · errores ${errors.length}`)
    await context.close()
  }
  await browser.close()
}

// Icono de iOS (apple-touch-icon) a partir del SVG, para que coincida con la nueva paleta.
if (process.argv.includes('--icon')) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 180, height: 180 } })
  const svg = readFileSync('public/pwa-icon.svg', 'utf8').replace('<svg ', '<svg width="180" height="180" ').replace(/rx="112"/, 'rx="0"')
  await page.setContent(`<html><body style="margin:0;background:#0b0e14">${svg}</body></html>`)
  await page.screenshot({ path: 'public/apple-touch-icon.png', omitBackground: false })
  await browser.close()
  console.log('apple-touch-icon.png regenerado')
}

writeFileSync(resolve(out, 'informe.json'), `${JSON.stringify(report, null, 2)}\n`)
const problems = report.results.filter((item) => item.overflow > 0 || item.smallInputs.length || item.errors.length)
console.log(problems.length ? `⚠ ${problems.length} pantallas con problemas` : '✔ Sin desbordamiento, sin campos <16px y sin errores de JavaScript')
