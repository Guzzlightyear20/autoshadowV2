import { AppMode } from '../types';

export interface ModelOption {
  id: string;
  label: string;
  costHint: 'low' | 'medium' | 'high';
}

// Only models confirmed to work against the live Gemini API are listed here.
// gemini-2.0-flash was removed after the API returned 404 "no longer available".
// gemini-3.1-flash-image-preview was removed after Google shut it down on 2026-06-25
// (GA replacement: gemini-3.1-flash-image). gemini-2.5-flash-image was removed ahead of
// its scheduled 2026-10-02 shutdown, replaced by the gemini-3.1 image family below.
export const IMAGE_MODELS: ModelOption[] = [
  { id: 'gemini-3.1-flash-lite-image', label: 'Gemini 3.1 Flash Lite Image', costHint: 'low' },
  { id: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image', costHint: 'medium' },
  { id: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image', costHint: 'high' },
];

export const TEXT_MODELS: ModelOption[] = [
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', costHint: 'high' },
];

// Matches the behavior hardcoded in services/geminiService.ts and server/index.ts today.
// Keep these in sync if the code's fallback values ever change.
export const DEFAULT_MODEL_BY_MODE: Record<AppMode, string> = {
  [AppMode.EDIT_SHADOW]: 'gemini-3.1-flash-lite-image',
  [AppMode.REMOVE_BACKGROUND]: 'gemini-3.1-flash-lite-image',
  [AppMode.BATCH_EDIT_SHADOW]: 'gemini-3.1-flash-lite-image',
  [AppMode.BACKGROUND_EDIT]: 'gemini-3.1-flash-image',
  [AppMode.GENERATE]: 'gemini-3.1-flash-image',
  [AppMode.ANALYZE]: 'gemini-3.1-pro-preview',
};

export const MODELS_FOR_MODE = (mode: AppMode): ModelOption[] =>
  mode === AppMode.ANALYZE ? TEXT_MODELS : IMAGE_MODELS;

export const isValidModel = (mode: AppMode, modelId: string): boolean =>
  MODELS_FOR_MODE(mode).some(m => m.id === modelId);
