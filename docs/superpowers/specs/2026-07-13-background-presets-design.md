# Galería de Fondos Predeterminados — Diseño

**Fecha:** 2026-07-13
**Estado:** Aprobado, pendiente de plan de implementación

## Problema

Hoy, en el modo "Edición de Fondos" (`AppMode.BACKGROUND_EDIT`), el usuario tiene que
subir su propia plantilla de fondo (cabina, showroom, etc.) para cada composición. No
hay forma de reutilizar un set de fondos ya preparados sin volver a subirlos cada vez.

## Objetivo

Ofrecer una galería de fondos predeterminados (cabinas/showrooms de dealers) para que el
usuario solo suba la foto del auto, elija un fondo de la galería, y la app haga
remove-background + composición automáticamente — sin perder la opción de seguir
subiendo una plantilla propia.

## Alcance

Aplica únicamente al modo `BACKGROUND_EDIT`. No cambia `composeCarWithBackground`, el
proxy, `handleAction`, ni `handleChainedAction` — estos ya reciben un `File` de fondo y
no les importa su origen. Fuera de alcance: categorías/filtros en la galería (se arranca
con una grilla plana; si el set de fondos crece mucho, categorizar queda para un cambio
futuro separado), edición/borrado de presets desde la UI (se administran copiando
archivos + editando una constante, como ya se usa para otras listas del proyecto).

## Assets iniciales

5 fondos ya preparados en `public/backgrounds/` (convertidos de PNG de 5-7 MB a JPG
~110-280 KB, ancho máximo 1920px, calidad 82 — el `public/` de Vite sirve estos archivos
tal cual, sin build step):

| Archivo | Nombre |
|---|---|
| `1.jpg` | Estudio Blanco |
| `2.jpg` | Showroom Cálido |
| `3.jpg` | Cielo y Asfalto |
| `4.jpg` | Showroom Moderno |
| `5.jpg` | Showroom Nocturno |

## Diseño

### 1. Catálogo — `constants/backgroundPresets.ts` (nuevo)

```ts
export interface BackgroundPreset {
  id: string;
  name: string;
  path: string; // relativo a public/, ej. '/backgrounds/1.jpg'
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'estudio-blanco', name: 'Estudio Blanco', path: '/backgrounds/1.jpg' },
  { id: 'showroom-calido', name: 'Showroom Cálido', path: '/backgrounds/2.jpg' },
  { id: 'cielo-asfalto', name: 'Cielo y Asfalto', path: '/backgrounds/3.jpg' },
  { id: 'showroom-moderno', name: 'Showroom Moderno', path: '/backgrounds/4.jpg' },
  { id: 'showroom-nocturno', name: 'Showroom Nocturno', path: '/backgrounds/5.jpg' },
];
```

Agregar un fondo nuevo en el futuro = copiar el `.jpg` optimizado (recomendado: ancho
≤1920px, JPG, bajo 300 KB — para mantener la galería liviana) a `public/backgrounds/` +
una línea acá. Sin cambios de código en componentes.

### 2. Refactor mínimo — `context/AppContext.tsx`

`handleFileChange` (líneas 321-332 hoy) tiene esta lógica para el target `'background'`:

```ts
setSelectedBackgroundFile(file);
const url = URL.createObjectURL(file);
setBackgroundPreviewUrl(url);
const img = new Image();
img.onload = () => {
  setBackgroundDims({ w: img.width, h: img.height });
  setOutputWidth(img.width);
  setOutputHeight(img.height);
};
img.src = url;
```

Se extrae tal cual a una función `setBackgroundFile(file: File)`, sin cambiar su
comportamiento. `handleFileChange` pasa a llamarla en la rama `'background'`. Se agrega
también:
- `selectedPresetId: string | null` (default `null`) + `setSelectedPresetId` — solo para
  resaltar visualmente qué preset está activo en la galería. No participa en
  `composeCarWithBackground` ni en ninguna llamada a Gemini.
- Cuando `handleFileChange` procesa una subida manual de fondo (`targetInput ===
  'background'`), debe limpiar `selectedPresetId` a `null` (para que ningún preset quede
  resaltado por error tras subir un archivo propio).
- `setBackgroundFile` y `selectedPresetId`/`setSelectedPresetId` se exponen en
  `AppContextValue` y en el objeto de valor del contexto.

### 3. Componente nuevo — `components/BackgroundPresetGallery.tsx`

- Recibe todo de `useApp()`: `selectedPresetId`, `setBackgroundFile`,
  `setSelectedPresetId`, `backgroundFileInputRef`.
- Grilla de miniaturas: una por cada entrada de `BACKGROUND_PRESETS` (usa `preset.path`
  directo como `src` de una miniatura, ya optimizado para web), más una tile fija al
  final "Subir mi propia plantilla" que dispara `backgroundFileInputRef.current?.click()`
  (el mismo input que ya existe hoy).
- Al clickear una miniatura de preset:
  ```ts
  const res = await fetch(preset.path);
  if (!res.ok) throw new Error('No se pudo cargar el fondo.');
  const blob = await res.blob();
  const file = new File([blob], `${preset.id}.jpg`, { type: blob.type });
  setBackgroundFile(file);
  setSelectedPresetId(preset.id);
  ```
  Envuelto en `try/catch`; en caso de error, `alert('Error: ' + mensaje)` (mismo patrón
  que el resto de la app) y no se modifica el estado de fondo actual.
- La tile del preset activo (`selectedPresetId === preset.id`) se resalta visualmente
  (borde/check), siguiendo el mismo lenguaje visual que ya usa `ControlsPanel` para
  estados activos (ej. el toggle de `removeBgType`).

### 4. UI — `components/ControlsPanel.tsx`

Reemplaza el contenido de la tarjeta "Plantilla de Fondo (Estudio)" (líneas 135-176
hoy): el upload box actual queda como una tile más dentro de la grilla de
`BackgroundPresetGallery` en lugar de ser la única opción de la tarjeta. El `<input
type="file">` y el botón "Remover plantilla de fondo" existentes no cambian de
comportamiento.

### 5. Manejo de errores

- Fetch de preset fallido (archivo faltante, red): `alert` con el mensaje, estado de
  fondo sin cambios — igual que cualquier otro error de la app.
- Si el usuario remueve la plantilla de fondo (botón "Remover plantilla de fondo"
  existente) mientras hay un preset seleccionado, también se limpia `selectedPresetId` a
  `null`.

### 6. Testing

Manual, sin suite automatizada (igual que el resto del proyecto):
- Subir auto, elegir cada uno de los 5 presets, confirmar que la vista previa y las
  dimensiones de salida (`outputWidth`/`outputHeight`) se actualizan como si se hubiera
  subido un archivo, y que "Aplicar Edición" compone correctamente contra Gemini.
- Confirmar que "Subir mi propia plantilla" sigue funcionando exactamente igual que hoy.
- Elegir un preset, después subir una plantilla propia, y confirmar que ningún preset
  queda resaltado.
- Simular un fetch fallido (renombrar temporalmente un archivo de `public/backgrounds/`)
  y confirmar que aparece el `alert` sin romper el estado de la app.
- Confirmar visualmente que las miniaturas cargan rápido (archivos ya optimizados a
  110-280 KB).

## Decisiones descartadas

- **Fondos embebidos como base64 en el bundle:** infla el tamaño del JS por algo que un
  `fetch` a un archivo estático resuelve mejor y más simple.
- **Detección automática de carpeta (glob de `public/backgrounds/`):** el usuario
  prefirió explícitamente el flujo "copiar archivo + una línea en una lista" antes que
  una convención implícita basada en nombre de archivo/carpeta.
- **Pestañas separadas Predeterminados/Personalizado:** se descartó en la fase de
  preguntas — el usuario prefirió una sola grilla con la opción de subir archivo propio
  integrada como una tile más.
