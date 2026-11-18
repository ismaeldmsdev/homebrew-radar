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
- `src/github.ts` — búsqueda en vivo y verificación bajo demanda (README y última versión) al abrir la ficha de un resultado en vivo.
- `src/library.ts` — biblioteca local con migración desde v1.
- `src/update.ts` — detección de versiones nuevas.
- `scripts/collect.mjs` — recopilador; `scripts/check-feed.mjs` y `scripts/check-dist.mjs` — validaciones del workflow.
- `config/topics.json` — temáticas públicas con seguimiento automático.

### Puntuación y joyas ocultas

Interés (0-100): relevancia 25 · actividad 20 · README 15 · versión publicada 10 · popularidad logarítmica 10 · madurez 5 · descripción 5 · licencia, temas y web 10 · listas «awesome» −10. Lo no comprobado se indica como tal y no suma.

Una **joya oculta** necesita: 3-400 estrellas, actividad en el último año, descripción, no estar archivada ni ser una lista, y README documentado **o** versión publicada. Si README y versiones aún no se han comprobado (resultados en vivo), se exigen varias señales indirectas y se marca como «posible joya». Cada joya muestra una explicación con sus señales. Las puntuaciones son orientativas, no garantías de calidad o seguridad.

«Ganando atención» compara las estrellas con las recopilaciones anteriores (historial de hasta 30 días en el propio catálogo).

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
