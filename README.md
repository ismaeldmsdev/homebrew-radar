# Radar de descubrimientos

Descubre herramientas, aplicaciones y proyectos de código abierto que probablemente no conocías. La web es estática (GitHub Pages): sin servidor, sin cuentas y sin base de datos. **Nintendo homebrew** (3DS, DSi, DS) es una temática destacada, pero no la única.

> Antes se llamaba *Homebrew Radar*. El repositorio y la URL publicada no cambian, así que el acceso guardado en la pantalla de inicio del iPhone sigue funcionando.

## Qué cubre (y qué no)

La única fuente conectada es la **API REST oficial de GitHub**: repositorios públicos. No es un buscador de todo Internet ni de tiendas de aplicaciones. Cada búsqueda combina:

| Origen | Cómo se obtiene | Límites |
| --- | --- | --- |
| Catálogo del radar | GitHub Actions recopila las temáticas de `config/topics.json` cada 12 h, con README y última versión estable verificados | Ninguno para el usuario; el token temporal de Actions nunca llega al navegador |
| Búsqueda en vivo | El navegador consulta `api.github.com/search/repositories` sin credenciales | 10 búsquedas/min y 60 consultas/h por IP (fijados por GitHub). Se guardan en caché 20 min |

## Probar en tu ordenador

Necesitas Node.js 22.6+ (el recopilador y las pruebas importan módulos TypeScript con `--experimental-strip-types`).

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # pruebas (núcleo, biblioteca y recopilador)
npm run lint       # oxlint
npm run typecheck  # TypeScript
npm run build      # compilación de producción → dist/ (incluye dist/version.json)
npm run collect    # recopilación real; usa GITHUB_TOKEN si existe
```

## Arquitectura

- `src/core/` — lógica pura compartida por la web y el recopilador (Node):
  - `query.ts`: intérprete de búsquedas en lenguaje natural **basado en reglas y palabras clave** (no usa IA). Traduce expresiones en español («poco conocidas», «para Windows», «independientes»…) a términos y filtros de GitHub y genera consultas alternativas más amplias si la exacta no da resultados. La interfaz muestra siempre la consulta enviada.
  - `scoring.ts`: puntuación de interés (0-100), estado del proyecto (activo, poco activo, posiblemente abandonado, archivado) y detección de **joyas ocultas**.
  - `feed.ts`: normalización del catálogo (lee también el formato v1) y secciones de la portada: destacados, joyas, novedades, ganando atención y «Para ti».
  - `categories.ts`: categorías y consolas a partir de los metadatos.
  - `search.ts`: motor del buscador. Combina catálogo y resultados en vivo y los ordena por relevancia real (ver «Cómo ordena el buscador»).
  - `consoles.ts` y `consoleRadar.ts`: plataformas, tipos de herramienta, exclusión de piratería, compatibilidad citada del README y secciones del Radar de Consolas.
- `src/github.ts` — búsqueda en vivo y verificación bajo demanda (README y última versión) al abrir la ficha de un resultado en vivo.
- `src/library.ts` — biblioteca local con migración desde v1.
- `src/update.ts` — detección de versiones nuevas.
- `scripts/collect.mjs` — recopilador; `scripts/check-feed.mjs` y `scripts/check-dist.mjs` — validaciones del workflow.
- `config/topics.json` — temáticas públicas con seguimiento automático.

### Puntuación y joyas ocultas

Interés (0-100): relevancia 25 · actividad 20 · README 15 · versión publicada 10 · popularidad logarítmica 10 · madurez 5 · descripción 5 · licencia, temas y web 10 · listas «awesome» −10. Lo no comprobado se indica como tal y no suma.

Una **joya oculta** necesita: 3-400 estrellas, actividad en el último año, descripción, no estar archivada ni ser una lista, y README documentado **o** versión publicada. Si README y versiones aún no se han comprobado (resultados en vivo), se exigen varias señales indirectas y se marca como «posible joya». Cada joya muestra una explicación con sus señales. Las puntuaciones son orientativas, no garantías de calidad o seguridad.

«Ganando atención» compara las estrellas con las recopilaciones anteriores (historial de hasta 30 días en el propio catálogo).

### Cómo ordena el buscador

- **Interpretación:** reconoce más de 60 conceptos en español con su traducción al inglés: plataformas, 25 consolas, escena de CFW/jailbreak, partidas guardadas, tarjetas SD, contraseñas, notas, reproductores…
  - Detecta si pides una **aplicación**, una **biblioteca** o una herramienta de **terminal**.
  - Las palabras españolas sin traducción no se envían a GitHub, porque vaciarían la búsqueda.
- **Relevancia (68 %):** los conceptos deben aparecer como palabra completa, con este peso: nombre > temas > descripción > resumen en español.
  - Las consolas se comprueban con detección de plataforma, no por texto suelto. Una consola que solo es el origen de un port para otra no cuenta.
  - Las siglas cortas («AI», «SD») mencionadas de pasada en la descripción no bastan.
  - Se descarta por debajo de 0,40.
- **Calidad (32 %):** actividad, documentación, versiones y licencia. Las estrellas solo cuentan en escala logarítmica dentro de la calidad.
- **Orden pedido:** «poco conocidos», «populares» y «nuevos» cambian el orden, salvo que elijas otro en el selector.
- **Variedad:** máximo dos proyectos del mismo autor entre los primeros.
- **Sin personalización:** tus intereses (por ejemplo, consolas) no alteran las búsquedas explícitas.

La calidad se mide con 24 búsquedas reales (`scripts/experiments/search-eval.mjs`). GitHub Actions las ejecuta con el motor de `main` y el de la rama en la misma ejecución, y los resultados se evalúan a mano. Ver `experiments/search-eval/`.

### Categorías por evidencia

Antes, la categoría era la primera expresión de una lista que aparecía en cualquier parte del texto. Por eso «PHP terminal emulator» acababa en «Emuladores». Ahora `src/core/classify.ts` funciona así:

- **Suma de pruebas por campo:** temas de GitHub y nombre > primera frase de la descripción o del resumen en español > resto > primeras líneas del README.
- **Contextos que anulan:** frases como «terminal emulator», «emulation layer», «revisado por IA» o «gaming laptops» no cuentan.
- **Requisitos de propósito:** «Emuladores» exige un sistema emulado (consola, ordenador clásico, CPU). La IA exige una expresión de propósito, no la sigla suelta.
- **Sin pruebas suficientes:** el proyecto va a «Otros proyectos interesantes» marcado como **no verificado**. La ficha explica siempre el porqué de la categoría.
- **Temáticas ligadas a una categoría** (Emuladores, IA, Automatización, Terminal, Productividad, Archivos): solo conservan proyectos con pruebas propias, no por una sola etiqueta.
- **Catálogo antiguo:** se reclasifica al cargarlo en la web.

## Radar de Consolas

Pestaña dedicada al homebrew y la modificación de consolas: DS/DSi/3DS, Wii/Wii U, Switch, PSP/Vita, PS1-PS5, Xbox/360, Sega, retro y portátiles. GitHub Actions la actualiza cada 12 h con la temática `consolas` de `config/topics.json`.

- **Proyectos nuevos:** repositorios creados en los últimos 90 días. Un commit reciente en un proyecto antiguo **no** cuenta como nuevo.
- **Nuevas versiones:** publicaciones oficiales (releases) de los últimos 45 días.
- **Joyas poco conocidas, recuperados** (actividad tras más de 6 meses parados) y **destacados**, variando de consola y autor. Un tercio de los puestos se reserva a proyectos con menos de 150 estrellas.
- **Filtros** por consola y por tipo: CFW y jailbreak, partidas guardadas, emuladores, desarrollo, SD y almacenamiento, personalización, mantenimiento, juegos y ports, homebrew.
- **Compatibilidad:** la ficha muestra los modelos, versiones de firmware y requisitos **citados literalmente del README**, marcados como no verificados. Nunca se afirma una compatibilidad que no esté escrita.
- **Exclusiones:** proyectos que enlazan copias no autorizadas de juegos (ROM, ISO, PKG, NSP…) y el «Homebrew» de macOS (gestor de paquetes).

## Resúmenes en español

Cada tarjeta explica en 2-3 frases **qué es el proyecto, qué permite hacer y para qué sirve**, e indica su tipo: aplicación lista para usar, autoalojado, requiere configuración, línea de comandos, biblioteca para programadores, complemento, experimental o lista de recursos. La ficha añade detalles y explica cada tipo.

Cada tarjeta indica el origen de su resumen:

| Etiqueta | Origen | Cuándo |
| --- | --- | --- |
| **Revisado** | `data/summaries.json`, redactado a partir del README y revisado | Los 181 proyectos del catálogo inicial |
| **Automático** | IA local y gratuita en GitHub Actions, sin revisión humana | Proyectos nuevos del catálogo y solicitudes |
| **Básico** | Solo metadatos de GitHub (categoría, lenguaje, etiquetas) | Lo demás, incluidas búsquedas en vivo nuevas |

### Generación automática con IA local (sin coste ni claves)

Tras cada recopilación (cada 12 h), GitHub Actions ejecuta un modelo abierto con [llama.cpp](https://github.com/ggml-org/llama.cpp) en los servidores estándar, gratuitos para repositorios públicos. No usa APIs de pago ni claves, y el modelo no se guarda en el repositorio: se descarga a la caché de Actions y se verifica con SHA-256. La configuración está en `config/summarizer.json`: modelo **Qwen3.5-4B Q4_K_M** (Apache-2.0, 2,7 GB), llama.cpp `b12532`, `maxPerRun`, `timeBudgetMinutes` y `enabled`.

1. Detecta los proyectos sin resumen o con la documentación cambiada (huella de la descripción y del README), primero los nuevos y los mejor puntuados.
2. Descarga su README y genera el resumen.
3. Lo valida: formato (2-3 frases, español, sin frases genéricas ni promesas de facilidad), respaldo en la documentación (plataformas, nombres propios, cifras y tipos deben aparecer en ella) y mención de la plataforma principal. Si falla, reintenta una vez; si vuelve a fallar, queda la descripción básica y el intento se anota en `data/summary-attempts.json` para no repetirlo en 14 días salvo que cambie la documentación.
4. Guarda en `data/summaries.json` con la huella del generador (modelo, llama.cpp y versión del prompt) y publica.

Nunca sustituye un resumen revisado vigente. Si la IA falla, se publica igual. La validación es una red de seguridad heurística: **no garantiza que cada afirmación sea exacta**, y por eso la etiqueta «Automático» lo indica.

**Búsquedas en vivo.** GitHub Pages no tiene servidor y Actions no conoce tus búsquedas, así que no hay resumen instantáneo para un repositorio nuevo, y el iPhone no descarga ningún modelo. Si el repositorio ya está en la caché pública (`public/data/summaries.json`, que solo se descarga al buscar en vivo), se usa. Si no, la ficha ofrece **«Pedir resumen automático»**: abre una issue «Resumen: owner/repo»; si la abre el propietario de Radar, Actions genera el resumen en unos minutos, responde en la issue, la cierra y publica. Las issues de otras personas se ignoran.

Detalles del experimento que justificó la elección (6 modelos, 18 repositorios, tiempos y memoria): [`experiments/README.md`](experiments/README.md).

### Añadir o revisar resúmenes a mano

```bash
npm run summaries -- prepare            # descarga el README de los proyectos sin resumen → summaries-work.json
# redacta un JSON [{ "fullName", "text", "detail", "kinds", "limited" }] a partir de ese archivo
npm run summaries -- apply resumenes.json --work summaries-work.json
npm run summaries -- sync               # copia la caché al catálogo y a la caché pública
```

## Idioma de la documentación

Filtro *Idioma* en Buscar y en el Radar de Consolas: Todos, Español, Inglés, Multilingüe, Otro idioma e Idioma no determinado. Es el idioma **natural del README y la descripción originales**, no el lenguaje de programación ni el resumen en español que añade Radar.

- **Método** (`src/core/docLanguage.ts`, sin IA): el texto se divide en frases; cada una se asigna por su sistema de escritura (chino, ruso, árabe…) o por la proporción de palabras funcionales («the», «and», «que», «para»…), nunca por una palabra suelta. Multilingüe: dos idiomas con al menos el 20 % del texto y 20 palabras cada uno. Con menos de 25 palabras clasificables en el README (10 en la descripción): no determinado.
- **Catálogo**: se calcula en la recopilación con el README que ya se descarga, sin consultas extra.
- **Búsqueda en vivo**: GitHub solo da la descripción, así que muchas quedan como no determinadas. La web lo indica y, al abrir la ficha, lee el README y lo comprueba.
- Un proyecto multilingüe con español aparece al filtrar por Español (igual con Inglés). La preferencia se guarda en el dispositivo.

## Seguridad y confianza

Cada ficha incluye un apartado con señales públicas para decidir antes de descargar software, sobre todo ejecutables de Windows. **Radar no es un antivirus:** nunca descarga ni ejecuta archivos, no calcula una nota de seguridad y no usa la popularidad.

| Estado | Significado |
| --- | --- |
| Señal verificada | Dato comprobado en una fuente oficial (API de GitHub u OpenSSF Scorecard) |
| Advertencia documentada | Problema publicado: aviso de seguridad, proyecto archivado, flujo peligroso… |
| Información no disponible | No se pudo consultar o no existe ese dato. Nunca se presenta como advertencia ni como garantía |
| Requiere revisión manual | Algo que solo puedes comprobar tú, como la firma de Windows o una cuenta recién creada |

Fuentes, todas gratuitas y sin claves:
- **API de GitHub:** trayectoria del repositorio y de la cuenta, mantenimiento, release oficial, release inmutable, huella SHA-256 calculada por GitHub para cada archivo, atestaciones de procedencia por huella (solo consta que GitHub las tiene registradas: Radar no verifica su firma, por eso aparecen como «requiere revisión manual» y nunca como señal verificada) y avisos publicados con las versiones afectadas y corregidas.
- **[OpenSSF Scorecard](https://scorecard.dev/):** comprobaciones concretas como flujos peligrosos, binarios en el código, política de seguridad, revisión de código y vulnerabilidades. No se muestra su nota global.

Integridad (la huella coincide), procedencia (se compiló en este repositorio) y seguridad (no hace nada malicioso) son cosas distintas, y Radar solo informa de las dos primeras. Para cada ejecutable ofrece enlaces que **solo buscan su huella** en VirusTotal y MalwareBazaar, sin subir nada. Sus APIs no se integran: VirusTotal exige clave y prohíbe el uso comercial de su API pública, y MalwareBazaar exige una clave personal.

**Consultas y caché:**
- GitHub Actions comprueba hasta 30 proyectos por recopilación (`SECURITY_MAX`), con prioridad para los que publican ejecutables para Windows. Reutiliza la caché hasta que cambia la release o pasan 14 días.
- Para los resultados en vivo, la ficha ofrece «Comprobar señales de seguridad». Usa unas 5 de las 60 consultas por hora sin cuenta y guarda el resultado 24 horas en el dispositivo.

## Seguimiento automático de temáticas

Las temáticas que guardas en la app viven en `localStorage` y **GitHub Actions no puede leerlas**. Por eso hay dos niveles:

1. **Temáticas públicas** (`config/topics.json`): se recopilan cada 12 h. Para añadir una, edita el archivo (la app enlaza al editor de GitHub y ofrece una plantilla). Al hacer push a `main`, el workflow detecta el cambio, recopila y publica.
2. **Temáticas personales**: personalizan «Para ti» con el catálogo y se buscan en vivo al abrirlas. No hay seguimiento en segundo plano.

## Publicación en GitHub Pages

El workflow `.github/workflows/refresh-and-deploy.yml` separa los dos procesos:

- **Push a `main`** → pruebas, lint, tipos, compilación y despliegue del código. No recopila datos (salvo que cambie `config/topics.json`), así un límite de la API no bloquea una publicación.
- **Cada 12 h / manual** (Actions → *Run workflow*, opción «Recopilar datos») → recopila, valida y guarda el catálogo en `main`, y publica.

Salvaguardas de datos: reintentos ante errores 5xx y esperas cortas por límite; si una temática falla se conservan sus proyectos de la recopilación anterior (marcada como «sin actualizar»); si fallan todas, si no hay proyectos o si el total cae por debajo del 25 % del anterior, no se escribe nada; `check:feed` valida el archivo y restaura el último válido si hace falta. `check:dist` comprueba que todos los recursos usan la ruta `/<repositorio>/`.

Configuración inicial (una vez): *Settings → Pages → Source: GitHub Actions* y *Settings → Actions → General → Workflow permissions: Read and write*. No añadas tokens personales: se usa el `GITHUB_TOKEN` temporal del workflow.

### Versiones publicadas

Cada compilación genera `version.json` con la versión de `package.json`, el commit, la fecha y el archivo JS de entrada. El commit y la fecha **no** se incluyen en el JS, de modo que una actualización solo de datos no cambia el código ni provoca avisos falsos. *Ajustes* muestra la versión en uso y la publicada.

## iPhone (PWA)

Abre la web en Safari → **Compartir → Añadir a pantalla de inicio**. Incluye manifiesto, icono, metadatos de iOS, `viewport-fit=cover` con zonas seguras y barra de navegación inferior.

**Actualizaciones sin reinstalar**: no hay service worker. GitHub Pages sirve `index.html` con caché corta (`max-age=600`) y los recursos con hash, así que una apertura en frío recibe la versión nueva como mucho unos minutos después de publicarla. El caso problemático es la app suspendida en memoria: al volver a primer plano, al recuperar la conexión y cada 30 min se consulta `version.json` sin caché; si el JS publicado es distinto del que se ejecuta, aparece un aviso con **Recargar**. Recargar abre una URL distinta para saltarse la caché de Safari y no toca `localStorage`. Si tras recargar sigue la versión antigua (propagación de la CDN), no se vuelve a recargar sola: se indica que se intente más tarde. Sin conexión no se puede actualizar; se muestra la última copia guardada del catálogo, pero la app no funciona sin red si Safari ha descartado su caché (no hay service worker).

## Biblioteca y privacidad

Favoritos, historial, ocultos, temáticas y orden preferido se guardan en `localStorage` (clave `homebrew-radar-library`, formato v2 compatible con v1: los favoritos antiguos se conservan y una versión anterior de la web los seguiría leyendo). Los proyectos guardados desde la búsqueda en vivo se almacenan con una copia de sus datos. **No hay sincronización entre dispositivos**: usa *Biblioteca → Exportar/Importar* (importar combina, no borra).

## Avisos de dependencias

`npm audit` informa de 4 avisos «high» en `picomatch` (ReDoS, GHSA-fc5q-39xc-vjpf) a través de `vite`. Afectan solo a herramientas de compilación con patrones controlados por el propio proyecto, no al código publicado. La corrección automática propone un cambio de versión mayor de Vite, por lo que no se ha aplicado; revisar al actualizar Vite.
