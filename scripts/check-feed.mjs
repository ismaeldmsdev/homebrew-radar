// Valida public/data/projects.json antes de publicar. Sale con código 1 si no es válido.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const path = resolve(process.argv[2] ?? 'public/data/projects.json')
const problems = []
let feed
try {
  feed = JSON.parse(await readFile(path, 'utf8'))
} catch (error) {
  console.error(`Catálogo ilegible (${path}): ${error.message}`)
  process.exit(1)
}
if (typeof feed.generatedAt !== 'string' || Number.isNaN(Date.parse(feed.generatedAt))) problems.push('generatedAt no es una fecha válida')
if (!Array.isArray(feed.projects) || feed.projects.length === 0) problems.push('no contiene proyectos')
const ids = new Set()
for (const project of feed.projects ?? []) {
  if (typeof project.id !== 'number' || typeof project.name !== 'string' || !/^https:\/\/github\.com\//.test(project.url ?? '')) {
    problems.push(`proyecto mal formado: ${JSON.stringify(project).slice(0, 80)}`)
    break
  }
  if (ids.has(project.id)) problems.push(`proyecto duplicado: ${project.fullName}`)
  ids.add(project.id)
}
if (problems.length) {
  console.error(`Catálogo no válido: ${problems.join('; ')}`)
  process.exit(1)
}
console.log(`Catálogo válido: ${feed.projects.length} proyectos, recopilado ${feed.generatedAt}.`)
