// Arranca llama-server (llama.cpp) en local para generar resúmenes sin servicios
// externos ni claves. Solo escucha en 127.0.0.1.
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Memoria máxima (MB) que ha usado el proceso hasta ahora. */
export function peakMemoryMB(pid) {
  try {
    if (process.platform === 'linux') {
      const match = readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmHWM:\s+(\d+) kB/)
      return match ? Math.round(Number(match[1]) / 1024) : null
    }
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).PeakWorkingSet64`], { encoding: 'utf8' })
      return Math.round(Number(out.trim()) / 1024 / 1024)
    }
  } catch {
    // Sin datos de memoria en esta plataforma.
  }
  return null
}

export async function startServer({ binary, model, port = 8089, context = 4096, threads = 4, extraArgs = [], log = () => {}, timeoutMs = 300_000 }) {
  const args = ['-m', model, '--host', '127.0.0.1', '--port', String(port), '-c', String(context), '-t', String(threads), '--jinja', '-np', '1', '--no-webui', ...extraArgs]
  const started = Date.now()
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  const collect = (chunk) => { output = (output + chunk.toString()).slice(-4000) }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  let exited = null
  child.on('exit', (code) => { exited = code })
  const url = `http://127.0.0.1:${port}`
  while (Date.now() - started < timeoutMs) {
    if (exited !== null) throw new Error(`llama-server terminó (código ${exited}): ${output.slice(-600)}`)
    try {
      const response = await fetch(`${url}/health`)
      if (response.ok) break
    } catch {
      // Todavía arrancando.
    }
    await new Promise((done) => setTimeout(done, 1000))
  }
  if (Date.now() - started >= timeoutMs) { child.kill(); throw new Error('llama-server no arrancó a tiempo.') }
  const loadMs = Date.now() - started
  log(`llama-server listo en ${(loadMs / 1000).toFixed(1)} s`)
  return {
    url: `${url}/v1`,
    pid: child.pid,
    loadMs,
    peakMemoryMB: () => peakMemoryMB(child.pid),
    stop: () => new Promise((done) => { if (exited !== null) return done(); child.once('exit', () => done()); child.kill() }),
  }
}
