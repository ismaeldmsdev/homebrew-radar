// Experimento aislado: genera resúmenes de una muestra fija de repositorios reales con
// varios modelos locales (llama.cpp) y mide tiempo, memoria y tasa de validación.
//
//   node --experimental-strip-types scripts/experiments/bench-summaries.mjs \
//     --binary ruta/llama-server --models dir --only a.gguf,b.gguf [--work work.json] [--threads 4] --out informe.json
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import os from 'node:os'
import { startServer } from '../local-llm.mjs'
import { summarize } from '../summarizer.mjs'
import { workItem } from '../summaries.mjs'

// 18 repositorios de categorías, tamaños de README y complejidad distintos (incluye
// documentación escasa, README en chino y bibliotecas frente a aplicaciones).
export const SAMPLE = [
  'wickenico/WailBrew', 'crossterm-rs/crossterm', 'autobrr/qui', 'bahdotsh/wrkflw', 'julyx10/lap', 'langroid/langroid',
  'zelon88/HRConvert2', 'gopher64/gopher64', 'IvanMurzak/Unity-MCP', 'neo-engine/neo', 'TASEmulators/desmume',
  'fabianquilpue/Laura_WordProcessor_3DS', 'cwuom/NeriPlayer', 'hledgerorg/hledger', 'pgaskin/kepubify', 'awaseem/foqos',
  'BolgarMaxym97/3ds-recorder', 'blocksds/libnds',
]

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

async function loadWork() {
  const workPath = arg('--work')
  if (workPath) {
    const all = JSON.parse(await readFile(resolve(workPath), 'utf8'))
    return SAMPLE.map((name) => all.find((item) => item.fullName === name)).filter(Boolean)
  }
  const feed = JSON.parse(await readFile(resolve('public/data/projects.json'), 'utf8'))
  const projects = SAMPLE.map((name) => feed.projects.find((project) => project.fullName === name)).filter(Boolean)
  return Promise.all(projects.map((project) => workItem(project)))
}

const binary = arg('--binary')
const modelsDir = arg('--models')
const only = arg('--only')?.split(',') ?? []
const threads = Number(arg('--threads', String(Math.min(os.cpus().length, 6))))
const out = arg('--out', 'bench-report.json')
const items = await loadWork()
console.log(`Muestra: ${items.length} repositorios · ${threads} hilos · ${os.cpus()[0]?.model} · ${(os.totalmem() / 1e9).toFixed(1)} GB`)

const report = { machine: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, memGB: +(os.totalmem() / 1e9).toFixed(1), platform: process.platform, threads }, models: [] }
for (const file of only) {
  const server = await startServer({ binary, model: join(modelsDir, file), threads, log: console.log })
  const results = []
  const started = Date.now()
  for (const item of items) {
    try {
      const outcome = await summarize(item, { url: server.url })
      results.push({ fullName: item.fullName, readmeChars: item.readme.length, ...outcome })
      console.log(`${outcome.ok ? '✔' : '✖'} ${file} ${item.fullName} ${(outcome.attempts.reduce((sum, a) => sum + a.ms, 0) / 1000).toFixed(1)} s`)
    } catch (error) {
      results.push({ fullName: item.fullName, ok: false, error: error.message, attempts: [] })
      console.log(`✖ ${file} ${item.fullName}: ${error.message}`)
    }
  }
  const totalMs = Date.now() - started
  const peak = server.peakMemoryMB()
  await server.stop()
  const times = results.flatMap((result) => result.attempts.map((attempt) => attempt.ms))
  const genTps = results.flatMap((result) => result.attempts.map((attempt) => attempt.timings?.predicted_per_second).filter(Boolean))
  const promptTps = results.flatMap((result) => result.attempts.map((attempt) => attempt.timings?.prompt_per_second).filter(Boolean))
  const avg = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)
  const summary = {
    model: file, loadMs: server.loadMs, totalMs, peakMemoryMB: peak,
    accepted: results.filter((result) => result.ok).length, total: results.length,
    avgRequestMs: Math.round(avg(times) ?? 0), avgGenTokensPerSec: +(avg(genTps) ?? 0).toFixed(1), avgPromptTokensPerSec: +(avg(promptTps) ?? 0).toFixed(1),
  }
  console.log(JSON.stringify(summary))
  report.models.push({ ...summary, results })
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`)
}
console.log(`Informe: ${out}`)
