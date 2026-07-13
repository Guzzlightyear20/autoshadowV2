# Galería de Fondos Predeterminados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick a preset dealer/showroom background from a gallery in "Edición de Fondos" instead of always uploading their own template, while keeping the manual-upload option available.

**Architecture:** Presets are static JPGs in `public/backgrounds/` listed in a small catalog (`constants/backgroundPresets.ts`). Selecting a preset fetches the static file, wraps it in a `File`, and feeds it into the exact same state (`selectedBackgroundFile`/`backgroundPreviewUrl`/`backgroundDims`/`outputWidth`/`outputHeight`) that a manual upload already populates today — so `composeCarWithBackground`, `handleAction`, and `handleChainedAction` need zero changes. A new `BackgroundPresetGallery` component renders the preset thumbnails plus an "upload my own" tile that reuses the existing file input.

**Tech Stack:** React 19 + TypeScript (Vite). No test framework is configured in this repo — `npm run lint` (`tsc --noEmit`) is the only automated check, matching the approach used in the prior model-selector plan for this project.

## Global Constraints

- The 5 preset assets already exist, optimized, at `public/backgrounds/1.jpg` through `public/backgrounds/5.jpg` (110-280 KB each, ≤1920px wide) — do not re-process them.
- `composeCarWithBackground`, `handleAction`, `handleChainedAction`, and the proxy server must NOT change — the whole point of this design is that they stay untouched.
- Selecting a preset must populate `backgroundDims`/`outputWidth`/`outputHeight` exactly as a manual upload does today, so composition output sizing is unaffected.
- Uploading a manual file after selecting a preset must clear the preset highlight (`selectedPresetId` back to `null`); removing the background (existing "Remover plantilla de fondo" button) must do the same.
- Run `npm run lint` (from `D:\copy-of-autoshadow-ai`) after every task — it must pass with zero errors.

---

### Task 1: Background preset catalog

**Files:**
- Create: `constants/backgroundPresets.ts`

**Interfaces:**
- Produces: `BackgroundPreset { id: string; name: string; path: string }`, `BACKGROUND_PRESETS: BackgroundPreset[]`

- [ ] **Step 1: Create the catalog file**

```ts
export interface BackgroundPreset {
  id: string;
  name: string;
  path: string; // served as-is from public/, e.g. '/backgrounds/1.jpg'
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'estudio-blanco', name: 'Estudio Blanco', path: '/backgrounds/1.jpg' },
  { id: 'showroom-calido', name: 'Showroom Cálido', path: '/backgrounds/2.jpg' },
  { id: 'cielo-asfalto', name: 'Cielo y Asfalto', path: '/backgrounds/3.jpg' },
  { id: 'showroom-moderno', name: 'Showroom Moderno', path: '/backgrounds/4.jpg' },
  { id: 'showroom-nocturno', name: 'Showroom Nocturno', path: '/backgrounds/5.jpg' },
];
```

- [ ] **Step 2: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0 (standalone file, no consumers yet).

- [ ] **Step 3: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add constants/backgroundPresets.ts
git commit -m "feat: add background preset catalog"
```

---

### Task 2: Extract `setBackgroundFile` and add preset-selection state to `AppContext`

**Files:**
- Modify: `context/AppContext.tsx:50-59` (`AppContextValue` interface, background template section)
- Modify: `context/AppContext.tsx:148-154` (state block, add `selectedPresetId`)
- Modify: `context/AppContext.tsx:277-338` (`handleFileChange` — extract `setBackgroundFile`, use it, reset preset id)
- Modify: `context/AppContext.tsx:340-363` (`handleRemoveImage` — reset preset id on background removal)
- Modify: `context/AppContext.tsx:633-659` (`resetState` — reset preset id on mode switch)
- Modify: `context/AppContext.tsx:665-716` (context value object)

**Interfaces:**
- Produces: `setBackgroundFile: (file: File) => void`, `selectedPresetId: string | null`, `setSelectedPresetId: (id: string | null) => void` — added to `AppContextValue` and returned from `useApp()`. `setBackgroundFile` applies exactly the same side effects `handleFileChange` already applies to a manually uploaded background file (sets `selectedBackgroundFile`, `backgroundPreviewUrl`, and on image load `backgroundDims`/`outputWidth`/`outputHeight`).

- [ ] **Step 1: Add the three new fields to `AppContextValue`, in the "background template" block (after `setVehicleScale: (v: number) => void;`, around line 59)**

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

- [ ] **Step 2: Add `selectedPresetId` state, right after the existing background template state (after `const [vehicleScale, setVehicleScale] = useState(85);`, around line 154)**

```ts
  const [selectedBackgroundFile, setSelectedBackgroundFile] = useState<File | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | null>(null);
  const [backgroundDims, setBackgroundDims] = useState<{ w: number; h: number } | null>(null);
  const [outputWidth, setOutputWidth] = useState(0);
  const [outputHeight, setOutputHeight] = useState(0);
  const [vehicleScale, setVehicleScale] = useState(85);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
```

- [ ] **Step 3: Add the `setBackgroundFile` function, right before `handleFileChange` (after the `// ── file handlers ──` comment, around line 277)**

```ts
  // ── file handlers ──

  const setBackgroundFile = useCallback((file: File) => {
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
  }, []);

  const handleFileChange = useCallback(
```

- [ ] **Step 4: Replace `handleFileChange`'s background branch to use `setBackgroundFile` and clear the preset id, and add `setBackgroundFile` to its dependency array**

Find this block inside `handleFileChange` (the `else` branch of `if (targetInput === 'car')`):

```ts
        } else {
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
        }
      }

      if (event.target) event.target.value = '';
    },
    [selectedBatchItems.length]
  );
```

Replace it with:

```ts
        } else {
          setBackgroundFile(file);
          setSelectedPresetId(null);
        }
      }

      if (event.target) event.target.value = '';
    },
    [selectedBatchItems.length, setBackgroundFile]
  );
```

- [ ] **Step 5: Replace `handleRemoveImage`'s background branch to also clear the preset id**

Find:

```ts
      } else {
        setSelectedBackgroundFile(null);
        setBackgroundPreviewUrl(null);
        if (backgroundFileInputRef.current) backgroundFileInputRef.current.value = '';
      }
    },
    []
  );
```

Replace with:

```ts
      } else {
        setSelectedBackgroundFile(null);
        setBackgroundPreviewUrl(null);
        setSelectedPresetId(null);
        if (backgroundFileInputRef.current) backgroundFileInputRef.current.value = '';
      }
    },
    []
  );
```

- [ ] **Step 6: Reset the preset id in `resetState`**

Find, inside `resetState`:

```ts
    setSelectedBackgroundFile(null);
    setBackgroundPreviewUrl(null);
    setBackgroundDims(null);
    setOutputWidth(0);
    setOutputHeight(0);
```

Replace with:

```ts
    setSelectedBackgroundFile(null);
    setBackgroundPreviewUrl(null);
    setBackgroundDims(null);
    setOutputWidth(0);
    setOutputHeight(0);
    setSelectedPresetId(null);
```

- [ ] **Step 7: Add the three new fields to the context value object (after `setVehicleScale,` in the value object, around line 681)**

```ts
    setOutputWidth,
    setOutputHeight,
    setVehicleScale,
    setBackgroundFile,
    selectedPresetId,
    setSelectedPresetId,
```

- [ ] **Step 8: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add context/AppContext.tsx
git commit -m "feat: extract setBackgroundFile and add preset-selection state"
```

---

### Task 3: `BackgroundPresetGallery` component

**Files:**
- Create: `components/BackgroundPresetGallery.tsx`

**Interfaces:**
- Consumes: `BACKGROUND_PRESETS`, `BackgroundPreset` from `constants/backgroundPresets.ts` (Task 1); `selectedPresetId`, `setSelectedPresetId`, `setBackgroundFile`, `backgroundPreviewUrl`, `backgroundFileInputRef`, `handleFileChange` from `useApp()` (Task 2); `UploadIcon` from `./Icons` (already used elsewhere in the codebase).
- Produces: default-exported `BackgroundPresetGallery: React.FC` with no props.

- [ ] **Step 1: Create the component**

```tsx
import React from 'react';
import { useApp } from '../context/AppContext';
import { BACKGROUND_PRESETS, BackgroundPreset } from '../constants/backgroundPresets';
import { UploadIcon } from './Icons';

const BackgroundPresetGallery: React.FC = () => {
  const {
    selectedPresetId,
    setSelectedPresetId,
    setBackgroundFile,
    backgroundPreviewUrl,
    backgroundFileInputRef,
    handleFileChange,
  } = useApp();

  const handlePresetClick = async (preset: BackgroundPreset) => {
    try {
      const res = await fetch(preset.path);
      if (!res.ok) throw new Error('No se pudo cargar el fondo.');
      const blob = await res.blob();
      const file = new File([blob], `${preset.id}.jpg`, { type: blob.type });
      setBackgroundFile(file);
      setSelectedPresetId(preset.id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Error: ${msg}`);
    }
  };

  const isCustomActive = selectedPresetId === null && !!backgroundPreviewUrl;

  return (
    <div className="grid grid-cols-3 gap-3">
      {BACKGROUND_PRESETS.map(preset => (
        <button
          key={preset.id}
          type="button"
          onClick={() => handlePresetClick(preset)}
          className={`relative h-24 rounded-xl border-2 bg-cover bg-center transition-colors ${
            selectedPresetId === preset.id
              ? 'border-blue-500'
              : 'border-slate-700 hover:border-blue-500/50'
          }`}
          style={{ backgroundImage: `url(${preset.path})` }}
          title={preset.name}
        >
          {selectedPresetId === preset.id && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          )}
          <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded-b-xl truncate">
            {preset.name}
          </span>
        </button>
      ))}

      <div
        onClick={() => backgroundFileInputRef.current?.click()}
        className={`relative h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer bg-cover bg-center transition-colors ${
          isCustomActive ? 'border-blue-500 bg-slate-800/50' : 'border-slate-700 hover:border-blue-500/50'
        }`}
        style={isCustomActive ? { backgroundImage: `url(${backgroundPreviewUrl})` } : {}}
      >
        {!isCustomActive && (
          <>
            <UploadIcon />
            <span className="text-[10px] text-slate-400 font-medium text-center px-1 mt-1">Subir la mía</span>
          </>
        )}
        <input
          type="file"
          ref={backgroundFileInputRef}
          className="hidden"
          accept="image/*"
          onChange={e => handleFileChange(e, false, 'background')}
        />
      </div>
    </div>
  );
};

export default BackgroundPresetGallery;
```

- [ ] **Step 2: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add components/BackgroundPresetGallery.tsx
git commit -m "feat: add BackgroundPresetGallery component"
```

---

### Task 4: Mount the gallery in `ControlsPanel`

**Files:**
- Modify: `components/ControlsPanel.tsx:1-52` (imports + destructured context values)
- Modify: `components/ControlsPanel.tsx:135-176` (Background template card)

**Interfaces:**
- Consumes: `BackgroundPresetGallery` (default export) from `components/BackgroundPresetGallery.tsx` (Task 3).
- Produces: nothing new — final wiring task.

- [ ] **Step 1: Import the gallery (add after the existing `ModelSelector` import, around line 6)**

```ts
import ModelSelector from './ModelSelector';
import BackgroundPresetGallery from './BackgroundPresetGallery';
```

- [ ] **Step 2: Remove `backgroundFileInputRef` from the destructured context values (it moves entirely into `BackgroundPresetGallery`; it is not used anywhere else in this file)**

Find, in the `useApp()` destructure at the top of the component:

```ts
    fileInputRef,
    backgroundFileInputRef,
    batchFileInputRef,
```

Replace with:

```ts
    fileInputRef,
    batchFileInputRef,
```

- [ ] **Step 3: Replace the "Background template upload" card (lines 135-176) with the gallery**

Find:

```tsx
      {/* ── Background template upload ── */}
      {mode === AppMode.BACKGROUND_EDIT && (
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-4">Plantilla de Fondo (Estudio)</h2>
          <div
            className={`border-2 border-dashed rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              backgroundPreviewUrl
                ? 'border-slate-600 bg-slate-800/50'
                : 'border-slate-700 hover:border-blue-500 hover:bg-slate-800/50'
            }`}
            onClick={() => backgroundFileInputRef.current?.click()}
            style={
              backgroundPreviewUrl
                ? { backgroundImage: `url(${backgroundPreviewUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : {}
            }
          >
            {!backgroundPreviewUrl && (
              <>
                <UploadIcon />
                <p className="text-sm text-slate-400 font-medium">Click para subir plantilla</p>
                <p className="text-xs text-slate-500 mt-1">JPG, PNG</p>
              </>
            )}
            <input
              type="file"
              ref={backgroundFileInputRef}
              className="hidden"
              accept="image/*"
              onChange={e => handleFileChange(e, false, 'background')}
            />
          </div>
          {backgroundPreviewUrl && (
            <button
              onClick={e => handleRemoveImage(e, false, undefined, 'background')}
              className="text-xs text-red-400 mt-2 hover:text-red-300 underline"
            >
              Remover plantilla de fondo
            </button>
          )}
        </div>
      )}
```

Replace with:

```tsx
      {/* ── Background template gallery ── */}
      {mode === AppMode.BACKGROUND_EDIT && (
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-4">Plantilla de Fondo (Estudio)</h2>
          <BackgroundPresetGallery />
          {backgroundPreviewUrl && (
            <button
              onClick={e => handleRemoveImage(e, false, undefined, 'background')}
              className="text-xs text-red-400 mt-2 hover:text-red-300 underline"
            >
              Remover plantilla de fondo
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 4: Verify with typecheck**

Run: `cd D:\copy-of-autoshadow-ai && npm run lint`
Expected: exits 0.

- [ ] **Step 5: Manual end-to-end verification in the browser**

Run: `cd D:\copy-of-autoshadow-ai && npm run dev`

In the browser:
1. Go to "Edición de Fondos". Confirm the card shows a 3-column grid: 5 preset thumbnails (showing the actual images, with their names in a label at the bottom) plus a 6th dashed "Subir la mía" tile.
2. Upload a car photo, then click a preset thumbnail. Confirm: the thumbnail gets a blue highlighted border + dot, the "Remover plantilla de fondo" link appears below the grid, and clicking "Aplicar Edición" produces a composed result (network tab: the request to `/api/gemini/compose`, or the direct Gemini call, includes image data — no errors from the gallery's own fetch).
3. Click "Subir la mía", upload your own image file. Confirm the preset highlight disappears, the upload tile now shows your image as its background, and composing still works.
4. Click a preset again, then click "Remover plantilla de fondo". Confirm the grid returns to its unselected state (no tile highlighted, upload tile shows the icon again).
5. Switch to a different mode tab and back to "Edición de Fondos" — confirm the gallery resets (no preset/background carried over from a previous session in this same page load), matching `resetState`'s existing reset behavior for this mode.

Stop the dev server (`Ctrl+C`) once all checks pass.

- [ ] **Step 6: Commit**

```bash
cd D:\copy-of-autoshadow-ai
git add components/ControlsPanel.tsx
git commit -m "feat: replace background upload box with preset gallery in ControlsPanel"
```

---

## Self-Review Notes

- **Spec coverage:** catalog with the 5 real assets (Task 1) ✓, `setBackgroundFile` extraction + preset state + resets on upload/remove/mode-switch (Task 2) ✓, gallery component with cost-free reuse of existing pipeline + error handling (Task 3) ✓, mounting + cleanup of now-unused `backgroundFileInputRef` destructure in `ControlsPanel` (Task 4) ✓, manual E2E verification covering preset selection, custom upload override, removal, and mode-switch reset (Task 4 Step 5) ✓.
- **Placeholder scan:** no TBD/TODO; every step contains complete, runnable code.
- **Type consistency:** `setBackgroundFile`, `selectedPresetId`, `setSelectedPresetId` names and signatures match between Task 2 (definition) and Task 3 (consumption). `BACKGROUND_PRESETS`/`BackgroundPreset` match between Task 1 (definition) and Task 3 (consumption).
