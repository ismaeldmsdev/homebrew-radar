// Comprueba que la compilación funciona bajo la ruta de GitHub Pages:
// todos los recursos de index.html usan la base correcta y existen en dist/.
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const dist = resolve('dist')
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = process.env.BASE_PATH ?? (repo ? `/${repo}/` : '/')
const html = await readFile(resolve(dist, 'index.html'), 'utf8')
const problems = []

const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((ref) => !/^https?:/.test(ref))
for (const ref of refs) {
  if (!ref.startsWith(base)) { problems.push(`${ref} no empieza por ${base}`); continue }
  try { await access(resolve(dist, ref.slice(base.length))) } catch { problems.push(`${ref} no existe en dist/`) }
}
for (const file of ['version.json', 'manifest.webmanifest', 'data/projects.json', 'apple-touch-icon.png', 'pwa-icon.svg']) {
  try { await access(resolve(dist, file)) } catch { problems.push(`falta dist/${file}`) }
}
const version = JSON.parse(await readFile(resolve(dist, 'version.json'), 'utf8').catch(() => '{}'))
if (!version.entry || !html.includes(`${base}${version.entry}`)) problems.push('version.json no coincide con el JS de index.html')

if (problems.length) {
  console.error(`La compilación no es válida para ${base}:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`Compilación válida para ${base}: ${refs.length} recursos, versión ${version.version} (${version.entry}).`)
