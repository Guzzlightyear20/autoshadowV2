import { useState, useCallback } from 'react';
import { AppMode } from '../types';

export interface SavedPrompt {
  id: string;
  name: string;
  prompt: string;
  mode: AppMode;
}

const STORAGE_KEY = 'autoshadow-prompt-library';

const loadFromStorage = (): SavedPrompt[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedPrompt[]) : [];
  } catch {
    return [];
  }
};

const saveToStorage = (prompts: SavedPrompt[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
};

export const usePromptLibrary = () => {
  const [prompts, setPrompts] = useState<SavedPrompt[]>(loadFromStorage);

  const add = useCallback((name: string, prompt: string, mode: AppMode) => {
    const entry: SavedPrompt = { id: crypto.randomUUID(), name, prompt, mode };
    setPrompts(prev => {
      const next = [entry, ...prev];
      saveToStorage(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setPrompts(prev => {
      const next = prev.filter(p => p.id !== id);
      saveToStorage(next);
      return next;
    });
  }, []);

  /** Prompts relevant to a given mode. */
  const forMode = useCallback(
    (mode: AppMode) => prompts.filter(p => p.mode === mode),
    [prompts]
  );

  return { prompts, add, remove, forMode };
};
