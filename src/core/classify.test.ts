import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyNintendo, classifyProject, GENERAL_CATEGORY, supportsCategory, type ClassifyInput } from './classify.ts'
import { normalizeProject } from './feed.ts'

// Metadatos reales (nombre, descripción y temas de GitHub) consultados el 19/11/2026.
const real = (name: string, description: string, topics: string[] = [], summary: string | null = null): ClassifyInput => ({ name, description, topics, summary })

const EMULATORS: [string, ClassifyInput][] = [
  ['gopher64/gopher64', real('gopher64', 'Highly compatible N64 emulator', ['emulation', 'emulator', 'game', 'n64', 'rust'])],
  ['drhelius/Gearboy', real('Gearboy', 'Game Boy / Game Boy Color / Super Game Boy emulator and debugger with embedded MCP server', ['emulator', 'game-boy', 'gameboy', 'libretro'])],
  ['BlitterStudio/amiberry', real('amiberry', 'Optimized multi-platform Amiga emulator', ['amiga', 'amiga-emulator', 'emulation', 'emulator'])],
  ['EKA2L1/EKA2L1', real('EKA2L1', 'A Symbian OS/N-Gage emulator', ['emulation', 'emulator', 'games'])],
  ['TASEmulators/desmume', real('desmume', 'DeSmuME is a Nintendo DS emulator', ['emulation', 'emulator', 'nds'])],
  ['xoureldeen/Vectras-VM-Android', real('Vectras-VM-Android', "It's a Virtual Machine App for Android Which is Based on QEMU", ['android', 'emulator', 'qemu'])],
  ['gabrielrcouto/php-terminal-gameboy-emulator', real('php-terminal-gameboy-emulator', 'A PHP Terminal GameBoy Emulator')],
  ['hasegawa-tomoki/php-terminal-nes-emulator', real('php-terminal-nes-emulator', 'A PHP terminal NES emulator', ['emulator', 'famicom', 'nes', 'php'])],
  ['andrewthecodertx/javascript-beneater-65c02', real('javascript-beneater-65c02', "Emulation of Ben Eater's breadboard 65C02 based computer.")],
  ['RetroDECK/RetroDECK', real('RetroDECK', 'RetroDECK is a powerful all-in-one retro gaming platform', ['emulation', 'games', 'gaming', 'retro'], 'Es una plataforma para jugar a juegos retro en Linux que reúne muchos emuladores y herramientas en una sola aplicación.')],
]

// Mencionan «emulator/emulation» pero NO son emuladores de consolas u ordenadores.
const NOT_EMULATORS: [string, ClassifyInput][] = [
  ['spyrosoft/php-terminal-emulator', real('php-terminal-emulator', "Stand alone PHP terminal emulator - useful when you don't have shell access.")],
  ['walkor/phptty', real('phptty', 'Share your terminal as a web application. PHP terminal emulator based on workerman.')],
  ['gggeek/polyfill-xmlrpc', real('polyfill-xmlrpc', 'Provides emulation of the native XML-RPC extension for PHP', ['php', 'xmlrpc'])],
  ['kijin/mysql-compat', real('mysql-compat', 'A MySQL extension emulation layer using MySQLi')],
  ['polonskiy/phproutine', real('phproutine', 'PHProutine is goroutines emulation in PHP', ['async', 'goroutine', 'php'])],
  ['phplang/scope-exit', real('scope-exit', "Simple PHP emulation of C++'s SCOPE_EXIT, or GoLang's defer.")],
  ['minkphp/Mink', real('Mink', 'PHP web browser emulator abstraction', ['browser-automation', 'mink', 'php'])],
  ['nojimage/codeception-mobileemulation', real('codeception-mobileemulation', 'WebDriver mobile emulation switcher for Codeception', ['codeception', 'webdriver'])],
  ['maiorBoltach/bf2142stats_emu', real('bf2142stats_emu', 'Battlefield 2142 Statistics Emulator Server')],
  ['mibblemerps/Sphinx', real('Sphinx', 'Minecraft Realms emulation software. Host your own Minecraft Realms!')],
  ['Xed-Editor/Xed-Editor', real('Xed-Editor', 'Advanced Text Editor for Android ', ['android', 'code-editor', 'terminal-emulator', 'text-editor'])],
  ['jcubic/jquery.terminal', real('jquery.terminal', 'jQuery Terminal Emulator - JavaScript library for creating web-based terminals with custom commands', ['terminal', 'terminal-emulators', 'web-terminal'], 'Es una biblioteca de JavaScript para crear en una página web una terminal simulada con órdenes propias.')],
  ['JonathanSalwan/Triton', real('Triton', 'Triton is a dynamic binary analysis library. Build your own program analysis tools, automate your reverse engineering, perform software verification or just emulate code.', ['binary-analysis', 'emulator', 'reverse-engineering', 'symbolic-execution'])],
  ['cea-sec/miasm', real('miasm', 'Reverse engineering framework in Python', ['assembler', 'disassembler', 'emulator', 'reverse-engineering'])],
  ['dsp56300/gearmulator', real('gearmulator', 'Low Level Emulation of classic VA synths & effects of the late 90s/2000s by emulating the used ICs', ['emulation', 'synthesizers'], 'Es un emulador de sintetizadores musicales clásicos.')],
]

test('los emuladores reales se clasifican como emuladores', () => {
  for (const [name, input] of EMULATORS) assert.equal(classifyProject(input).category, 'Emuladores', name)
})

test('mencionar «emulator» en otro contexto no convierte un proyecto en emulador', () => {
  for (const [name, input] of NOT_EMULATORS) {
    const result = classifyProject(input)
    assert.notEqual(result.category, 'Emuladores', `${name} (${result.evidence.join('; ')})`)
    assert.equal(supportsCategory(input, 'Emuladores'), false, `${name} no debe quedar en la temática «Emuladores»`)
  }
  assert.equal(classifyProject(NOT_EMULATORS[11][1]).category, 'Herramientas de desarrollo', 'jquery.terminal es una biblioteca')
  assert.equal(classifyProject(NOT_EMULATORS[12][1]).category, 'Seguridad y privacidad', 'Triton es ingeniería inversa')
  assert.equal(classifyProject(NOT_EMULATORS[14][1]).category, 'Multimedia', 'gearmulator emula sintetizadores')
})

test('sin evidencia suficiente: categoría general, marcada como no verificada', () => {
  const result = classifyProject(NOT_EMULATORS[5][1])
  assert.equal(result.category, GENERAL_CATEGORY)
  assert.equal(result.confidence, 'baja')
  assert.equal(classifyProject(real('thing', '')).confidence, 'baja')
})

test('el resto de categorías también exige pruebas de propósito', () => {
  const cases: [ClassifyInput, string][] = [
    // «AI» de pasada no es IA; una herramienta de IA sí.
    [real('Universal-Intel-Chipset-Updater', 'Security-focused tool for automatic Intel chipset INF detection and installation. Reviewed across 3 audit cycles by 6 AI systems.', ['automation', 'chipset', 'driver-updater', 'utility', 'windows']), 'Automatización'],
    [real('Unity-MCP', 'AI Skills, MCP Tools, and CLI for Unity Engine.', ['ai', 'claude', 'llm', 'mcp', 'unity']), 'Inteligencia artificial'],
    // «gaming laptops» no es un juego.
    [real('LenovoLegionToolkit', 'Lenovo Legion Toolkit (LLT) is a Windows desktop utility created for Lenovo gaming laptops', ['gaming-laptop', 'utility', 'windows']), 'Aplicaciones y utilidades'],
    [real('vifm', 'Vifm is a file manager with curses interface', ['file-manager', 'terminal-based', 'vim-like']), 'Archivos y datos'],
    [real('zk', 'A plain text note-taking assistant', ['cli', 'note-taking', 'zettelkasten']), 'Productividad y organización'],
    [real('TeamPass', 'Self-hosted collaborative password manager for teams', ['password-manager', 'self-hosted', 'encryption']), 'Seguridad y privacidad'],
    // «redes sociales» no es «Redes y servidores».
    [real('Nora', 'SNS browser. Facebook, Instagram, Reddit, Threads, X and more in a single app.', ['android-app', 'browser', 'ios-app'], 'Es un navegador para usar redes sociales sin anuncios.'), 'Aplicaciones y utilidades'],
    [real('mastodon-ios', 'Official iOS app for Mastodon', ['ios', 'mastodon'], 'Es la aplicación oficial de Mastodon para iPhone.'), 'Aplicaciones y utilidades'],
    [real('yunohost', 'YunoHost is an operating system aiming to simplify as much as possible the administration of a server.', ['self-hosted']), 'Redes y servidores'],
    [real('imgbuild', 'Docker image builder for disk images', ['docker']), GENERAL_CATEGORY],
  ]
  for (const [input, expected] of cases) assert.equal(classifyProject(input).category, expected, input.name)
})

test('la confianza refleja la cantidad de pruebas y se explican', () => {
  const strong = classifyProject(EMULATORS[0][1])
  assert.equal(strong.confidence, 'alta')
  assert.ok(strong.evidence.some((item) => item.includes('emulator')))
})

test('canal Nintendo: partidas guardadas por evidencia, no por la palabra «backup»', () => {
  assert.equal(classifyNintendo(real('Checkpoint', 'Fast and simple homebrew save manager for 3DS and Switch', ['3ds', 'save-manager'])).category, 'Herramientas para partidas guardadas')
  assert.equal(classifyNintendo(real('Half-Life-NDS-Port', 'Nintendo DS(i) port of Half Life (1998)', ['nds', 'port', 'homebrew'])).category, 'Juegos homebrew')
  assert.equal(classifyNintendo(real('dsi-wifi-manager', 'DSi homebrew to back up and restore the console Wi-Fi connections', ['dsi'])).category, GENERAL_CATEGORY, 'hacer copias del wifi no es gestionar partidas')
})

test('el catálogo publicado se reclasifica al cargarlo y las temáticas se depuran', () => {
  const stale = normalizeProject({ id: 1, name: 'php-terminal-emulator', url: 'https://github.com/x/y', description: "Stand alone PHP terminal emulator - useful when you don't have shell access.", category: 'Emuladores', channels: ['emuladores', 'terminal'], topics: [] })!
  assert.notEqual(stale.category, 'Emuladores')
  assert.ok(!stale.channels.includes('emuladores'), 'sale de la temática «Emuladores»')
  const ok = normalizeProject({ id: 2, name: 'gopher64', url: 'https://github.com/g/g', description: 'Highly compatible N64 emulator', topics: ['emulator', 'n64'], category: 'Emuladores', channels: ['emuladores'] })!
  assert.deepEqual(ok.channels, ['emuladores'])
  assert.equal(ok.categoryConfidence, 'alta')
})
