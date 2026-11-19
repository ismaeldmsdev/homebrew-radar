# Experimento: resúmenes en español con IA local (19/11/2026)

Objetivo: comprobar si un modelo abierto y pequeño, ejecutado gratis en los servidores estándar de GitHub Actions (4 vCPU, 16 GB de RAM), puede resumir en español los proyectos nuevos de Radar sin APIs de pago.

Contexto: GitHub Models se retiró el 30/07/2026, así que Actions ya no ofrece un modelo gratuito integrado.

## Método

- **Muestra:** 18 repositorios reales de categorías distintas, con README largos, cortos o casi vacíos, uno en chino, y tanto bibliotecas como aplicaciones (lista en `scripts/experiments/bench-summaries.mjs`).
- **Ejecución:** llama.cpp `b12532` con modelos cuantizados Q4_K_M, en paralelo, un servidor de Actions por modelo (`.github/workflows/summary-experiment.yml`).
- **Validación:** la misma que en producción. Comprueba formato y español, y que plataformas, nombres, cifras y tipos aparezcan en la documentación (`src/core/grounding.ts`).
- **Revisión:** además de la validación automática, leí a mano cada texto de los dos mejores modelos.

## Ronda 1: seis modelos (`actions/`)

| Modelo | Licencia | Válidos | s/resumen | Memoria máx. | Observaciones |
| --- | --- | --- | --- | --- | --- |
| Qwen3.5-4B | Apache-2.0 | 15/18 | 29 | 8,1 GB | El español más natural |
| Qwen3-4B-Instruct-2507 | Apache-2.0 | 14/18 | 36 | 7,7 GB | Correcto, más literal y con algún error gramatical |
| SmolLM3-3B | Apache-2.0 | 13/18 | 15 | 5,7 GB | Copió el ejemplo del prompt («ordena tus fotos») en dos proyectos |
| Gemma 3 4B | Gemma | 12/18 | 23 | 10,4 GB | Error 400 en 6 de 18; licencia no Apache |
| Phi-4-mini | MIT | 11/18 | 27 | 6,8 GB | Textos demasiado largos; llamó «biblioteca» a un emulador |
| Qwen3.5-2B | Apache-2.0 | 11/18 | 5 | 3,6 GB | Rápido, pero inventa («funciona en el navegador») |

La validación rechazó todas las invenciones graves revisadas. Dejó pasar un texto genérico de Qwen3.5-4B sobre DeSmuME («emulador para programas que desarrollan software»). Por eso se añadió la comprobación de la plataforma principal.

## Ronda 2: prompt 2026-11-19.3 y validador mejorado (`actions-ronda2/`)

| Modelo | Válidos | s/resumen | Memoria máx. |
| --- | --- | --- | --- |
| **Qwen3.5-4B** | **18/18** | 23 | 8,2 GB |
| Qwen3-4B-Instruct-2507 | 15/18 | 26 | 7,5 GB |

En la revisión manual de los 18 textos de Qwen3.5-4B no encontré funciones inventadas. Distingue bibliotecas de aplicaciones, y con documentación escasa (DeSmuME, Laura, libnds) dice que faltan datos.

Quedan detalles de estilo («guardas de partidas», «realizar cross-seed»). Los resúmenes revisados siguen redactando mejor, y por eso los automáticos se marcan como «Automático» y nunca los sustituyen.

## Ensayo de producción (`actions-produccion/`)

Proceso real (`summaries auto` y `request`) con caché de Actions y verificación SHA-256:
- Regeneró 3 proyectos en 134 s con 4,8 GB de memoria máxima, todos válidos.
- Atendió una solicitud de un repositorio fuera del catálogo (`sharkdp/hyperfine`).

Con `maxPerRun: 15`, una ejecución completa de resúmenes tarda unos 6-10 minutos, dentro del límite de `timeBudgetMinutes: 30`.

## Decisión

Se adopta **Qwen3.5-4B Q4_K_M** (revisión `e87f176`, SHA-256 `00fe7986…69ef11a4`) para los proyectos nuevos, cada 12 horas, sin coste.

Limitaciones:
- La validación es heurística y no garantiza que cada afirmación sea exacta.
- El estilo es algo peor que el de los resúmenes revisados.
- Las búsquedas en vivo no tienen resumen instantáneo: se pide mediante una issue.
- Los tiempos varían según la CPU que asigne GitHub (en las pruebas se vieron AMD EPYC e Intel Xeon).
