# Homebrew Radar

Una pequeña revista de descubrimiento para encontrar proyectos homebrew reales de Nintendo 3DS, DSi y DS. La web es estática; no necesita servidor, cuentas ni base de datos.

## Probar en tu ordenador

Necesitas Node.js 20.19+ o 22.12+.

```bash
npm install
npm run dev
```

Abre la dirección local que muestra Vite. El catálogo aparece después de recopilar datos (consulta «Actualizar los datos»). Para compilar y validar:

```bash
npm test
npm run build
```

## Publicar gratis en GitHub Pages

1. Crea un repositorio público en GitHub y sube estos archivos a la rama `main`.
2. En **Settings → Pages → Build and deployment**, elige **GitHub Actions**.
3. En **Settings → Actions → General → Workflow permissions**, permite **Read and write permissions** para que el workflow pueda guardar el catálogo.
4. En **Actions**, ejecuta **Homebrew Radar — recopilar y publicar** con **Run workflow**. También se ejecuta al subir cambios a `main` y cada 12 horas.
5. Espera a que termine el workflow; Pages mostrará la dirección pública en **Settings → Pages**.

No añadas un token personal: el workflow usa el `GITHUB_TOKEN` temporal de GitHub Actions y nunca lo entrega al navegador.

## Mantener el radar

- `scripts/collect.mjs` consulta la API REST oficial de GitHub, elimina forks, repositorios archivados/vacíos y duplicados, y verifica README y versiones publicadas.
- El resultado se escribe en `public/data/projects.json`. El workflow lo guarda en `main` y publica la web.
- Puedes iniciar una recopilación manual desde **Actions → Homebrew Radar — recopilar y publicar → Run workflow**.
- Si la API devuelve un error o límite excedido, la ejecución falla y conserva el último catálogo publicado en lugar de reemplazarlo con información incompleta.
- Las búsquedas públicas de GitHub tienen un límite bajo sin autenticar; el workflow evita exponer credenciales y usa su token temporal. La recopilación está limitada a 25 resultados y aplica pausas entre búsquedas.

## Cómo leer los datos

La consola solo se indica cuando hay una mención explícita en metadatos de GitHub; una ausencia se muestra como **No verificado**. La descripción visible en español resume la categoría y las consolas mencionadas, sin atribuir detalles no verificados; la ficha conserva la descripción original del autor, que puede estar en otro idioma. No se usa un servicio de traducción externo, así que el texto técnico original no siempre tendrá traducción literal. La versión solo se muestra si se encuentra un release oficial no marcado como borrador o preliminar. La fecha de actividad usa el último `pushed_at`, no la creación del repositorio. También se comparan las fechas de publicación de releases para detectar versiones aunque no haya un nuevo commit.

La puntuación de 0 a 100 es una heurística visible: relevancia de consola (máximo 35), actividad reciente (20), documentación README (15), release (12), popularidad (hasta 10), señal de proyecto poco conocido (8) y descripción (5). Los motivos de cada ficha se generan con esos datos comprobables. «Nuevo» requiere que el repositorio se haya creado en los últimos 30 días; «Actualizado» compara la fecha de actividad con la recopilación anterior; «Reactivado» requiere más de seis meses sin actividad registrada.

El catálogo es una selección automática, no una auditoría de seguridad ni una garantía de compatibilidad. Confirma los requisitos del proyecto antes de instalar software en tu consola.

## Biblioteca y privacidad

Favoritos, elementos vistos y elementos ocultos se guardan en `localStorage` del navegador. No se sincronizan entre dispositivos y no se envían a ningún servidor. Si borras los datos del navegador, se perderán.

## Añadir a la pantalla de inicio del iPhone

Abre la web publicada en Safari, pulsa **Compartir → Añadir a pantalla de inicio**. Se incluye un manifiesto PWA y metadatos de Apple. El acceso a la pantalla de inicio requiere que la web esté servida por HTTPS; GitHub Pages lo proporciona. El catálogo requiere conexión para actualizarse, aunque la última copia recibida se mantiene en caché local.

## Estructura

- `src/`: interfaz React, filtros y biblioteca local.
- `scripts/collect.mjs`: recopilación, clasificación y puntuación.
- `public/data/projects.json`: datos generados, no resultados inventados.
- `.github/workflows/refresh-and-deploy.yml`: actualización y despliegue en Pages.
