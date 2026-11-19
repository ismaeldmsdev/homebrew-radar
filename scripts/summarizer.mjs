// Generador de resúmenes en español con un modelo de lenguaje servido por una API
// compatible con OpenAI (llama-server de llama.cpp en GitHub Actions, sin claves).
// Valida formato y respaldo en la documentación; si no lo supera, no se usa.
import { coverageProblems, groundingProblems, isThinEvidence, supportedKinds } from '../src/core/grounding.ts'
import { KIND_LABELS, PROJECT_KINDS, summaryProblems } from '../src/core/summary.ts'

export const PROMPT_VERSION = '2026-11-19.3'

const KIND_GUIDE = {
  app: 'se descarga o instala y se usa directamente',
  selfhosted: 'se instala en un servidor propio o con Docker y se usa desde el navegador',
  config: 'necesita claves, cuentas, archivos propios o preparar algo antes de usarlo',
  cli: 'se usa escribiendo órdenes en la terminal',
  library: 'código para que lo usen programadores en sus propios programas (biblioteca, SDK, framework)',
  plugin: 'funciona dentro de otro programa (extensión, complemento, servidor MCP, mod)',
  experimental: 'sus autores dicen que es prototipo, alfa, beta o está en desarrollo temprano',
  list: 'recopilación de enlaces o recursos, no un programa',
}

const SYSTEM = `Eres un redactor que explica proyectos de software a personas que no saben programar. Escribe siempre en español de España, claro y natural; explica el sentido, no traduzcas palabra por palabra.

Reglas:
1. "texto": 2 o 3 frases (entre 150 y 420 caracteres). Frase 1: qué es. Frase 2: qué permite hacer, con funciones concretas que aparezcan en la documentación. Frase 3 (opcional): para quién o para qué es útil.
2. Usa SOLO la información proporcionada. No añadas plataformas, sistemas, cifras, marcas ni funciones que no aparezcan. Escribe los nombres propios exactamente como aparecen.
3. Si es una biblioteca, SDK o framework para programadores, dilo claramente; no lo presentes como una aplicación.
4. Evita anglicismos innecesarios: di "trucos" (no cheats), "partidas guardadas" (no savestates), "flujos de trabajo" (no workflows), "mayor resolución" (no upscaling). Mantén los nombres de productos tal cual.
5. Si la descripción dice para qué sistema o consola es (Windows, Android, Nintendo DS…), menciónalo.
6. Prohibido: "potente", "revolucionario", "increíble", "todo en uno", "fácil de usar", "fácil de instalar", "sencillo de usar".
7. Si la documentación no basta para saber qué hace, pon "faltan_datos": true y di en el texto que faltan datos.
8. "tipos": solo los que la documentación respalde, de esta lista: ${PROJECT_KINDS.map((kind) => `"${kind}" (${KIND_GUIDE[kind]})`).join('; ')}.`

const EXAMPLE_INPUT = `Repositorio: example/photo-sorter
Descripción: Desktop app that sorts photos into folders by date and removes duplicates.
Temas: photos, desktop-app, windows, macos
README (extracto):
# Photo Sorter
Download the installer for Windows or macOS from the releases page. Select a folder and Photo Sorter moves each picture into year/month folders and detects duplicate files.`

const EXAMPLE_OUTPUT = JSON.stringify({
  texto: 'Es una aplicación de escritorio para Windows y macOS que ordena tus fotos. Permite repartirlas automáticamente en carpetas por año y mes y detectar archivos duplicados. Útil si tienes muchas fotos desordenadas en el ordenador.',
  tipos: ['app'],
  faltan_datos: false,
})

const SCHEMA = {
  type: 'object',
  properties: {
    texto: { type: 'string' },
    tipos: { type: 'array', items: { type: 'string', enum: PROJECT_KINDS } },
    faltan_datos: { type: 'boolean' },
  },
  required: ['texto', 'tipos', 'faltan_datos'],
}

export function promptFor(item, readmeChars = 2400) {
  return `Repositorio: ${item.fullName}
Descripción: ${item.description || '(sin descripción)'}
Temas: ${(item.topics ?? []).join(', ') || '(ninguno)'}
Lenguaje: ${item.language ?? 'desconocido'}
README (extracto):
${(item.readme || '(sin README)').slice(0, readmeChars)}`
}

function evidenceOf(item) {
  return { name: item.fullName.split('/')[1] ?? item.fullName, description: item.description ?? '', topics: item.topics ?? [], readme: item.readme ?? '', language: item.language, version: item.version, homepage: item.homepage }
}

/** Problemas de un resumen generado: formato, español y respaldo en la documentación. */
export function validateGenerated(result, item) {
  const text = typeof result?.texto === 'string' ? result.texto.trim() : ''
  const evidence = evidenceOf(item)
  // Los tipos son secundarios: los que no tienen respaldo se descartan sin rechazar el texto.
  const kinds = supportedKinds(Array.isArray(result?.tipos) ? result.tipos.filter((kind) => kind in KIND_LABELS) : [], evidence)
  const problems = [...summaryProblems(text, kinds), ...groundingProblems({ text }, evidence), ...coverageProblems(text, evidence)]
  const thin = isThinEvidence(evidence)
  const limited = result?.faltan_datos === true || thin
  if (limited && !/faltan? datos|falta informaci|no hay (suficiente|bastante)|poca informaci|escasa|no (detalla|describe|explica|especifica)/i.test(text)) problems.push('Con documentación escasa el texto debe decir que faltan datos.')
  return { text, kinds: PROJECT_KINDS.filter((kind) => kinds.includes(kind)), limited, problems }
}

/** Una petición al modelo. Devuelve el JSON y lo que tardó. */
export async function requestSummary(item, { url, key = 'local', model = 'local', fetch: fetchImpl = globalThis.fetch, feedback = null, seed = 42, maxTokens = 320 }) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: EXAMPLE_INPUT },
    { role: 'assistant', content: EXAMPLE_OUTPUT },
    { role: 'user', content: promptFor(item) },
  ]
  if (feedback) messages.push({ role: 'user', content: `Tu respuesta anterior tenía estos problemas: ${feedback.join(' ')} Escríbela de nuevo corrigiéndolos y responde solo con JSON.` })
  const started = Date.now()
  const response = await fetchImpl(`${url.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, messages, temperature: 0.2, top_p: 0.9, seed, max_tokens: maxTokens,
      response_format: { type: 'json_schema', json_schema: { name: 'resumen', schema: SCHEMA } },
      chat_template_kwargs: { enable_thinking: false },
    }),
  })
  if (response.status === 429) throw Object.assign(new Error('Límite del proveedor alcanzado.'), { rateLimited: true })
  if (!response.ok) throw new Error(`El modelo respondió ${response.status}.`)
  const data = await response.json()
  const content = (data.choices?.[0]?.message?.content ?? '').replace(/^```(json)?|```$/g, '').trim()
  let parsed
  try { parsed = JSON.parse(content) } catch { parsed = { texto: content, tipos: [], faltan_datos: false } }
  return { result: parsed, ms: Date.now() - started, usage: data.usage ?? null, timings: data.timings ?? null }
}

/** Genera y valida; un reintento con los problemas detectados. */
export async function summarize(item, provider) {
  const attempts = []
  let feedback = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const { result, ms, usage, timings } = await requestSummary(item, { ...provider, feedback })
    const checked = validateGenerated(result, item)
    attempts.push({ ms, usage, timings, text: checked.text, kinds: checked.kinds, problems: checked.problems })
    if (!checked.problems.length) return { ok: true, ...checked, attempts }
    feedback = checked.problems
  }
  return { ok: false, ...attempts.at(-1), attempts }
}
