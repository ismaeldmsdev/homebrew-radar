import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeDocLanguage, detectDocLanguage, matchesDocLanguage, normalizeDocLanguage } from './docLanguage.ts'
import { normalizeProject } from './feed.ts'
import { emptyLibrary, parseLibrary } from '../library.ts'

const EN = `This tool lets you manage your save files on the console. It is written in C and can be used from the home menu.
You will need a homebrew launcher to run it. The project is open source and all contributions are welcome.
Install it by copying the files to the root of your SD card and then open the app from the launcher.`
const ES = `Esta herramienta permite gestionar las partidas guardadas de la consola. Está escrita en C y se puede usar desde el menú principal.
Para usarla hace falta un lanzador de homebrew. El proyecto es de código abierto y todas las contribuciones son bienvenidas.
Para instalarla copia los archivos en la raíz de la tarjeta SD y después abre la aplicación desde el lanzador.`

test('detecta README en inglés y en español', () => {
  assert.equal(detectDocLanguage({ readme: EN }).lang, 'en')
  assert.equal(detectDocLanguage({ readme: ES }).lang, 'es')
  assert.equal(detectDocLanguage({ readme: EN }).basis, 'readme')
})

test('README con dos idiomas reales es multilingüe y cuenta para ambos filtros', () => {
  const info = detectDocLanguage({ readme: `${EN}\n\n## Español\n\n${ES}` })
  assert.equal(info.lang, 'multi')
  assert.deepEqual([...info.languages].sort(), ['en', 'es'])
  assert.ok(matchesDocLanguage(info, 'es'))
  assert.ok(matchesDocLanguage(info, 'en'))
  assert.ok(matchesDocLanguage(info, 'multi'))
  assert.ok(!matchesDocLanguage(info, 'unknown'))
})

test('una palabra suelta en otro idioma no convierte el README en multilingüe', () => {
  assert.equal(detectDocLanguage({ readme: `${EN}\nGracias a todos.` }).lang, 'en')
})

test('README corto o vacío: idioma no determinado', () => {
  assert.equal(detectDocLanguage({ readme: '# MyTool\nA tool.' }).lang, 'unknown')
  assert.equal(detectDocLanguage({}).lang, 'unknown')
  assert.equal(detectDocLanguage({}).basis, 'none')
})

test('otros sistemas de escritura e idiomas se marcan como «otro idioma»', () => {
  const zh = detectDocLanguage({ readme: '这是一个用于管理游戏存档的工具。它可以在主菜单中使用，并且完全开源。欢迎大家贡献代码和提出建议。安装方法是把文件复制到存储卡的根目录。' })
  assert.equal(zh.lang, 'other')
  assert.ok(!matchesDocLanguage(zh, 'en'))
})

test('el resumen en español de Radar no cuenta como documentación', () => {
  const project = normalizeProject({
    id: 1, name: 'x', url: 'https://github.com/a/x', source: 'catalog',
    description: 'A small tool that lets you manage the save files of your console from the home menu, with backups.',
    summary: { text: 'Herramienta para gestionar las partidas guardadas de la consola desde el menú principal, con copias de seguridad.', origin: 'curated' },
  })!
  assert.equal(project.docLanguage.lang, 'en')
  assert.equal(project.docLanguage.basis, 'description')
})

test('el dato guardado en el catálogo se respeta y se valida', () => {
  assert.deepEqual(normalizeDocLanguage({ lang: 'es', languages: ['es'], basis: 'readme' }), { lang: 'es', languages: ['es'], basis: 'readme' })
  assert.equal(normalizeDocLanguage({ lang: 'klingon' }), null)
  assert.equal(normalizeDocLanguage(null), null)
})

test('la ficha explica la fuente y la falta de datos', () => {
  assert.match(describeDocLanguage({ lang: 'en', languages: ['en'], basis: 'description' }), /README no comprobado/)
  assert.match(describeDocLanguage({ lang: 'unknown', languages: [], basis: 'readme' }), /poco texto/)
})

test('filtro «todos» deja pasar cualquier proyecto', () => {
  for (const lang of ['es', 'en', 'multi', 'other', 'unknown'] as const) assert.ok(matchesDocLanguage({ lang, languages: [], basis: 'none' }, 'all'))
})

test('la preferencia de idioma se guarda y las bibliotecas antiguas siguen funcionando', () => {
  assert.equal(emptyLibrary().prefs.docLanguage, 'all')
  const old = parseLibrary({ version: 1, favorites: [], prefs: { sort: 'recent', includeArchived: true } })
  assert.equal(old.prefs.docLanguage, 'all')
  assert.equal(old.prefs.sort, 'recent')
  assert.equal(parseLibrary({ version: 2, prefs: { docLanguage: 'es' } }).prefs.docLanguage, 'es')
  assert.equal(parseLibrary({ version: 2, prefs: { docLanguage: 'xx' } }).prefs.docLanguage, 'all')
})
