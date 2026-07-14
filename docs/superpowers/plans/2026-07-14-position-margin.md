# Posición y Margen en Edición de Fondos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Tamaño del Auto (%)" slider in "Edición de Fondos" with a Photoroom-style Centro/Personalizado position control + Margen slider + a live, pixel-accurate preview, backed by a new 3-step pipeline (auto background removal → client-side canvas compositing → a Gemini pass that only adds shadow/reflection, never repositions).

**Architecture:** `editCarImage` (already generic: one image in, one prompt, one image out) is reused for both the background-removal step and the new shadow-only finishing step — no new service function needed. A new pure canvas utility, `compositeCarOntoBackground` in `utils.ts`, does the actual positioning math and powers both the live preview and the final pre-Gemini composite, so the preview is exact rather than approximate. `composeCarWithBackground` (service + proxy endpoint) and `PROMPT_C_BACKGROUND` become dead code and are removed as part of this migration, along with `vehicleScale`.

**Tech Stack:** React 19 + TypeScript (Vite), Canvas 2D API (client-side compositing, no new dependencies), Express proxy, `@google/genai`. No test framework is configured in this repo — `npm run lint` (`tsc --noEmit`) plus manual browser verification is the established approach for this project (see the two prior plans in this directory).

## Global Constraints

- `composeCarWithBackground` (in `services/geminiService.ts`), its proxy endpoint `/api/gemini/compose` (in `server/index.ts`), and `PROMPT_C_BACKGROUND` (in `constants/prompts.ts`) must be fully removed — they have no consumers after this migration (verified: only referenced from `context/AppContext.tsx` and their own definitions).
- `vehicleScale`/`setVehicleScale` must be fully removed from `AppContextValue`, the provider, and `ControlsPanel.tsx` — replaced by `bgPositionMode`/`bgMarginPercent`/`bgCustomOffset`.
- The live preview and the final composited image sent to Gemini must use the exact same `compositeCarOntoBackground` math — the preview must never be an approximation.
- The Gemini shadow-finishing step must never move, resize, rotate, or reposition the vehicle — only add shadow/reflection/lighting-matching. This is a hard requirement on `PROMPT_SHADOW_FINISH`'s wording.
- Background removal for `BACKGROUND_EDIT` mode triggers automatically when a car photo is present in that mode (not on button click) — both `handleAction`'s `BACKGROUND_EDIT` branch and `handleChainedAction`'s `studio-complete` branch must only proceed once `carCutoutUrl` is populated, and both the main "Aplicar Edición" button and the "Estudio Completo" chained button must be disabled while it's missing or being computed (`removingBackground`).
- Run `npm run lint` (from `D:\copy-of-autoshadow-ai`) after every task — it must pass with zero errors.

---

### Task 1: Prompts — remove `PROMPT_C_BACKGROUND`, add `PROMPT_SHADOW_FINISH`

**Files:**
- Modify: `constants/prompts.ts:11-26`

**Interfaces:**
- Produces: `PROMPT_SHADOW_FINISH: string` (replaces `PROMPT_C_BACKGROUND`, which is deleted).

- [ ] **Step 1: Replace `PROMPT_C_BACKGROUND` with `PROMPT_SHADOW_FINISH`**

Find (lines 11-26):

```ts
export const PROMPT_C_BACKGROUND = `TRIGGER: "Edición de Fondos" (BACKGROUND EDIT)
ACTIVATE PROMPT C: You will receive two images:
IMAGE 1: The SOURCE VEHICLE.
IMAGE 2: The BACKGROUND TEMPLATE.

STRICT INSTRUCTIONS:
1) ABSOLUTE IDENTITY PRESERVATION: The vehicle in the final result MUST be the EXACT SAME vehicle from IMAGE 1. This is a "cut and paste" operation. DO NOT generate a new car. DO NOT modify the car's model, year, color, wheels, trim, or any specific details. It must be a pixel-perfect extraction.
2) NO RE-IMAGINING: Do not change the car's pose, angle, or perspective. It must look exactly as it does in IMAGE 1, just placed in a new environment.
3) EXTRACTION: Isolate the car from IMAGE 1 with professional precision. Remove every pixel of the original background.
4) COMPOSITION: Place the extracted car from IMAGE 1 onto the BACKGROUND TEMPLATE (IMAGE 2).
5) SCALING: Scale the car to occupy 85-90% of the width of the background.
6) INTEGRATION:
   - Create realistic contact shadows under the tires to anchor it to the floor of IMAGE 2.
   - Add a sharp mirror reflection of the car on the glossy floor of the template.
   - Adjust the car's lighting and color balance ONLY to match the studio lighting of IMAGE 2, while keeping the car's original color and features intact.
7) BACKGROUND INTEGRITY: Do not modify any text, logos, or design elements of the BACKGROUND TEMPLATE (IMAGE 2).`;
```

Replace with:

```ts
export const PROMPT_SHADOW_FINISH = `TASK: Add realistic contact shadow and reflection to an already-composited scene.
You will receive a single image: a vehicle already placed onto a background scene, both flattened into one image.

STRICT INSTRUCTIONS:
1) DO NOT move, resize, rotate, or reposition the vehicle in any way. Its placement, scale, and pose are already final and correct.
2) DO NOT modify the vehicle's model, color, wheels, trim, or any specific details.
3) Add a realistic, soft contact shadow beneath the vehicle, darkest and sharpest directly under the tires, to visually anchor it to the floor.
4) If the floor surface looks glossy/reflective, add a subtle mirror reflection of the vehicle's underside.
5) Adjust ONLY the vehicle's lighting and color balance to match the ambient lighting/color temperature of the background scene, while keeping its original color and features intact.
6) Do not modify the background itself (text, logos, design elements) beyond adding the shadow/reflection.`;
```

- [ ] **Step 2: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: FAILS — `context/AppContext.tsx` still imports and uses `PROMPT_C_BACKGROUND`/`composeCarWithBackground`. This is expected at this point in the plan; Tasks 4-5 fix it. Confirm the failure is specifically about `PROMPT_C_BACKGROUND` not being exported (not some other unrelated error) — this proves Task 1's rename took effect.

- [ ] **Step 3: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add constants/prompts.ts
git commit -m "feat: replace PROMPT_C_BACKGROUND with PROMPT_SHADOW_FINISH"
```

---

### Task 2: Client-side compositing utility

**Files:**
- Modify: `utils.ts` (add a new export; insert after the existing `resizeBase64Image` function, i.e. after its closing `};` around line 186)

**Interfaces:**
- Produces: `compositeCarOntoBackground(carCutoutBase64: string, backgroundBase64: string, canvasWidth: number, canvasHeight: number, marginPercent: number, offsetX: number, offsetY: number): Promise<string>` — `offsetX`/`offsetY` are fractions of canvas width/height in `[-0.5, 0.5]`, `0` meaning centered. Returns a `data:image/png;base64,...` string.

- [ ] **Step 1: Add the function, right after `resizeBase64Image`'s closing `};`**

```ts
/**
 * Composite a transparent car cutout onto a background image using pure canvas math —
 * no AI involved. Used for both the live position/margin preview and the final image
 * handed to Gemini's shadow-finishing pass, so the preview is always exact.
 *
 * The background fills the canvas (like CSS `background-size: cover`). The car is
 * scaled to fit within `(100 - 2 * marginPercent)%` of the canvas width/height
 * (whichever is more constraining, preserving its aspect ratio), then centered and
 * shifted by `offsetX`/`offsetY` (fractions of canvas width/height, 0 = centered).
 */
export const compositeCarOntoBackground = (
  carCutoutBase64: string,
  backgroundBase64: string,
  canvasWidth: number,
  canvasHeight: number,
  marginPercent: number,
  offsetX: number,
  offsetY: number
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const bgImg = new Image();
    bgImg.onload = () => {
      const carImg = new Image();
      carImg.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Draw the background covering the full canvas (like CSS background-size: cover)
        const bgScale = Math.max(canvasWidth / bgImg.width, canvasHeight / bgImg.height);
        const bgDrawW = bgImg.width * bgScale;
        const bgDrawH = bgImg.height * bgScale;
        const bgDrawX = (canvasWidth - bgDrawW) / 2;
        const bgDrawY = (canvasHeight - bgDrawH) / 2;
        ctx.drawImage(bgImg, bgDrawX, bgDrawY, bgDrawW, bgDrawH);

        // Fit the car within (100 - 2*marginPercent)% of the canvas, preserving aspect ratio
        const availableFraction = Math.max(0.05, 1 - (marginPercent / 100) * 2);
        const maxCarWidth = canvasWidth * availableFraction;
        const maxCarHeight = canvasHeight * availableFraction;
        const carAspect = carImg.width / carImg.height;
        let carDrawW = maxCarWidth;
        let carDrawH = carDrawW / carAspect;
        if (carDrawH > maxCarHeight) {
          carDrawH = maxCarHeight;
          carDrawW = carDrawH * carAspect;
        }

        const centerX = canvasWidth / 2 + offsetX * canvasWidth;
        const centerY = canvasHeight / 2 + offsetY * canvasHeight;
        const carDrawX = centerX - carDrawW / 2;
        const carDrawY = centerY - carDrawH / 2;

        ctx.drawImage(carImg, carDrawX, carDrawY, carDrawW, carDrawH);
        resolve(canvas.toDataURL('image/png'));
      };
      carImg.onerror = (error) => reject(error);
      carImg.src = carCutoutBase64;
    };
    bgImg.onerror = (error) => reject(error);
    bgImg.src = backgroundBase64;
  });
};
```

- [ ] **Step 2: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: still fails for the same pre-existing reason as Task 1 (`AppContext.tsx` not yet migrated) — no NEW errors should appear in `utils.ts` itself. Confirm by checking the error output only mentions `AppContext.tsx`/`PROMPT_C_BACKGROUND`/`composeCarWithBackground`, not `utils.ts`.

- [ ] **Step 3: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add utils.ts
git commit -m "feat: add compositeCarOntoBackground canvas utility"
```

---

### Task 3: Remove `composeCarWithBackground` (service + proxy endpoint)

**Files:**
- Modify: `services/geminiService.ts:70-116` (remove the `composeCarWithBackground` function entirely)
- Modify: `server/index.ts:81-120` (remove the `/api/gemini/compose` endpoint entirely)

**Interfaces:**
- Produces: nothing — this is a pure deletion. Confirms no other code still calls this function/endpoint (verified via grep in the plan's Global Constraints).

- [ ] **Step 1: Delete `composeCarWithBackground` from `services/geminiService.ts`**

Find and delete this entire block (between the `generateCarImage` doc comment above it and the function above that — i.e. everything from the `/**` comment for `composeCarWithBackground` through its closing `};`):

```ts
/**
 * Compose a vehicle onto a background template.
 * Proxy: POST /api/gemini/compose
 * Model and imageSize are caller-provided — see constants/models.ts for the catalog and per-mode defaults.
 */
export const composeCarWithBackground = async (
  carImageBase64: string,
  carImageMimeType: string,
  templateImageBase64: string,
  templateImageMimeType: string,
  prompt: string,
  model: string,
  imageSize: ImageSize
): Promise<string> => {
  if (USE_PROXY) {
    const { imageData } = await proxyPost<{ imageData: string }>(
      '/api/gemini/compose',
      { carImageBase64, carImageMimeType, templateImageBase64, templateImageMimeType, prompt, model, imageSize }
    );
    return `data:image/png;base64,${imageData}`;
  }

  // Direct call — AI Studio / non-proxy mode
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { text: 'IMAGE 1 (SOURCE VEHICLE):' },
        { inlineData: { mimeType: carImageMimeType, data: carImageBase64 } },
        { text: 'IMAGE 2 (BACKGROUND TEMPLATE):' },
        { inlineData: { mimeType: templateImageMimeType, data: templateImageBase64 } },
        { text: prompt },
      ],
    },
    config: {
      imageConfig: { imageSize },
    },
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No se pudo generar la imagen compuesta.");
};

```

Leave the surrounding `editCarImage` and `generateCarImage` functions and their doc comments untouched — only this middle block is removed. `ImageSize` remains imported and used (by `generateCarImage`), so do not touch the top-of-file import.

- [ ] **Step 2: Delete the `/api/gemini/compose` endpoint from `server/index.ts`**

Find and delete this entire block (between the `/edit` endpoint above it and the `/generate` endpoint below it):

```ts
// Vehicle + background composition
app.post('/api/gemini/compose', async (req, res) => {
  try {
    const { carImageBase64, carImageMimeType, templateImageBase64, templateImageMimeType, prompt, model, imageSize } = req.body;
    if (!carImageBase64 || !templateImageBase64 || !prompt) {
      return res.status(400).json({ error: 'Se requieren ambas imágenes y el prompt.' });
    }
    if (!isAllowed(IMAGE_MODELS, model)) {
      return res.status(400).json({ error: 'Modelo no permitido.' });
    }
    if (!isValidImageSize(imageSize)) {
      return res.status(400).json({ error: 'imageSize no permitido.' });
    }

    const ai = getAI();
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { text: 'IMAGE 1 (SOURCE VEHICLE):' },
          { inlineData: { mimeType: carImageMimeType, data: carImageBase64 } },
          { text: 'IMAGE 2 (BACKGROUND TEMPLATE):' },
          { inlineData: { mimeType: templateImageMimeType, data: templateImageBase64 } },
          { text: prompt },
        ],
      },
      config: {
        imageConfig: { imageSize },
      },
    });

    const imageData = extractImageData(response);
    if (!imageData) return res.status(500).json({ error: 'No se generó imagen en la respuesta.' });

    res.json({ imageData });
  } catch (error: any) {
    console.error('[POST /api/gemini/compose]', error?.message);
    res.status(500).json({ error: error?.message ?? 'Error interno del servidor.' });
  }
});

```

Leave `isAllowed`, `isValidImageSize`, `IMAGE_MODELS`, `TEXT_MODELS`, and the `/edit`/`/generate`/`/analyze`/`/analyze/stream` endpoints untouched — `isValidImageSize` and `IMAGE_MODELS` are still used by `/generate`.

- [ ] **Step 3: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: still fails for the same pre-existing reason (`AppContext.tsx` not yet migrated) — no new errors in `services/geminiService.ts` or `server/index.ts`.

- [ ] **Step 4: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add services/geminiService.ts server/index.ts
git commit -m "feat: remove obsolete composeCarWithBackground service and proxy endpoint"
```

---

### Task 4: Position/margin state and auto background-removal in `AppContext`

**Files:**
- Modify: `context/AppContext.tsx:38-126` (`AppContextValue` interface — remove `vehicleScale`/`setVehicleScale`, add new fields)
- Modify: `context/AppContext.tsx:151-158` (state block — remove `vehicleScale` state, add new state)
- Modify: `context/AppContext.tsx:238-260` (effects — add the auto background-removal effect)
- Modify: `context/AppContext.tsx:643-670` (`resetState` — reset the new fields)
- Modify: `context/AppContext.tsx:676-733` (context value object — remove `vehicleScale`/`setVehicleScale`, add new fields)

**Interfaces:**
- Consumes: `editCarImage` (already imported), `PROMPT_REMOVE_BACKGROUND_TRANSPARENT` (already imported), `compressImageForAPI` (already imported) — all pre-existing in this file.
- Produces: `carCutoutUrl: string | null`, `removingBackground: boolean`, `bgPositionMode: 'center' | 'custom'`, `setBgPositionMode: (v: 'center' | 'custom') => void`, `bgMarginPercent: number`, `setBgMarginPercent: (v: number) => void`, `bgCustomOffset: { x: number; y: number }`, `setBgCustomOffset: (v: { x: number; y: number }) => void` — added to `AppContextValue` and returned from `useApp()`. `carCutoutUrl` becomes non-null automatically once a car photo is present in `BACKGROUND_EDIT` mode and background removal succeeds.

- [ ] **Step 1: Update `AppContextValue`'s "background template" section — remove `vehicleScale`/`setVehicleScale`, add the new fields**

Find:

```ts
  // background template (BACKGROUND_EDIT only)
  selectedBackgroundFile: File | null;
  backgroundPreviewUrl: string | null;
  backgroundDims: { w: number; h: number } | null;
  outputWidth: number;
  outputHeight: number;
  vehicleScale: number;
  setOutputWidth: (v: number) => void;
  setOutputHeight: (v: number) => void;
  setVehicleScale: (v: number) => void;
  setBackgroundFile: (file: File) => void;
  selectedPresetId: string | null;
  setSelectedPresetId: (id: string | null) => void;
```

Replace with:

```ts
  // background template (BACKGROUND_EDIT only)
  selectedBackgroundFile: File | null;
  backgroundPreviewUrl: string | null;
  backgroundDims: { w: number; h: number } | null;
  outputWidth: number;
  outputHeight: number;
  setOutputWidth: (v: number) => void;
  setOutputHeight: (v: number) => void;
  setBackgroundFile: (file: File) => void;
  selectedPresetId: string | null;
  setSelectedPresetId: (id: string | null) => void;
  carCutoutUrl: string | null;
  removingBackground: boolean;
  bgPositionMode: 'center' | 'custom';
  setBgPositionMode: (v: 'center' | 'custom') => void;
  bgMarginPercent: number;
  setBgMarginPercent: (v: number) => void;
  bgCustomOffset: { x: number; y: number };
  setBgCustomOffset: (v: { x: number; y: number }) => void;
```

- [ ] **Step 2: Update the state block — remove `vehicleScale` state, add the new state**

Find:

```ts
  const [outputWidth, setOutputWidth] = useState(0);
  const [outputHeight, setOutputHeight] = useState(0);
  const [vehicleScale, setVehicleScale] = useState(85);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
```

Replace with:

```ts
  const [outputWidth, setOutputWidth] = useState(0);
  const [outputHeight, setOutputHeight] = useState(0);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [carCutoutUrl, setCarCutoutUrl] = useState<string | null>(null);
  const [removingBackground, setRemovingBackground] = useState(false);
  const [bgPositionMode, setBgPositionMode] = useState<'center' | 'custom'>('center');
  const [bgMarginPercent, setBgMarginPercent] = useState(12);
  const [bgCustomOffset, setBgCustomOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
```

- [ ] **Step 3: Add the auto background-removal effect, right after the PWA install-prompt effect (before the `// ── pwa / key handlers ──` comment)**

Find:

```ts
  // PWA install prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ── pwa / key handlers ──
```

Replace with:

```ts
  // PWA install prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Auto-remove the car's background as soon as a photo is present in BACKGROUND_EDIT
  // mode, so the position/margin preview has a real cutout instead of an approximation.
  useEffect(() => {
    if (mode !== AppMode.BACKGROUND_EDIT || !selectedFile) {
      return;
    }
    let cancelled = false;
    setCarCutoutUrl(null);
    setRemovingBackground(true);
    (async () => {
      try {
        const base64 = await compressImageForAPI(selectedFile);
        const cutout = await editCarImage(
          base64,
          PROMPT_REMOVE_BACKGROUND_TRANSPARENT,
          selectedFile.type,
          modelByMode[AppMode.REMOVE_BACKGROUND]
        );
        if (!cancelled) setCarCutoutUrl(cutout);
      } catch (error) {
        if (!cancelled) {
          const msg = error instanceof Error ? error.message : String(error);
          alert(`Error al quitar el fondo del auto: ${msg}`);
        }
      } finally {
        if (!cancelled) setRemovingBackground(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedFile, modelByMode]);

  // ── pwa / key handlers ──
```

- [ ] **Step 4: Reset the new fields in `resetState`**

Find:

```ts
    setSelectedPresetId(null);
    setSelectedBatchItems([]);
    setResultBatchItems([]);
```

Replace with:

```ts
    setSelectedPresetId(null);
    setCarCutoutUrl(null);
    setRemovingBackground(false);
    setBgPositionMode('center');
    setBgMarginPercent(12);
    setBgCustomOffset({ x: 0, y: 0 });
    setSelectedBatchItems([]);
    setResultBatchItems([]);
```

- [ ] **Step 5: Update the context value object — remove `vehicleScale`/`setVehicleScale`, add the new fields**

Find:

```ts
    outputWidth,
    outputHeight,
    vehicleScale,
    setOutputWidth,
    setOutputHeight,
    setVehicleScale,
    setBackgroundFile,
    selectedPresetId,
    setSelectedPresetId,
```

Replace with:

```ts
    outputWidth,
    outputHeight,
    setOutputWidth,
    setOutputHeight,
    setBackgroundFile,
    selectedPresetId,
    setSelectedPresetId,
    carCutoutUrl,
    removingBackground,
    bgPositionMode,
    setBgPositionMode,
    bgMarginPercent,
    setBgMarginPercent,
    bgCustomOffset,
    setBgCustomOffset,
```

- [ ] **Step 6: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: still fails — `handleAction` and `handleChainedAction` (lines further down in this same file) still reference `vehicleScale`, `PROMPT_C_BACKGROUND`, and `composeCarWithBackground`, which no longer exist. This is expected; Task 5 fixes it. Confirm the remaining errors are all inside `handleAction`/`handleChainedAction`/the top-of-file import list, not anywhere else.

- [ ] **Step 7: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add context/AppContext.tsx
git commit -m "feat: add position/margin state and auto background-removal effect"
```

---

### Task 5: Rewrite `handleAction`/`handleChainedAction` to use the new pipeline

**Files:**
- Modify: `context/AppContext.tsx:9-34` (imports)
- Modify: `context/AppContext.tsx` (`handleAction`'s `BACKGROUND_EDIT` branch + its dependency array)
- Modify: `context/AppContext.tsx` (`handleChainedAction`'s `studio-complete` branch + its dependency array)

**Interfaces:**
- Consumes: `compositeCarOntoBackground` from `utils.ts` (Task 2), `PROMPT_SHADOW_FINISH` from `constants/prompts.ts` (Task 1) — the removal of `composeCarWithBackground`/`PROMPT_C_BACKGROUND` (Task 3/1) means every reference to them in this file must be replaced by this task.
- Produces: no new exports — this task only changes the bodies of `handleAction` and `handleChainedAction` to consume the state Task 4 introduced (`carCutoutUrl`, `bgPositionMode`, `bgMarginPercent`, `bgCustomOffset`) instead of `vehicleScale`/`composeCarWithBackground`.

- [ ] **Step 1: Update the imports at the top of the file**

Find:

```ts
import {
  editCarImage,
  generateCarImage,
  analyzeCarImage,
  analyzeCarImageStream,
  composeCarWithBackground,
} from '../services/geminiService';
import {
  compressImageForAPI,
  fileToBase64,
  processWithConcurrency,
  resizeBase64Image,
  retryWithBackoff,
} from '../utils';
import { historyDB } from '../hooks/useImageHistory';
import { usePromptLibrary } from '../hooks/usePromptLibrary';
import {
  PROMPT_A_MIRROR,
  PROMPT_B_DARK,
  PROMPT_C_BACKGROUND,
  PROMPT_REMOVE_BACKGROUND_WHITE,
  PROMPT_REMOVE_BACKGROUND_TRANSPARENT,
  PROMPT_REMOVE_BACKGROUND_INTERIOR,
} from '../constants/prompts';
```

Replace with:

```ts
import {
  editCarImage,
  generateCarImage,
  analyzeCarImage,
  analyzeCarImageStream,
} from '../services/geminiService';
import {
  compositeCarOntoBackground,
  compressImageForAPI,
  fileToBase64,
  processWithConcurrency,
  resizeBase64Image,
  retryWithBackoff,
} from '../utils';
import { historyDB } from '../hooks/useImageHistory';
import { usePromptLibrary } from '../hooks/usePromptLibrary';
import {
  PROMPT_A_MIRROR,
  PROMPT_B_DARK,
  PROMPT_SHADOW_FINISH,
  PROMPT_REMOVE_BACKGROUND_WHITE,
  PROMPT_REMOVE_BACKGROUND_TRANSPARENT,
  PROMPT_REMOVE_BACKGROUND_INTERIOR,
} from '../constants/prompts';
```

- [ ] **Step 2: Rewrite `handleAction`'s `BACKGROUND_EDIT` branch**

Find:

```ts
        } else if (mode === AppMode.BACKGROUND_EDIT) {
          if (!selectedFile || !selectedBackgroundFile)
            throw new Error('Por favor, sube ambas imágenes: la del auto y la plantilla de fondo.');
          const carBase64 = await compressImageForAPI(selectedFile);
          const backgroundBase64 = await compressImageForAPI(selectedBackgroundFile);
          const dynamicPrompt = PROMPT_C_BACKGROUND.replace(
            '5) SCALING: Scale the car to occupy 85-90% of the width of the background',
            `5) SCALING: Scale the car to occupy exactly ${vehicleScale}% of the width of the background`
          );
          const composedImage = await composeCarWithBackground(
            carBase64,
            selectedFile.type,
            backgroundBase64,
            selectedBackgroundFile.type,
            dynamicPrompt,
            modelByMode[AppMode.BACKGROUND_EDIT],
            imageSizeByMode[AppMode.BACKGROUND_EDIT]
          );
          if (backgroundDims) {
            const resized = await resizeBase64Image(composedImage, backgroundDims.w, backgroundDims.h);
            setResultImage(resized);
            saveToHistory(resized, null, dynamicPrompt, selectedFile.name);
          } else {
            setResultImage(composedImage);
            saveToHistory(composedImage, null, dynamicPrompt, selectedFile.name);
          }

        } else if (mode === AppMode.GENERATE) {
```

Replace with:

```ts
        } else if (mode === AppMode.BACKGROUND_EDIT) {
          if (!selectedFile || !selectedBackgroundFile)
            throw new Error('Por favor, sube ambas imágenes: la del auto y la plantilla de fondo.');
          if (!carCutoutUrl)
            throw new Error('Espera a que se termine de quitar el fondo del auto.');
          const backgroundBase64 = await compressImageForAPI(selectedBackgroundFile);
          const canvasWidth = outputWidth || backgroundDims?.w || 1024;
          const canvasHeight = outputHeight || backgroundDims?.h || 1024;
          const composited = await compositeCarOntoBackground(
            carCutoutUrl,
            backgroundBase64,
            canvasWidth,
            canvasHeight,
            bgMarginPercent,
            bgPositionMode === 'custom' ? bgCustomOffset.x : 0,
            bgPositionMode === 'custom' ? bgCustomOffset.y : 0
          );
          const compositedBase64 = composited.split(',')[1];
          const finalImage = await editCarImage(
            compositedBase64,
            PROMPT_SHADOW_FINISH,
            'image/png',
            modelByMode[AppMode.BACKGROUND_EDIT]
          );
          setResultImage(finalImage);
          saveToHistory(finalImage, null, 'Edición de Fondos: Posición + Sombra', selectedFile.name);

        } else if (mode === AppMode.GENERATE) {
```

- [ ] **Step 3: Update `handleAction`'s dependency array**

Find:

```ts
    [
      mode, prompt, selectedFile, selectedBackgroundFile, backgroundDims, vehicleScale,
      removeBgType, selectedBatchItems, genAspectRatio, genImageSize, saveToHistory,
      modelByMode, imageSizeByMode,
    ]
  );

  // ── retryFailedBatch ──
```

Replace with:

```ts
    [
      mode, prompt, selectedFile, selectedBackgroundFile, backgroundDims, outputWidth, outputHeight,
      carCutoutUrl, bgMarginPercent, bgPositionMode, bgCustomOffset,
      removeBgType, selectedBatchItems, genAspectRatio, genImageSize, saveToHistory,
      modelByMode,
    ]
  );

  // ── retryFailedBatch ──
```

- [ ] **Step 4: Rewrite `handleChainedAction`'s `studio-complete` branch**

Find:

```ts
        } else if (flow === 'studio-complete') {
          if (!selectedBackgroundFile) {
            alert('Para "Estudio Completo" necesitas subir también la plantilla de fondo.');
            return;
          }

          // Step 1: Remove background
          setLoading({ isLoading: true, message: 'Paso 1/2: Removiendo fondo del auto…' });
          const noBg = await editCarImage(base64, PROMPT_REMOVE_BACKGROUND_WHITE, selectedFile.type, modelByMode[AppMode.REMOVE_BACKGROUND]);
          const noBgBase64 = noBg.split(',')[1];

          // Step 2: Compose onto background template
          setLoading({ isLoading: true, message: 'Paso 2/2: Componiendo con plantilla de estudio…' });
          const bgBase64 = await compressImageForAPI(selectedBackgroundFile);
          const dynamicPrompt = PROMPT_C_BACKGROUND.replace(
            '5) SCALING: Scale the car to occupy 85-90% of the width of the background',
            `5) SCALING: Scale the car to occupy exactly ${vehicleScale}% of the width of the background`
          );
          const composed = await composeCarWithBackground(
            noBgBase64, 'image/png',
            bgBase64, selectedBackgroundFile.type,
            dynamicPrompt,
            modelByMode[AppMode.BACKGROUND_EDIT],
            imageSizeByMode[AppMode.BACKGROUND_EDIT]
          );
          const finalImage = backgroundDims
            ? await resizeBase64Image(composed, backgroundDims.w, backgroundDims.h)
            : composed;
          setResultImage(finalImage);
          saveToHistory(finalImage, null, 'Flujo: Sin Fondo + Fondo Estudio', selectedFile.name);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        alert(`Error en flujo encadenado: ${msg}`);
      } finally {
        setLoading({ isLoading: false, message: '' });
      }
    },
    [selectedFile, selectedBackgroundFile, vehicleScale, backgroundDims, saveToHistory, modelByMode, imageSizeByMode]
  );
```

Replace with:

```ts
        } else if (flow === 'studio-complete') {
          if (!selectedBackgroundFile) {
            alert('Para "Estudio Completo" necesitas subir también la plantilla de fondo.');
            return;
          }
          if (!carCutoutUrl) {
            alert('Espera a que se termine de quitar el fondo del auto.');
            return;
          }

          setLoading({ isLoading: true, message: 'Paso 1/2: Componiendo con plantilla de estudio…' });
          const bgBase64 = await compressImageForAPI(selectedBackgroundFile);
          const canvasWidth = outputWidth || backgroundDims?.w || 1024;
          const canvasHeight = outputHeight || backgroundDims?.h || 1024;
          const composited = await compositeCarOntoBackground(
            carCutoutUrl,
            bgBase64,
            canvasWidth,
            canvasHeight,
            bgMarginPercent,
            bgPositionMode === 'custom' ? bgCustomOffset.x : 0,
            bgPositionMode === 'custom' ? bgCustomOffset.y : 0
          );
          const compositedBase64 = composited.split(',')[1];

          setLoading({ isLoading: true, message: 'Paso 2/2: Agregando sombra y reflejo…' });
          const finalImage = await editCarImage(
            compositedBase64,
            PROMPT_SHADOW_FINISH,
            'image/png',
            modelByMode[AppMode.BACKGROUND_EDIT]
          );
          setResultImage(finalImage);
          saveToHistory(finalImage, null, 'Flujo: Sin Fondo + Fondo Estudio', selectedFile.name);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        alert(`Error en flujo encadenado: ${msg}`);
      } finally {
        setLoading({ isLoading: false, message: '' });
      }
    },
    [
      selectedFile, selectedBackgroundFile, backgroundDims, outputWidth, outputHeight,
      carCutoutUrl, bgMarginPercent, bgPositionMode, bgCustomOffset, saveToHistory, modelByMode,
    ]
  );
```

Note: the `const base64 = await compressImageForAPI(selectedFile);` line near the top of `handleChainedAction` (before the `if (flow === 'shadow-mirror')` check) stays untouched — it's still needed by the `shadow-mirror` branch, which this task does not modify.

- [ ] **Step 5: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0. This is the first point in the plan where the full project typechecks cleanly again.

- [ ] **Step 6: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add context/AppContext.tsx
git commit -m "feat: migrate BACKGROUND_EDIT actions to the position+shadow pipeline"
```

---

### Task 6: `BackgroundPositionPreview` component

**Files:**
- Create: `components/BackgroundPositionPreview.tsx`

**Interfaces:**
- Consumes: `carCutoutUrl`, `removingBackground`, `backgroundPreviewUrl`, `outputWidth`, `outputHeight`, `backgroundDims`, `bgPositionMode`, `setBgPositionMode`, `bgMarginPercent`, `setBgMarginPercent`, `bgCustomOffset`, `setBgCustomOffset` from `useApp()` (Task 4); `compositeCarOntoBackground` from `utils.ts` (Task 2).
- Produces: default-exported `BackgroundPositionPreview: React.FC` with no props.

- [ ] **Step 1: Create the component**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { compositeCarOntoBackground } from '../utils';

const BackgroundPositionPreview: React.FC = () => {
  const {
    carCutoutUrl,
    removingBackground,
    backgroundPreviewUrl,
    outputWidth,
    outputHeight,
    backgroundDims,
    bgPositionMode,
    setBgPositionMode,
    bgMarginPercent,
    setBgMarginPercent,
    bgCustomOffset,
    setBgCustomOffset,
  } = useApp();

  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);

  const canvasWidth = outputWidth || backgroundDims?.w || 1024;
  const canvasHeight = outputHeight || backgroundDims?.h || 1024;

  useEffect(() => {
    if (!carCutoutUrl || !backgroundPreviewUrl) {
      setPreviewSrc(null);
      return;
    }
    let cancelled = false;
    compositeCarOntoBackground(
      carCutoutUrl,
      backgroundPreviewUrl,
      canvasWidth,
      canvasHeight,
      bgMarginPercent,
      bgPositionMode === 'custom' ? bgCustomOffset.x : 0,
      bgPositionMode === 'custom' ? bgCustomOffset.y : 0
    )
      .then(url => {
        if (!cancelled) setPreviewSrc(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [carCutoutUrl, backgroundPreviewUrl, canvasWidth, canvasHeight, bgMarginPercent, bgPositionMode, bgCustomOffset]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (bgPositionMode !== 'custom' || !boxRef.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, startOffset: bgCustomOffset };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const dxFraction = (e.clientX - dragState.current.startX) / rect.width;
    const dyFraction = (e.clientY - dragState.current.startY) / rect.height;
    const nextX = Math.min(0.5, Math.max(-0.5, dragState.current.startOffset.x + dxFraction));
    const nextY = Math.min(0.5, Math.max(-0.5, dragState.current.startOffset.y + dyFraction));
    setBgCustomOffset({ x: nextX, y: nextY });
  };

  const handlePointerUp = () => {
    dragState.current = null;
  };

  return (
    <div className="space-y-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
      <label className="text-xs font-bold uppercase text-emerald-400 tracking-wider">Posición</label>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setBgPositionMode('center')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            bgPositionMode === 'center'
              ? 'bg-white/10 text-white border border-white/20'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          Centro
        </button>
        <button
          type="button"
          onClick={() => setBgPositionMode('custom')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            bgPositionMode === 'custom'
              ? 'bg-white/10 text-white border border-white/20'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          Personalizado
        </button>
      </div>

      <label className="text-xs font-bold uppercase text-emerald-400 tracking-wider flex justify-between items-center pt-1">
        <span>Margen (%)</span>
        <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px]">{bgMarginPercent}%</span>
      </label>
      <input
        type="range"
        min="0"
        max="40"
        step="1"
        value={bgMarginPercent}
        onChange={e => setBgMarginPercent(parseInt(e.target.value))}
        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />

      <div>
        <p className="text-[10px] uppercase text-slate-600 font-semibold tracking-wider mb-1">Vista Previa</p>
        <div
          ref={boxRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`relative h-48 rounded-xl border border-slate-800 bg-slate-900 overflow-hidden flex items-center justify-center ${
            bgPositionMode === 'custom' ? 'cursor-move' : ''
          }`}
        >
          {removingBackground && <p className="text-xs text-slate-500">Quitando fondo del auto…</p>}
          {!removingBackground && !previewSrc && (
            <p className="text-xs text-slate-600 text-center px-4">
              Sube un auto y elegí un fondo para ver la vista previa.
            </p>
          )}
          {!removingBackground && previewSrc && (
            <img
              src={previewSrc}
              alt="Vista previa de posición"
              className="w-full h-full object-contain select-none pointer-events-none"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default BackgroundPositionPreview;
```

- [ ] **Step 2: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0 (component isn't mounted anywhere yet, so this only checks it compiles standalone).

- [ ] **Step 3: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add components/BackgroundPositionPreview.tsx
git commit -m "feat: add BackgroundPositionPreview component"
```

---

### Task 7: Wire into `ControlsPanel`, gate the action buttons, drop the now-dead resolution selector

**Files:**
- Modify: `components/ControlsPanel.tsx:1-52` (imports + destructured context values)
- Modify: `components/ControlsPanel.tsx:247-267` (remove the old "Vehicle scale slider" block, mount the new component)
- Modify: `components/ControlsPanel.tsx:479-497` (main "Aplicar Edición" button — gate on `removingBackground`/`carCutoutUrl`)
- Modify: `components/ControlsPanel.tsx:524-538` ("Estudio Completo" chained button — gate on `removingBackground`/`carCutoutUrl`)
- Modify: `components/ModelSelector.tsx:18` (drop `BACKGROUND_EDIT` from the resolution-selector condition — Gemini no longer receives `imageSize` for this mode now that compositing is client-side)

**Interfaces:**
- Consumes: `BackgroundPositionPreview` (default export) from `components/BackgroundPositionPreview.tsx` (Task 6).
- Produces: nothing new — final wiring task.

- [ ] **Step 1: Import the new component and update the destructured context values**

Find (import block):

```ts
import ModelSelector from './ModelSelector';
import BackgroundPresetGallery from './BackgroundPresetGallery';
```

Replace with:

```ts
import ModelSelector from './ModelSelector';
import BackgroundPresetGallery from './BackgroundPresetGallery';
import BackgroundPositionPreview from './BackgroundPositionPreview';
```

Find (destructure at the top of the component):

```ts
    selectedBackgroundFile: selectedBackgroundFile,
    backgroundPreviewUrl,
    backgroundDims,
    outputWidth,
    outputHeight,
    vehicleScale,
    setOutputWidth,
    setOutputHeight,
    setVehicleScale,
    removeBgType,
```

Replace with:

```ts
    selectedBackgroundFile: selectedBackgroundFile,
    backgroundPreviewUrl,
    backgroundDims,
    outputWidth,
    outputHeight,
    setOutputWidth,
    setOutputHeight,
    carCutoutUrl,
    removingBackground,
    removeBgType,
```

- [ ] **Step 2: Replace the "Vehicle scale slider" block with the new preview component**

Find:

```tsx
        {/* Vehicle scale slider (BACKGROUND_EDIT only) */}
        {mode === AppMode.BACKGROUND_EDIT && (
          <div className="space-y-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
            <label className="text-xs font-bold uppercase text-emerald-400 tracking-wider flex justify-between items-center">
              <span>Tamaño del Auto (%)</span>
              <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px]">{vehicleScale}%</span>
            </label>
            <input
              type="range"
              min="30"
              max="100"
              step="1"
              value={vehicleScale}
              onChange={e => setVehicleScale(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-slate-600 font-medium">
              <span>Pequeño</span><span>Medio</span><span>Grande</span>
            </div>
          </div>
        )}
```

Replace with:

```tsx
        {/* Position + margin preview (BACKGROUND_EDIT only) */}
        {mode === AppMode.BACKGROUND_EDIT && <BackgroundPositionPreview />}
```

- [ ] **Step 3: Gate the main "Aplicar Edición" button on `removingBackground`/`carCutoutUrl`**

Find:

```tsx
            disabled={
              (!selectedFile && mode !== AppMode.GENERATE) ||
              (mode === AppMode.BACKGROUND_EDIT && (!selectedFile || !selectedBackgroundFile))
            }
```

Replace with:

```tsx
            disabled={
              (!selectedFile && mode !== AppMode.GENERATE) ||
              (mode === AppMode.BACKGROUND_EDIT &&
                (!selectedFile || !selectedBackgroundFile || removingBackground || !carCutoutUrl))
            }
```

- [ ] **Step 4: Gate the "Estudio Completo" chained button on `removingBackground`/`carCutoutUrl`**

Find:

```tsx
            {/* Estudio Completo — only when background template is loaded */}
            <Button
              onClick={() => handleChainedAction('studio-complete')}
              isLoading={loading.isLoading}
              className={`w-full text-white shadow-lg shadow-purple-900/40 transition-all ${
                selectedBackgroundFile
                  ? 'bg-purple-700 hover:bg-purple-600'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
              }`}
              disabled={!selectedFile || !selectedBackgroundFile}
            >
              {!loading.isLoading && <SparkIcon />}
              {selectedBackgroundFile
                ? 'Sin Fondo → Fondo Estudio'
                : 'Sin Fondo → Fondo Estudio (sube plantilla)'}
            </Button>
```

Replace with:

```tsx
            {/* Estudio Completo — only when background template is loaded and the cutout is ready */}
            <Button
              onClick={() => handleChainedAction('studio-complete')}
              isLoading={loading.isLoading}
              className={`w-full text-white shadow-lg shadow-purple-900/40 transition-all ${
                selectedBackgroundFile && carCutoutUrl && !removingBackground
                  ? 'bg-purple-700 hover:bg-purple-600'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
              }`}
              disabled={!selectedFile || !selectedBackgroundFile || removingBackground || !carCutoutUrl}
            >
              {!loading.isLoading && <SparkIcon />}
              {selectedBackgroundFile
                ? 'Sin Fondo → Fondo Estudio'
                : 'Sin Fondo → Fondo Estudio (sube plantilla)'}
            </Button>
```

- [ ] **Step 5: Drop `BACKGROUND_EDIT` from `ModelSelector`'s resolution-selector condition**

Find, in `components/ModelSelector.tsx`:

```ts
  const showImageSize = mode === AppMode.BACKGROUND_EDIT;
```

Replace with:

```ts
  const showImageSize = mode === AppMode.GENERATE;
```

This selector now only applies to `GENERATE`, the one remaining mode where `imageSize` is actually sent to Gemini. `AppMode` is already imported in this file; no import changes needed.

- [ ] **Step 6: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0.

- [ ] **Step 7: Manual end-to-end verification in the browser**

Run: `cd D:\copy-of-autoshadow-ai && npm run dev`

In the browser:
1. Go to "Edición de Fondos", upload a car photo. Confirm the new "Posición" card appears with "Centro"/"Personalizado" buttons, a "Margen (%)" slider, and a "Vista Previa" box that briefly shows "Quitando fondo del auto…" then settles.
2. Pick a background (preset or upload). Confirm the preview box now shows the car composited onto that background (still no shadow — that's expected, shadow is added by Gemini in the final step).
3. Move the "Margen" slider and confirm the car's size in the preview changes live.
4. Switch to "Personalizado" and drag inside the preview box — confirm the car moves and stays within the box bounds (doesn't fly off past roughly half the box width/height in either direction).
5. Click "Aplicar Edición". Confirm the button was disabled (and the "Estudio Completo" button too) while the cutout wasn't ready, and that both become enabled once the preview shows the composited car. Confirm the final result has the car in the position you set, plus a visible shadow/reflection — check the network tab: the request to `/api/gemini/edit` (not `/compose` — that endpoint no longer exists) carries the composited image and the new shadow-only prompt.
6. Test the "Sin Fondo → Fondo Estudio" chained flow end-to-end and confirm it also produces a result with the car positioned per your Posición/Margen settings.
7. Confirm no request is ever made to `/api/gemini/compose` (it should 404 if you try it manually, since the endpoint was removed).

Stop the dev server (`Ctrl+C`) once all checks pass.

- [ ] **Step 8: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add components/ControlsPanel.tsx components/ModelSelector.tsx
git commit -m "feat: mount BackgroundPositionPreview and gate actions on cutout readiness"
```

---

## Self-Review Notes

- **Spec coverage:** 3-step pipeline (auto remove-bg → client canvas composite → Gemini shadow-only pass) ✓ Tasks 1-2-4-5; Centro/Personalizado + Margen controls with live exact preview ✓ Task 6; drag interaction for Personalizado ✓ Task 6; `composeCarWithBackground`/`PROMPT_C_BACKGROUND`/`vehicleScale` removal ✓ Tasks 3-4-5-7; error handling for both pipeline steps ✓ Task 4 (remove-bg) and Task 5 (shadow pass reuses the existing `handleAction`/`handleChainedAction` catch blocks); race-condition guard on the auto remove-bg effect ✓ Task 4 Step 3 (`cancelled` flag); button gating on cutout readiness ✓ Task 7; manual E2E verification per the spec's Testing section ✓ Task 7 Step 7.
- **Placeholder scan:** no TBD/TODO; every step contains complete, runnable code.
- **Type consistency:** `carCutoutUrl`, `removingBackground`, `bgPositionMode`, `setBgPositionMode`, `bgMarginPercent`, `setBgMarginPercent`, `bgCustomOffset`, `setBgCustomOffset` names and signatures match between Task 4 (definition) and Tasks 5-6-7 (consumption). `compositeCarOntoBackground`'s parameter order/types match between Task 2 (definition) and Tasks 5-6 (calls). `PROMPT_SHADOW_FINISH` matches between Task 1 (definition) and Task 5 (usage).
