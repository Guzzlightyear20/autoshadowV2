# Selector de Modelo por Función — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick, per app mode, which Gemini model (and image size where relevant) the app calls — in both direct (AI Studio) and proxy (local server) execution paths — so they can trade quality for cost without editing code.

**Architecture:** A single model catalog (`constants/models.ts`) is the source of truth for available models and current defaults. Service functions (`services/geminiService.ts`) accept `model` (and `imageSize` where applicable) as explicit parameters instead of hardcoded strings, defaulting to today's values so behavior is unchanged until wired. `AppContext` holds a `modelByMode` (+ `imageSizeByMode`) selection persisted to `localStorage` and passes it into every service call. The Express proxy (`server/index.ts`) accepts and validates the same `model` field against the catalog before calling Gemini. A new `ModelSelector` component renders the per-mode dropdown inside `ControlsPanel`.

**Tech Stack:** React 19 + TypeScript (Vite), Express proxy server, `@google/genai` SDK, `localStorage` for persistence. No test framework is configured in this repo (`npm run lint` = `tsc --noEmit` is the only automated check) — this was confirmed and accepted during brainstorming, so verification in this plan uses typecheck-as-gate plus manual/curl checks instead of unit tests.

## Global Constraints

- Defaults for every mode must match today's hardcoded behavior exactly (`EDIT_SHADOW`/`REMOVE_BACKGROUND`/`BATCH_EDIT_SHADOW` → `gemini-2.5-flash-image`; `BACKGROUND_EDIT`/`GENERATE` → `gemini-3.1-flash-image-preview`; `ANALYZE` → `gemini-3.1-pro-preview`; `BACKGROUND_EDIT` imageSize default → `2K`), so nobody's cost changes silently.
- The model catalog (`constants/models.ts`) is the only place model IDs/labels are defined — no duplicated literal model strings in components or the server.
- The server proxy must reject (`400`) any `model` value not present in its catalog list before calling Gemini.
- Model selection persists per mode in `localStorage` under key `autoshadow:models` (and `autoshadow:imageSizes` for the `BACKGROUND_EDIT` image size).
- Run `npm run lint` (root of `D:\copy-of-autoshadow-ai`) after every task — it must pass with zero errors before moving on.

---

### Task 1: Model catalog

**Files:**
- Create: `constants/models.ts`

**Interfaces:**
- Produces: `ModelOption { id: string; label: string; costHint: 'low' | 'medium' | 'high' }`, `IMAGE_MODELS: ModelOption[]`, `TEXT_MODELS: ModelOption[]`, `DEFAULT_MODEL_BY_MODE: Record<AppMode, string>`, `MODELS_FOR_MODE(mode: AppMode): ModelOption[]`, `isValidModel(mode: AppMode, modelId: string): boolean`

- [ ] **Step 1: Create the catalog file**

```ts
import { AppMode } from '../types';

export interface ModelOption {
  id: string;
  label: string;
  costHint: 'low' | 'medium' | 'high';
}

export const IMAGE_MODELS: ModelOption[] = [
  { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image', costHint: 'low' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', costHint: 'low' },
  { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (Preview)', costHint: 'high' },
];

export const TEXT_MODELS: ModelOption[] = [
  { id: 'gemini-3.1-flash', label: 'Gemini 3.1 Flash', costHint: 'low' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', costHint: 'high' },
];

// Matches the behavior hardcoded in services/geminiService.ts and server/index.ts today.
// Keep these in sync if the code's fallback values ever change.
export const DEFAULT_MODEL_BY_MODE: Record<AppMode, string> = {
  [AppMode.EDIT_SHADOW]: 'gemini-2.5-flash-image',
  [AppMode.REMOVE_BACKGROUND]: 'gemini-2.5-flash-image',
  [AppMode.BATCH_EDIT_SHADOW]: 'gemini-2.5-flash-image',
  [AppMode.BACKGROUND_EDIT]: 'gemini-3.1-flash-image-preview',
  [AppMode.GENERATE]: 'gemini-3.1-flash-image-preview',
  [AppMode.ANALYZE]: 'gemini-3.1-pro-preview',
};

export const MODELS_FOR_MODE = (mode: AppMode): ModelOption[] =>
  mode === AppMode.ANALYZE ? TEXT_MODELS : IMAGE_MODELS;

export const isValidModel = (mode: AppMode, modelId: string): boolean =>
  MODELS_FOR_MODE(mode).some(m => m.id === modelId);
```

- [ ] **Step 2: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0, no TypeScript errors (this file has no consumers yet, so it just needs to compile standalone).

- [ ] **Step 3: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add constants/models.ts
git commit -m "feat: add model catalog for per-mode model selection"
```

---

### Task 2: Thread `model` (and `imageSize`) through the service layer

**Files:**
- Modify: `services/geminiService.ts:31-67` (`editCarImage`)
- Modify: `services/geminiService.ts:69-113` (`composeCarWithBackground`)
- Modify: `services/geminiService.ts:115-149` (`generateCarImage`)
- Modify: `services/geminiService.ts:151-213` (`analyzeCarImageStream`)
- Modify: `services/geminiService.ts:215-246` (`analyzeCarImage`)

**Interfaces:**
- Consumes: nothing new (this task only changes function signatures/bodies; defaults keep current behavior).
- Produces: `editCarImage(base64Image, prompt, mimeType?, model?)`, `composeCarWithBackground(carBase64, carMime, tplBase64, tplMime, prompt, model?, imageSize?)`, `generateCarImage(prompt, aspectRatio, imageSize, model?)`, `analyzeCarImage(base64Image, prompt, mimeType?, model?)`, `analyzeCarImageStream(base64Image, prompt, mimeType?, onChunk, model?)` — all new `model`/`imageSize` params default to the values in `DEFAULT_MODEL_BY_MODE`, so existing callers keep compiling and behaving identically until Task 5 wires explicit values.

- [ ] **Step 1: Replace `editCarImage` (lines 31-67)**

```ts
/**
 * Edit an image (shadows, background removal).
 * Proxy: POST /api/gemini/edit
 * Model is caller-provided; defaults to gemini-2.5-flash-image (today's fixed behavior).
 */
export const editCarImage = async (
  base64Image: string,
  prompt: string,
  mimeType: string = "image/jpeg",
  model: string = 'gemini-2.5-flash-image'
): Promise<string> => {
  if (USE_PROXY) {
    const { imageData } = await proxyPost<{ imageData: string }>(
      '/api/gemini/edit',
      { base64Image, prompt, mimeType, model }
    );
    return `data:image/png;base64,${imageData}`;
  }

  // Direct call — AI Studio / non-proxy mode
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Image } },
        { text: prompt },
      ],
    },
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated in response.");
};
```

- [ ] **Step 2: Replace `composeCarWithBackground` (lines 69-113)**

```ts
/**
 * Compose a vehicle onto a background template.
 * Proxy: POST /api/gemini/compose
 * Model and imageSize are caller-provided; default to today's fixed values
 * (gemini-3.1-flash-image-preview, 2K).
 */
export const composeCarWithBackground = async (
  carImageBase64: string,
  carImageMimeType: string,
  templateImageBase64: string,
  templateImageMimeType: string,
  prompt: string,
  model: string = 'gemini-3.1-flash-image-preview',
  imageSize: ImageSize = ImageSize.SIZE_2K
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

- [ ] **Step 3: Replace `generateCarImage` (lines 115-149)**

```ts
/**
 * Generate a new vehicle image from a text prompt.
 * Proxy: POST /api/gemini/generate
 * Model is caller-provided; defaults to gemini-3.1-flash-image-preview (today's fixed behavior).
 */
export const generateCarImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  model: string = 'gemini-3.1-flash-image-preview'
): Promise<string> => {
  if (USE_PROXY) {
    const { imageData } = await proxyPost<{ imageData: string }>(
      '/api/gemini/generate',
      { prompt, aspectRatio, imageSize, model }
    );
    return `data:image/png;base64,${imageData}`;
  }

  // Direct call — AI Studio / non-proxy mode
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model,
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: { aspectRatio, imageSize },
    },
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated.");
};
```

- [ ] **Step 4: Replace `analyzeCarImageStream` (lines 151-213)**

```ts
/**
 * Analyze a vehicle image with streaming — calls onChunk for each text chunk
 * so the UI can render the analysis word-by-word as it arrives.
 * Proxy: POST /api/gemini/analyze/stream (SSE)
 * Model is caller-provided; defaults to gemini-3.1-pro-preview (today's fixed behavior).
 */
export const analyzeCarImageStream = async (
  base64Image: string,
  prompt: string,
  mimeType: string = 'image/jpeg',
  onChunk: (text: string) => void,
  model: string = 'gemini-3.1-pro-preview'
): Promise<void> => {
  if (USE_PROXY) {
    const res = await fetch('/api/gemini/analyze/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image, prompt, mimeType, model }),
    });

    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return;
        try {
          const { text, error } = JSON.parse(payload);
          if (error) throw new Error(error);
          if (text) onChunk(text);
        } catch { /* skip malformed chunks */ }
      }
    }
    return;
  }

  // Direct streaming — AI Studio / non-proxy mode
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const stream = await ai.models.generateContentStream({
    model,
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Image } },
        { text: prompt },
      ],
    },
  });

  for await (const chunk of stream) {
    if (chunk.text) onChunk(chunk.text);
  }
};
```

- [ ] **Step 5: Replace `analyzeCarImage` (lines 215-246)**

```ts
/**
 * Analyze a vehicle image and return structured text.
 * Proxy: POST /api/gemini/analyze
 * Model is caller-provided; defaults to gemini-3.1-pro-preview (today's fixed behavior).
 */
export const analyzeCarImage = async (
  base64Image: string,
  prompt: string,
  mimeType: string = "image/jpeg",
  model: string = 'gemini-3.1-pro-preview'
): Promise<string> => {
  if (USE_PROXY) {
    const { text } = await proxyPost<{ text: string }>(
      '/api/gemini/analyze',
      { base64Image, prompt, mimeType, model }
    );
    return text;
  }

  // Direct call — AI Studio / non-proxy mode
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Image } },
        { text: prompt },
      ],
    },
  });

  return response.text ?? "No se pudo generar el análisis.";
};
```

- [ ] **Step 6: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0. `AppContext.tsx` still calls these functions with the old (shorter) argument lists — that's fine because every new parameter has a default value, so the call sites remain valid.

- [ ] **Step 7: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add services/geminiService.ts
git commit -m "feat: accept model/imageSize as parameters in geminiService functions"
```

---

### Task 3: Accept and validate `model` in the proxy server

**Files:**
- Modify: `server/index.ts:1-25` (imports + `getAI`)
- Modify: `server/index.ts:41-68` (`/api/gemini/edit`)
- Modify: `server/index.ts:70-103` (`/api/gemini/compose`)
- Modify: `server/index.ts:105-128` (`/api/gemini/generate`)
- Modify: `server/index.ts:130-154` (`/api/gemini/analyze`)
- Modify: `server/index.ts:156-193` (`/api/gemini/analyze/stream`)

**Interfaces:**
- Consumes: `IMAGE_MODELS`, `TEXT_MODELS` from `constants/models.ts` (Task 1).
- Produces: every `/api/gemini/*` endpoint now reads `model` (and `imageSize` where relevant) from `req.body`, returns `400 { error: 'Modelo no permitido.' }` if `model` isn't in the matching catalog list.

- [ ] **Step 1: Add the catalog import and a validation helper (after line 9, before `const app = express();`)**

```ts
import { IMAGE_MODELS, TEXT_MODELS } from '../constants/models';

const isAllowed = (list: { id: string }[], model: unknown): model is string =>
  typeof model === 'string' && list.some(m => m.id === model);
```

- [ ] **Step 2: Update `/api/gemini/edit` (lines 41-68 today) to validate and use `model`**

```ts
// Shadow / background-removal edits
app.post('/api/gemini/edit', async (req, res) => {
  try {
    const { base64Image, prompt, mimeType = 'image/jpeg', model } = req.body;
    if (!base64Image || !prompt) {
      return res.status(400).json({ error: 'base64Image y prompt son requeridos.' });
    }
    if (!isAllowed(IMAGE_MODELS, model)) {
      return res.status(400).json({ error: 'Modelo no permitido.' });
    }

    const ai = getAI();
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: prompt },
        ],
      },
    });

    const imageData = extractImageData(response);
    if (!imageData) return res.status(500).json({ error: 'No se generó imagen en la respuesta.' });

    res.json({ imageData });
  } catch (error: any) {
    console.error('[POST /api/gemini/edit]', error?.message);
    res.status(500).json({ error: error?.message ?? 'Error interno del servidor.' });
  }
});
```

- [ ] **Step 3: Update `/api/gemini/compose`**

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

- [ ] **Step 4: Update `/api/gemini/generate`**

```ts
// Text-to-image vehicle generation
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { prompt, aspectRatio, imageSize, model } = req.body;
    if (!prompt) return res.status(400).json({ error: 'El prompt es requerido.' });
    if (!isAllowed(IMAGE_MODELS, model)) {
      return res.status(400).json({ error: 'Modelo no permitido.' });
    }

    const ai = getAI();
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: { aspectRatio, imageSize },
      },
    });

    const imageData = extractImageData(response);
    if (!imageData) return res.status(500).json({ error: 'No se generó imagen en la respuesta.' });

    res.json({ imageData });
  } catch (error: any) {
    console.error('[POST /api/gemini/generate]', error?.message);
    res.status(500).json({ error: error?.message ?? 'Error interno del servidor.' });
  }
});
```

- [ ] **Step 5: Update `/api/gemini/analyze`**

```ts
// Vehicle image analysis
app.post('/api/gemini/analyze', async (req, res) => {
  try {
    const { base64Image, prompt, mimeType = 'image/jpeg', model } = req.body;
    if (!base64Image || !prompt) {
      return res.status(400).json({ error: 'base64Image y prompt son requeridos.' });
    }
    if (!isAllowed(TEXT_MODELS, model)) {
      return res.status(400).json({ error: 'Modelo no permitido.' });
    }

    const ai = getAI();
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: prompt },
        ],
      },
    });

    res.json({ text: response.text ?? 'No se pudo generar el análisis.' });
  } catch (error: any) {
    console.error('[POST /api/gemini/analyze]', error?.message);
    res.status(500).json({ error: error?.message ?? 'Error interno del servidor.' });
  }
});
```

- [ ] **Step 6: Update `/api/gemini/analyze/stream`**

```ts
// Vehicle analysis — streaming via Server-Sent Events
app.post('/api/gemini/analyze/stream', async (req, res) => {
  const { base64Image, prompt, mimeType = 'image/jpeg', model } = req.body;
  if (!base64Image || !prompt) {
    return res.status(400).json({ error: 'base64Image y prompt son requeridos.' });
  }
  if (!isAllowed(TEXT_MODELS, model)) {
    return res.status(400).json({ error: 'Modelo no permitido.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const ai = getAI();
    const stream = await ai.models.generateContentStream({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: prompt },
        ],
      },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }
  } catch (error: any) {
    console.error('[POST /api/gemini/analyze/stream]', error?.message);
    res.write(`data: ${JSON.stringify({ error: error?.message ?? 'Error interno' })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});
```

- [ ] **Step 7: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0.

- [ ] **Step 8: Verify the 400 rejection manually against the running server**

Run: `cd D:\copy-of-autoshadow-ai && npm run server:dev` (leave running in a separate terminal)

Then in another terminal:
```bash
curl -s -X POST http://localhost:3001/api/gemini/edit \
  -H "Content-Type: application/json" \
  -d '{"base64Image":"AA==","prompt":"test","model":"not-a-real-model"}'
```
Expected: `{"error":"Modelo no permitido."}` with HTTP 400 (add `-i` to the curl call to see the status line).

Then verify an allowed model passes validation and reaches Gemini (it will fail downstream only if `GEMINI_API_KEY`/image data are invalid, which is fine — we're only confirming it gets past the 400 check):
```bash
curl -s -i -X POST http://localhost:3001/api/gemini/edit \
  -H "Content-Type: application/json" \
  -d '{"base64Image":"AA==","prompt":"test","model":"gemini-2.5-flash-image"}'
```
Expected: NOT a 400 with "Modelo no permitido." (may be a 500 from Gemini rejecting the fake 2-byte image — that's expected and fine; it proves validation passed).

Stop the server (`Ctrl+C` in its terminal) once both checks pass.

- [ ] **Step 9: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add server/index.ts
git commit -m "feat: validate model against catalog in proxy endpoints"
```

---

### Task 4: Per-mode model/imageSize state in `AppContext`

**Files:**
- Modify: `context/AppContext.tsx:1-33` (imports)
- Modify: `context/AppContext.tsx:37-118` (`AppContextValue` interface)
- Modify: `context/AppContext.tsx:158-176` (state block, add new state + localStorage init)
- Modify: `context/AppContext.tsx:604-654` (context value object)

**Interfaces:**
- Consumes: `IMAGE_MODELS`, `TEXT_MODELS`, `DEFAULT_MODEL_BY_MODE`, `isValidModel` from `constants/models.ts` (Task 1).
- Produces: `modelByMode: Record<AppMode, string>`, `setModelForMode(mode: AppMode, modelId: string): void`, `imageSizeByMode: Record<AppMode, ImageSize>` (only `BACKGROUND_EDIT` is read/written by the UI, but the type covers all modes for consistency), `setImageSizeForMode(mode: AppMode, size: ImageSize): void` — added to `AppContextValue` and returned from `useApp()`.

- [ ] **Step 1: Add the import (after the `constants/prompts` import block, around line 33)**

```ts
import { DEFAULT_MODEL_BY_MODE, isValidModel } from '../constants/models';
```

- [ ] **Step 2: Add the two new fields to `AppContextValue`, right after the existing `genImageSize` fields (around line 75)**

```ts
  genImageSize: ImageSize;
  setGenImageSize: (v: ImageSize) => void;
  modelByMode: Record<AppMode, string>;
  setModelForMode: (mode: AppMode, modelId: string) => void;
  imageSizeByMode: Record<AppMode, ImageSize>;
  setImageSizeForMode: (mode: AppMode, size: ImageSize) => void;
```

- [ ] **Step 3: Add state + localStorage-backed initializers, right after the existing `genImageSize` state (around line 161)**

```ts
  const [genImageSize, setGenImageSize] = useState<ImageSize>(ImageSize.SIZE_2K);

  const [modelByMode, setModelByModeState] = useState<Record<AppMode, string>>(() => {
    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem('autoshadow:models') ?? '{}');
      } catch {
        return {};
      }
    })();
    const result = {} as Record<AppMode, string>;
    (Object.values(AppMode) as AppMode[]).forEach(m => {
      const storedValue = stored[m];
      result[m] = storedValue && isValidModel(m, storedValue) ? storedValue : DEFAULT_MODEL_BY_MODE[m];
    });
    return result;
  });

  const setModelForMode = useCallback((targetMode: AppMode, modelId: string) => {
    setModelByModeState(prev => {
      const next = { ...prev, [targetMode]: modelId };
      localStorage.setItem('autoshadow:models', JSON.stringify(next));
      return next;
    });
  }, []);

  const [imageSizeByMode, setImageSizeByModeState] = useState<Record<AppMode, ImageSize>>(() => {
    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem('autoshadow:imageSizes') ?? '{}');
      } catch {
        return {};
      }
    })();
    const result = {} as Record<AppMode, ImageSize>;
    (Object.values(AppMode) as AppMode[]).forEach(m => {
      const storedValue = stored[m];
      const validSizes = Object.values(ImageSize) as string[];
      result[m] = storedValue && validSizes.includes(storedValue) ? storedValue : ImageSize.SIZE_2K;
    });
    return result;
  });

  const setImageSizeForMode = useCallback((targetMode: AppMode, size: ImageSize) => {
    setImageSizeByModeState(prev => {
      const next = { ...prev, [targetMode]: size };
      localStorage.setItem('autoshadow:imageSizes', JSON.stringify(next));
      return next;
    });
  }, []);
```

- [ ] **Step 4: Add both to the context value object, right after `setGenImageSize` (around line 631)**

```ts
    genImageSize,
    setGenImageSize,
    modelByMode,
    setModelForMode,
    imageSizeByMode,
    setImageSizeForMode,
```

- [ ] **Step 5: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add context/AppContext.tsx
git commit -m "feat: add persisted per-mode model/imageSize state to AppContext"
```

---

### Task 5: Wire selected model/imageSize into every service call

**Files:**
- Modify: `context/AppContext.tsx:344-409` (`handleAction` — `EDIT_SHADOW`, `REMOVE_BACKGROUND`, `BACKGROUND_EDIT`, `GENERATE`, `ANALYZE` branches)
- Modify: `context/AppContext.tsx:411-460` (`handleAction` — `BATCH_EDIT_SHADOW` branch + dependency array)
- Modify: `context/AppContext.tsx:464-568` (`retryFailedBatch`, `handleChainedAction`)

**Interfaces:**
- Consumes: `modelByMode`, `imageSizeByMode` from Task 4; `editCarImage`, `composeCarWithBackground`, `generateCarImage`, `analyzeCarImage`, `analyzeCarImageStream` from Task 2 (now accepting `model`/`imageSize`).
- Produces: no new exports — this task only changes call sites so the app actually uses the selected model instead of each function's default.

- [ ] **Step 1: Update the `EDIT_SHADOW` and `REMOVE_BACKGROUND` branches inside `handleAction`**

```ts
        if (mode === AppMode.EDIT_SHADOW) {
          if (!selectedFile) throw new Error('Selecciona una imagen primero.');
          const base64 = await compressImageForAPI(selectedFile);
          const editedImage = await editCarImage(base64, promptToUse, selectedFile.type, modelByMode[AppMode.EDIT_SHADOW]);
          setResultImage(editedImage);
          saveToHistory(editedImage, null, promptToUse, selectedFile.name);

        } else if (mode === AppMode.REMOVE_BACKGROUND) {
          if (!selectedFile) throw new Error('Selecciona una imagen primero.');
          const base64 = await compressImageForAPI(selectedFile);
          const finalPrompt =
            specificPrompt ||
            (removeBgType === 'white' ? PROMPT_REMOVE_BACKGROUND_WHITE : PROMPT_REMOVE_BACKGROUND_TRANSPARENT);
          const editedImage = await editCarImage(base64, finalPrompt, selectedFile.type, modelByMode[AppMode.REMOVE_BACKGROUND]);
          setResultImage(editedImage);
          saveToHistory(editedImage, null, finalPrompt, selectedFile.name);
```

- [ ] **Step 2: Update the `BACKGROUND_EDIT` branch**

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
```

- [ ] **Step 3: Update the `GENERATE` and `ANALYZE` branches**

```ts
        } else if (mode === AppMode.GENERATE) {
          const generated = await generateCarImage(promptToUse, genAspectRatio, genImageSize, modelByMode[AppMode.GENERATE]);
          setResultImage(generated);
          saveToHistory(generated, null, promptToUse);

        } else if (mode === AppMode.ANALYZE) {
          if (!selectedFile) throw new Error('Selecciona una imagen primero.');
          const base64 = await compressImageForAPI(selectedFile);
          const analysisPrompt = promptToUse || 'Analiza este vehículo: marca, modelo estimado, color y características visibles.';

          setResultText('');
          setLoading({ isLoading: false, message: '' });
          let finalText = '';
          try {
            await analyzeCarImageStream(base64, analysisPrompt, selectedFile.type, chunk => {
              finalText += chunk;
              setResultText(prev => (prev ?? '') + chunk);
            }, modelByMode[AppMode.ANALYZE]);
          } catch {
            setLoading({ isLoading: true, message: 'Analizando vehículo...' });
            finalText = await analyzeCarImage(base64, analysisPrompt, selectedFile.type, modelByMode[AppMode.ANALYZE]);
            setResultText(finalText);
          }
          saveToHistory(null, finalText, analysisPrompt, selectedFile.name);
```

- [ ] **Step 4: Update the `BATCH_EDIT_SHADOW` branch and the `handleAction` dependency array**

```ts
        } else if (mode === AppMode.BATCH_EDIT_SHADOW) {
          if (selectedBatchItems.length === 0)
            throw new Error('Selecciona al menos una imagen para el procesamiento por lotes.');

          const total = selectedBatchItems.length;
          let completed = 0;

          setResultBatchItems(
            selectedBatchItems.map(item => ({ ...item, loading: true, resultImage: null, errorMessage: undefined }))
          );
          setLoading({ isLoading: true, message: `Iniciando ${total} imagen${total > 1 ? 'es' : ''}...` });

          await processWithConcurrency<BatchImageItem>(
            selectedBatchItems,
            async item => {
              try {
                const base64 = await compressImageForAPI(item.file);
                const editedImage = await retryWithBackoff(() =>
                  editCarImage(base64, promptToUse, item.file.type, modelByMode[AppMode.BATCH_EDIT_SHADOW])
                );
                completed++;
                setLoading({ isLoading: true, message: `Procesando: ${completed} / ${total} completadas` });
                setResultBatchItems(prev =>
                  prev.map(i => (i.id === item.id ? { ...i, resultImage: editedImage, loading: false } : i))
                );
              } catch (err) {
                completed++;
                console.error(`Error en imagen ${item.file.name}:`, err);
                setLoading({ isLoading: true, message: `Procesando: ${completed} / ${total} completadas` });
                setResultBatchItems(prev =>
                  prev.map(i => (i.id === item.id ? { ...i, loading: false, errorMessage: 'Error al procesar imagen' } : i))
                );
              }
            },
            3
          );
        }
      } catch (error) {
        console.error(error);
        const msg = error instanceof Error ? error.message : String(error);
        alert(`Error: ${msg}`);
      } finally {
        setLoading({ isLoading: false, message: '' });
      }
    },
    [
      mode, prompt, selectedFile, selectedBackgroundFile, backgroundDims, vehicleScale,
      removeBgType, selectedBatchItems, genAspectRatio, genImageSize, saveToHistory,
      modelByMode, imageSizeByMode,
    ]
  );
```

- [ ] **Step 5: Update `retryFailedBatch` to use the batch mode's selected model**

```ts
  const retryFailedBatch = useCallback(async () => {
    const failed = resultBatchItems.filter(i => i.errorMessage);
    if (!failed.length) return;

    setResultBatchItems(prev =>
      prev.map(i => (i.errorMessage ? { ...i, loading: true, errorMessage: undefined } : i))
    );

    const total = failed.length;
    let completed = 0;
    setLoading({ isLoading: true, message: `Reintentando ${total} imagen${total > 1 ? 'es' : ''}…` });

    // Use the last-used prompt from state (PROMPT_A_MIRROR as safe default)
    const retryPrompt = prompt || PROMPT_A_MIRROR;

    await processWithConcurrency<BatchImageItem>(
      failed,
      async item => {
        try {
          const base64 = await compressImageForAPI(item.file);
          const editedImage = await retryWithBackoff(() =>
            editCarImage(base64, retryPrompt, item.file.type, modelByMode[AppMode.BATCH_EDIT_SHADOW])
          );
          completed++;
          setLoading({ isLoading: true, message: `Reintentando: ${completed} / ${total} listas` });
          setResultBatchItems(prev =>
            prev.map(i => (i.id === item.id ? { ...i, resultImage: editedImage, loading: false } : i))
          );
        } catch (err) {
          completed++;
          setResultBatchItems(prev =>
            prev.map(i => (i.id === item.id ? { ...i, loading: false, errorMessage: 'Error al procesar' } : i))
          );
        }
      },
      3
    );
    setLoading({ isLoading: false, message: '' });
  }, [resultBatchItems, prompt, modelByMode]);
```

- [ ] **Step 6: Update `handleChainedAction` — each step uses the model of the mode it represents**

```ts
  const handleChainedAction = useCallback(
    async (flow: 'shadow-mirror' | 'studio-complete') => {
      if (!selectedFile) {
        alert('Selecciona una imagen primero.');
        return;
      }

      setResultImage(null);
      setResultText(null);

      try {
        const base64 = await compressImageForAPI(selectedFile);

        if (flow === 'shadow-mirror') {
          // Step 1: Remove background (white)
          setLoading({ isLoading: true, message: 'Paso 1/2: Removiendo fondo…' });
          const noBg = await editCarImage(base64, PROMPT_REMOVE_BACKGROUND_WHITE, selectedFile.type, modelByMode[AppMode.REMOVE_BACKGROUND]);
          const noBgBase64 = noBg.split(',')[1];

          // Step 2: Add mirror shadow to the clean result
          setLoading({ isLoading: true, message: 'Paso 2/2: Aplicando sombra espejo…' });
          const withShadow = await editCarImage(noBgBase64, PROMPT_A_MIRROR, 'image/png', modelByMode[AppMode.EDIT_SHADOW]);
          setResultImage(withShadow);
          saveToHistory(withShadow, null, 'Flujo: Sin Fondo + Sombra Espejo', selectedFile.name);

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

- [ ] **Step 7: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add context/AppContext.tsx
git commit -m "feat: use per-mode selected model/imageSize in every Gemini call"
```

---

### Task 6: `ModelSelector` component

**Files:**
- Create: `components/ModelSelector.tsx`

**Interfaces:**
- Consumes: `useApp()` for `mode`, `modelByMode`, `setModelForMode`, `imageSizeByMode`, `setImageSizeForMode`; `MODELS_FOR_MODE`, `ModelOption` from `constants/models.ts`; `AppMode`, `ImageSize` from `types.ts`.
- Produces: default-exported `ModelSelector: React.FC` with no props (reads everything from context).

- [ ] **Step 1: Create the component**

```tsx
import React from 'react';
import { AppMode, ImageSize } from '../types';
import { useApp } from '../context/AppContext';
import { MODELS_FOR_MODE, ModelOption } from '../constants/models';

const COST_STYLES: Record<ModelOption['costHint'], string> = {
  low: 'bg-emerald-500/20 text-emerald-400',
  medium: 'bg-amber-500/20 text-amber-400',
  high: 'bg-red-500/20 text-red-400',
};

const ModelSelector: React.FC = () => {
  const { mode, modelByMode, setModelForMode, imageSizeByMode, setImageSizeForMode } = useApp();

  const options = MODELS_FOR_MODE(mode);
  const selected = modelByMode[mode];
  const selectedOption = options.find(o => o.id === selected);
  const showImageSize = mode === AppMode.BACKGROUND_EDIT;

  return (
    <div className="space-y-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Modelo</label>
        {selectedOption && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${COST_STYLES[selectedOption.costHint]}`}>
            {selectedOption.costHint === 'low' ? 'Económico' : selectedOption.costHint === 'medium' ? 'Medio' : 'Alto costo'}
          </span>
        )}
      </div>
      <select
        value={selected}
        onChange={e => setModelForMode(mode, e.target.value)}
        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:ring-blue-500 focus:border-blue-500"
      >
        {options.map(o => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>

      {showImageSize && (
        <div className="space-y-1 pt-1">
          <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Resolución</label>
          <select
            value={imageSizeByMode[mode]}
            onChange={e => setImageSizeForMode(mode, e.target.value as ImageSize)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            {Object.values(ImageSize).map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
```

- [ ] **Step 2: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0 (component isn't mounted anywhere yet, so this only checks it compiles standalone).

- [ ] **Step 3: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add components/ModelSelector.tsx
git commit -m "feat: add ModelSelector component"
```

---

### Task 7: Mount `ModelSelector` in `ControlsPanel`

**Files:**
- Modify: `components/ControlsPanel.tsx:1-51` (imports + destructured context values — no new values needed here, `ModelSelector` reads its own context)
- Modify: `components/ControlsPanel.tsx:231-234` (Settings card header)

**Interfaces:**
- Consumes: `ModelSelector` (default export) from `components/ModelSelector.tsx` (Task 6).
- Produces: nothing new — this is the final wiring task.

- [ ] **Step 1: Import `ModelSelector` (add after the existing `Icons` import on line 5)**

```ts
import ModelSelector from './ModelSelector';
```

- [ ] **Step 2: Render it at the top of the Settings card, right after the "Configuración" heading (replace lines 231-234)**

```tsx
      {/* ── Settings card ── */}
      <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl space-y-4">
        <h2 className="text-lg font-semibold text-white">Configuración</h2>

        <ModelSelector />

```

- [ ] **Step 3: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0.

- [ ] **Step 4: Manual end-to-end verification in the browser**

Run: `cd D:\copy-of-autoshadow-ai && npm run dev` (starts both the Vite client and the proxy server per `package.json`)

In the browser at `http://localhost:3000` (or whatever port Vite prints):
1. Open DevTools → Network tab.
2. For each of the 6 tabs (Editar & Sombras, Remover Fondo, Edición de Fondos, Lotes, Generar, Analizar): confirm the "Modelo" dropdown appears in the Configuración card, with the cost pill next to it.
3. On "Edición de Fondos", confirm the "Resolución" dropdown also appears below the model dropdown.
4. Pick a non-default model in "Editar & Sombras", upload a test image, run the action, and check the `POST /api/gemini/edit` request in the Network tab — its request body's `model` field must match what was selected.
5. Reload the page and confirm the same non-default model is still selected in "Editar & Sombras" (localStorage persistence).
6. Repeat step 4 quickly for "Generar" (check `/api/gemini/generate` body includes both `model` and `imageSize`) and "Analizar" (check `/api/gemini/analyze/stream` body includes `model`).

Stop the dev server (`Ctrl+C`) once all checks pass.

- [ ] **Step 5: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add components/ControlsPanel.tsx
git commit -m "feat: mount ModelSelector in ControlsPanel settings card"
```

---

## Self-Review Notes

- **Spec coverage:** catalog (Task 1) ✓, service layer params (Task 2) ✓, proxy validation (Task 3) ✓, context state + persistence (Task 4) ✓, wiring into every call site incl. chained flows and batch retry (Task 5) ✓, UI component with cost pill + imageSize (Task 6) ✓, mounting in ControlsPanel (Task 7) ✓, manual verification per the spec's Testing section (Task 3 Step 8, Task 7 Step 4) ✓.
- **Placeholder scan:** no TBD/TODO; every step contains complete, runnable code.
- **Type consistency:** `modelByMode`/`setModelForMode`/`imageSizeByMode`/`setImageSizeForMode` names and signatures match between Task 4 (definition) and Tasks 5–6 (consumption). `MODELS_FOR_MODE`/`isValidModel`/`DEFAULT_MODEL_BY_MODE` match between Task 1 (definition) and Tasks 4/6 (consumption).
