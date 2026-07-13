# Posición y Margen en "Edición de Fondos" — Diseño

**Fecha:** 2026-07-13
**Estado:** Aprobado, pendiente de plan de implementación

## Problema

Hoy, en `AppMode.BACKGROUND_EDIT`, el único control de encuadre es un slider "Tamaño del Auto (%)" (`vehicleScale`) que se inyecta como texto en el prompt de `composeCarWithBackground`. Gemini hace todo en un solo paso: extracción, escalado, posicionamiento y sombra/reflejo — pero al depender de instrucciones de texto, no hay garantía de precisión de posición, y no hay vista previa real de dónde va a quedar el auto antes de gastar la llamada a la API.

## Objetivo

Ofrecer un control de posición inspirado en Photoroom (Centro / Personalizado arrastrable + Margen %) con vista previa en vivo **exacta** (no aproximada), separando el posicionamiento (determinístico, client-side) de la generación de sombra/reflejo (Gemini, un paso final que no reposiciona nada).

## Alcance

Aplica únicamente a `AppMode.BACKGROUND_EDIT` (incluyendo el flujo encadenado `studio-complete` de `handleChainedAction`). No incluye el checkbox "ignorar relleno en lados recortados" de Photoroom (se deja fuera de esta v1). No incluye un modo "Original" de posición (no aplica a una foto de auto recién subida, sin fondo aún removido).

## Diseño

### 1. Pipeline de 3 pasos (reemplaza el llamado único a `composeCarWithBackground`)

**Paso 1 — Quitar fondo (automático, Gemini).** Apenas hay una foto de auto cargada en modo `BACKGROUND_EDIT`, se dispara `editCarImage(carBase64, PROMPT_REMOVE_BACKGROUND_TRANSPARENT, mimeType, model)` (reutiliza la función y el modelo ya seleccionable para este modo vía el selector de modelo existente) para obtener un PNG con fondo transparente. El resultado se guarda en un nuevo estado `carCutoutUrl`. Mientras se procesa, un nuevo estado `removingBackground` controla un indicador de carga ("Quitando fondo..."). Si el usuario cambia la foto del auto, se vuelve a disparar automáticamente.

**Paso 2 — Posicionar (client-side, canvas, sin IA, instantáneo).** Una función nueva en `utils.ts`, `compositeCarOntoBackground`, seguida del mismo patrón que la ya existente `resizeBase64Image` (crea un `<canvas>`, dibuja con `ctx.drawImage`, devuelve `canvas.toDataURL(...)`):

```ts
export const compositeCarOntoBackground = (
  carCutoutBase64: string,
  backgroundBase64: string,
  canvasWidth: number,
  canvasHeight: number,
  marginPercent: number,
  offsetX: number, // -0.5..0.5, fracción del ancho del canvas, 0 = centrado
  offsetY: number  // -0.5..0.5, fracción del alto del canvas, 0 = centrado
): Promise<string> => { /* dibuja background, luego el cutout escalado+posicionado */ }
```

Esta misma función se usa tanto para la **vista previa en vivo** (se recalcula en cada cambio de margen/offset, con debounce si hace falta por performance) como para la **imagen final** que se manda al paso 3 — mismo cálculo, mismo resultado, sin aproximaciones.

**Paso 3 — Sombra/reflejo final (Gemini).** Se reutiliza `editCarImage` (sin nueva función de servicio) con un prompt nuevo, `PROMPT_SHADOW_FINISH` (en `constants/prompts.ts`), sobre la imagen ya compuesta del paso 2:

> Instrucciones clave: NO mover, redimensionar, rotar ni reposicionar el vehículo — su ubicación ya es final y correcta; agregar sombra de contacto realista bajo las ruedas; agregar reflejo especular si el piso del fondo es brillante; ajustar solo iluminación/balance de color del vehículo para igualar la escena, sin alterar su color real; no modificar el fondo (texto, logos, diseño) más allá de la sombra/reflejo.

### 2. Controles de UI (reemplazan el slider "Tamaño del Auto (%)")

- **Modo de posición:** dos botones, "Centro" y "Personalizado" (`bgPositionMode: 'center' | 'custom'`).
- **Margen (%):** slider 0-40 (`bgMarginPercent`, default 12). En ambos modos controla la escala del auto dentro del canvas (a mayor margen, más chico el auto). En "Centro", el offset es siempre `{0, 0}`.
- **Vista previa en vivo:** un componente nuevo (`components/BackgroundPositionPreview.tsx`) muestra el resultado del paso 2 recalculado en tiempo real. En modo "Personalizado", es arrastrable: el arrastre del mouse/touch actualiza `bgCustomOffset: { x: number; y: number }` (fracciones -0.5..0.5), y el preview se re-renderiza en cada movimiento.

### 3. Estado nuevo en `context/AppContext.tsx`

`carCutoutUrl: string | null`, `removingBackground: boolean`, `bgPositionMode: 'center' | 'custom'` (default `'center'`), `bgMarginPercent: number` (default 12), `bgCustomOffset: { x: number; y: number }` (default `{ x: 0, y: 0 }`).

Se **elimina** `vehicleScale` y su setter — era el único consumidor del concepto "% de ancho" que este pipeline reemplaza, y sus dos usos (`handleAction`'s rama `BACKGROUND_EDIT` y `handleChainedAction`'s `studio-complete`) migran íntegramente al nuevo pipeline.

### 4. Consecuencia de arquitectura: `composeCarWithBackground` queda obsoleta

La función de servicio `composeCarWithBackground` (en `services/geminiService.ts`, más su endpoint proxy `/api/gemini/compose` en `server/index.ts`) deja de tener consumidores tras esta migración. Se elimina como parte de este cambio, junto con `PROMPT_C_BACKGROUND` en `constants/prompts.ts` si nada más lo referencia. Esto es una eliminación de código muerto directamente causada por este rediseño, no un refactor no relacionado.

### 5. Manejo de errores

- Si falla el Paso 1 (quitar fondo): `alert` con el mensaje de error; `carCutoutUrl` permanece `null`, y la vista previa no se activa hasta que el usuario resuba la foto o el paso se reintente.
- Si falla el Paso 3 (sombra): `alert` con el mensaje; el resultado del Paso 2 (auto ya posicionado, sin sombra) permanece visible en el panel de resultado como fallback, igual que hoy cuando falla cualquier paso de `handleAction`.
- Si el usuario cambia de fondo o de foto de auto mientras el Paso 1 está en curso, la llamada en curso se ignora al completarse (se descarta si ya no corresponde al `selectedFile` actual) para evitar una condición de carrera que pise el cutout correcto con uno viejo.

### 6. Testing

Manual, sin suite automatizada (igual que el resto del proyecto):
- Subir foto de auto en "Edición de Fondos" y confirmar que se dispara la remoción de fondo automáticamente, con el indicador de carga correspondiente.
- Elegir un fondo (predeterminado o propio) y confirmar que la vista previa en vivo muestra el auto ya sin fondo, compuesto sobre el fondo elegido.
- Probar "Centro" con distintos valores de margen y confirmar que el auto se escala/centra como se espera.
- Cambiar a "Personalizado", arrastrar el auto a varias posiciones, y confirmar que la vista previa sigue el arrastre en tiempo real.
- Presionar "Aplicar Edición" y confirmar que el resultado final tiene el auto en la posición esperada (comparándolo visualmente con la vista previa) más sombra/reflejo realista añadido por Gemini.
- Confirmar que el flujo encadenado "Estudio Completo" (`handleChainedAction('studio-complete')`) sigue funcionando end-to-end con el nuevo pipeline.
- Confirmar (revisando el código) que no quedan referencias a `vehicleScale`, `composeCarWithBackground`, `PROMPT_C_BACKGROUND` ni al endpoint `/api/gemini/compose` tras la migración.

## Decisiones descartadas

- **Todo en un solo llamado a Gemini con prompt más preciso (coordenadas en texto):** más simple, sin la latencia/costo extra de la remoción de fondo automática — pero Gemini no garantiza precisión de píxel con instrucciones de texto, y no cumple con "primero posicionar, después la sombra" que pidió el usuario.
- **Composición 100% client-side sin pasada final de Gemini:** pixel-perfect y sin costo de API para el posicionamiento, pero pierde la sombra de contacto/reflejo realista generada por IA, que es el diferencial de calidad de la app.
- **Checkbox "ignorar relleno en lados recortados" (Photoroom):** requiere detección de recorte por lado del cutout; se pospone, no es necesario para el caso de uso principal (fotos de auto completas).
