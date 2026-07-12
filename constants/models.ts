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
