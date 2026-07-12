# Selector de modelo por función — Diseño

**Fecha:** 2026-07-12
**Estado:** Aprobado, pendiente de plan de implementación

## Problema

La app llama a Gemini con modelos hardcodeados por función (`gemini-2.5-flash-image`,
`gemini-3.1-flash-image-preview`, `gemini-3.1-pro-preview`). El costo de la API subió y
el usuario no tiene forma de elegir un modelo más económico sin editar código. El selector
de modelo del editor de AI Studio (Chat) es una pantalla distinta que no afecta a estas
llamadas.

## Objetivo

Exponer un selector de modelo (y, donde aplica, de `imageSize`) por cada modo de la app,
para que el usuario controle el costo sin tocar código. La elección persiste entre
sesiones.

## Alcance

Los 6 modos (`AppMode`) obtienen su propio control:

| Modo | Familia de modelo | Control extra |
|---|---|---|
| `EDIT_SHADOW` | Imagen | — |
| `REMOVE_BACKGROUND` | Imagen | — |
| `BATCH_EDIT_SHADOW` | Imagen | — |
| `BACKGROUND_EDIT` | Imagen | `imageSize` (1K/2K/4K) |
| `GENERATE` | Imagen | `imageSize` (1K/2K/4K) — ya existe hoy |
| `ANALYZE` | Texto | — |

Aplica tanto en modo directo (SDK desde el browser, deploy AI Studio) como en modo proxy
(servidor Express local).

Fuera de alcance: cambiar el modelo del Chat del editor de AI Studio (esa pantalla es
ajena al código de este repo); agregar telemetría/costo estimado en la UI.

## Diseño

### 1. Catálogo de modelos — `constants/models.ts` (nuevo)

```ts
export interface ModelOption { id: string; label: string; costHint: 'low' | 'medium' | 'high' }

export const IMAGE_MODELS: ModelOption[] = [
  { id: 'gemini-2.5-flash-image',         label: 'Gemini 2.5 Flash Image',           costHint: 'low'  },
  { id: 'gemini-2.0-flash',               label: 'Gemini 2.0 Flash',                 costHint: 'low'  },
  { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (Preview)', costHint: 'high' },
];

export const TEXT_MODELS: ModelOption[] = [
  { id: 'gemini-3.1-flash',       label: 'Gemini 3.1 Flash',        costHint: 'low'  },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', costHint: 'high' },
];

// Defaults = comportamiento actual del código, para no cambiar costo sin elección explícita del usuario
export const DEFAULT_MODEL_BY_MODE: Record<AppMode, string> = {
  EDIT_SHADOW: 'gemini-2.5-flash-image',
  REMOVE_BACKGROUND: 'gemini-2.5-flash-image',
  BATCH_EDIT_SHADOW: 'gemini-2.5-flash-image',
  BACKGROUND_EDIT: 'gemini-3.1-flash-image-preview',
  GENERATE: 'gemini-3.1-flash-image-preview',
  ANALYZE: 'gemini-3.1-pro-preview',
};
```

Este catálogo es la única fuente de verdad para las opciones del dropdown y los valores
por defecto. Evita duplicar strings de modelo entre componentes, contexto y servicio.

### 2. Estado — `context/AppContext.tsx`

- Nuevo estado `modelByMode: Record<AppMode, string>`, inicializado leyendo
  `localStorage['autoshadow:models']`; si la clave no existe o el modelo guardado ya no
  está en `IMAGE_MODELS`/`TEXT_MODELS`, cae a `DEFAULT_MODEL_BY_MODE[mode]`.
- `setModelForMode(mode, modelId)` actualiza el estado y persiste el objeto completo
  serializado en `localStorage`.
- Nuevo estado `imageSizeByMode` (solo para `BACKGROUND_EDIT`; `GENERATE` reutiliza el
  `genImageSize` que ya existe), con la misma estrategia de persistencia.
- `handleAction` pasa `modelByMode[mode]` (y el `imageSize` correspondiente al modo) a
  las funciones del servicio en cada rama del switch por modo.
- `handleChainedAction` (flujos `shadow-mirror` y `studio-complete`) pasa, paso a paso,
  el modelo del modo que ese paso representa conceptualmente:
  - Paso "remover fondo" → `modelByMode.REMOVE_BACKGROUND`
  - Paso "sombra" (`shadow-mirror`) → `modelByMode.EDIT_SHADOW`
  - Paso "componer con plantilla" (`studio-complete`) → `modelByMode.BACKGROUND_EDIT` +
    `imageSizeByMode.BACKGROUND_EDIT`
- `retryFailedBatch` usa `modelByMode.BATCH_EDIT_SHADOW`.

### 3. Servicio — `services/geminiService.ts`

Cada función dejará de tener el modelo hardcodeado y lo recibirá como parámetro
explícito, siguiendo el mismo patrón que ya usa `generateCarImage` con
`aspectRatio`/`imageSize`:

```ts
editCarImage(base64Image, prompt, mimeType, model)
composeCarWithBackground(carBase64, carMimeType, tplBase64, tplMimeType, prompt, model, imageSize)
generateCarImage(prompt, aspectRatio, imageSize, model)
analyzeCarImage(base64Image, prompt, mimeType, model)
analyzeCarImageStream(base64Image, prompt, mimeType, onChunk, model)
```

- **Modo proxy** (`USE_PROXY === true`): `model` (e `imageSize` donde aplica) se agregan
  al body JSON del `fetch` a cada endpoint.
- **Modo directo** (AI Studio / sin proxy): `model` se usa tal cual en el campo `model`
  de `ai.models.generateContent(...)` / `generateContentStream(...)`.

No se cambian firmas de retorno ni el manejo de streaming existente.

### 4. Servidor proxy — `server/index.ts`

Cada endpoint (`/api/gemini/edit`, `/compose`, `/generate`, `/analyze`,
`/analyze/stream`) lee `model` (e `imageSize` donde aplica) del `req.body` en vez de usar
el string fijo actual. El valor recibido se valida contra `IMAGE_MODELS`/`TEXT_MODELS`
(importado de `constants/models.ts`, reutilizable desde el servidor porque `tsx` compila
TS del mismo repo sin pasos adicionales). Si el modelo no está en la lista permitida, el
endpoint responde `400 { error: 'Modelo no permitido.' }` antes de llamar a Gemini — esto
evita que una request manipulada dispare llamadas a un modelo arbitrario contra la API key
del servidor.

### 5. UI — `components/ModelSelector.tsx` (nuevo) + `components/ControlsPanel.tsx`

`ModelSelector` es un componente de presentación:
- Recibe el modo actual desde `useApp()`.
- Elige la lista de opciones: `ANALYZE` → `TEXT_MODELS`; el resto de los modos →
  `IMAGE_MODELS`.
- Renderiza un `<select>` con `label` de cada modelo, más una pastilla de color por
  `costHint` (verde = low, ámbar = medium, rojo = high) para que el costo relativo se vea
  de un vistazo sin tener que reconocer nombres técnicos de modelo.
- Para `BACKGROUND_EDIT` renderiza además el selector de `imageSize` (1K/2K/4K),
  reutilizando el mismo estilo visual que ya existe para `GENERATE` en
  `ControlsPanel.tsx` (líneas ~395-420).

Se monta una sola vez en `ControlsPanel.tsx`, cerca del bloque condicional existente en
la línea ~84 (donde ya se decide qué mostrar según el modo), para que quede arriba de los
controles específicos de cada modo.

### 6. Manejo de errores

- Si el proxy devuelve 400 por modelo inválido (caso defensivo, no debería ocurrir en uso
  normal desde la UI), el error llega al mismo `catch` de `handleAction` que ya muestra
  `alert(...)`. No se agrega manejo nuevo.
- Si `localStorage` tiene guardado un modelo que ya no existe en el catálogo (por ejemplo,
  si en el futuro se quita una opción), la lectura inicial del estado valida contra
  `IMAGE_MODELS`/`TEXT_MODELS` y cae a `DEFAULT_MODEL_BY_MODE[mode]` en vez de fallar.

### 7. Testing

Manual, no hay suite automatizada en el proyecto hoy:
- Por cada uno de los 6 modos: cambiar el selector, ejecutar la acción, y confirmar en la
  pestaña Network (modo proxy) que el `model` enviado en el body coincide con lo elegido
  en la UI; en modo directo, confirmar en los logs de la consola del navegador o en la
  respuesta de Gemini que el modelo usado es el correcto.
- Confirmar que cerrar y reabrir la app mantiene la última selección por modo
  (persistencia en `localStorage`).
- Confirmar que los flujos encadenados (`shadow-mirror`, `studio-complete`) usan el
  modelo configurado en el modo correspondiente a cada paso.
- Probar el caso de error: enviar manualmente (ej. con curl) un `model` no permitido al
  proxy y confirmar el `400`.

## Decisiones descartadas

- **Config implícita leída del contexto dentro del servicio:** acopla el servicio a
  React/contexto, dificulta testear las funciones de `geminiService.ts` de forma aislada.
- **Hook genérico `useModelSelection` con overrides:** demasiada abstracción para 4-5
  funciones de servicio; se prefiere parámetros explícitos, consistente con el patrón que
  ya usa `generateCarImage`.
- **Perfiles predefinidos ("Económico"/"Calidad"):** se descartó en la fase de preguntas —
  el usuario quiere control granular por función, no niveles abstractos.
