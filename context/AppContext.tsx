import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppMode, AspectRatio, BatchImageItem, ImageSize, LoadingState } from '../types';
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
import { DEFAULT_MODEL_BY_MODE, isValidModel } from '../constants/models';

// ─── context shape ────────────────────────────────────────────────────────────

export interface AppContextValue {
  // mode
  mode: AppMode;
  resetState: (newMode: AppMode) => void;

  // single-image
  selectedFile: File | null;
  previewUrl: string | null;
  originalDims: { w: number; h: number } | null;
  resultImage: string | null;
  resultText: string | null;

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

  // remove-bg
  removeBgType: 'white' | 'transparent';
  setRemoveBgType: (v: 'white' | 'transparent') => void;

  // batch
  selectedBatchItems: BatchImageItem[];
  resultBatchItems: BatchImageItem[];
  hasSuccessfulBatchResults: boolean;

  // settings
  prompt: string;
  setPrompt: (v: string) => void;
  genAspectRatio: AspectRatio;
  setGenAspectRatio: (v: AspectRatio) => void;
  genImageSize: ImageSize;
  setGenImageSize: (v: ImageSize) => void;
  modelByMode: Record<AppMode, string>;
  setModelForMode: (mode: AppMode, modelId: string) => void;
  imageSizeByMode: Record<AppMode, ImageSize>;
  setImageSizeForMode: (mode: AppMode, size: ImageSize) => void;

  // loading
  loading: LoadingState;

  // pwa + key
  installPrompt: any;
  hasKey: boolean;
  handleInstallClick: () => void;
  handleOpenKeyDialog: () => Promise<void>;

  // history signal
  historyRefresh: number;

  // prompt library
  savingPromptName: string;
  setSavingPromptName: (v: string) => void;
  addPrompt: (name: string, prompt: string, mode: AppMode) => void;
  removePrompt: (id: string) => void;
  forMode: (mode: AppMode) => import('../hooks/usePromptLibrary').SavedPrompt[];

  // file refs
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  backgroundFileInputRef: React.RefObject<HTMLInputElement | null>;
  batchFileInputRef: React.RefObject<HTMLInputElement | null>;

  // chained flows + retry
  handleChainedAction: (flow: 'shadow-mirror' | 'studio-complete') => Promise<void>;
  retryFailedBatch: () => Promise<void>;

  // handlers
  handleFileChange: (
    event: React.ChangeEvent<HTMLInputElement>,
    isBatch?: boolean,
    targetInput?: 'car' | 'background'
  ) => void;
  handleRemoveImage: (
    e: React.MouseEvent,
    isBatch?: boolean,
    itemId?: string,
    targetInput?: 'car' | 'background'
  ) => void;
  handleAction: (specificPrompt?: string) => Promise<void>;
}

// ─── context + hook ───────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
};

// ─── provider ─────────────────────────────────────────────────────────────────

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ── mode ──
  const [mode, setMode] = useState<AppMode>(AppMode.EDIT_SHADOW);

  // ── single image ──
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalDims, setOriginalDims] = useState<{ w: number; h: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);

  // ── background template ──
  const [selectedBackgroundFile, setSelectedBackgroundFile] = useState<File | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | null>(null);
  const [backgroundDims, setBackgroundDims] = useState<{ w: number; h: number } | null>(null);
  const [outputWidth, setOutputWidth] = useState(0);
  const [outputHeight, setOutputHeight] = useState(0);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [carCutoutUrl, setCarCutoutUrl] = useState<string | null>(null);
  const [removingBackground, setRemovingBackground] = useState(false);
  const [bgPositionMode, setBgPositionMode] = useState<'center' | 'custom'>('center');
  const [bgMarginPercent, setBgMarginPercent] = useState(12);
  const [bgCustomOffset, setBgCustomOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // ── remove-bg ──
  const [removeBgType, setRemoveBgType] = useState<'white' | 'transparent'>('white');

  // ── batch ──
  const [selectedBatchItems, setSelectedBatchItems] = useState<BatchImageItem[]>([]);
  const [resultBatchItems, setResultBatchItems] = useState<BatchImageItem[]>([]);

  // ── settings ──
  const [prompt, setPrompt] = useState('');
  const [genAspectRatio, setGenAspectRatio] = useState<AspectRatio>(AspectRatio.LANDSCAPE_16_9);
  const [genImageSize, setGenImageSize] = useState<ImageSize>(ImageSize.SIZE_2K);

  const [modelByMode, setModelByModeState] = useState<Record<AppMode, string>>(() => {
    const stored = (() => {
      try {
        const parsed = JSON.parse(localStorage.getItem('autoshadow:models') ?? '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
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
        const parsed = JSON.parse(localStorage.getItem('autoshadow:imageSizes') ?? '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
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

  // ── ui ──
  const [loading, setLoading] = useState<LoadingState>({ isLoading: false, message: '' });
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [hasKey, setHasKey] = useState(true);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  // ── prompt library ──
  const { add: addPrompt, remove: removePrompt, forMode } = usePromptLibrary();
  const [savingPromptName, setSavingPromptName] = useState('');

  // ── refs ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundFileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // ── effects ──

  // API key check (AI Studio)
  useEffect(() => {
    (async () => {
      // @ts-ignore
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        // @ts-ignore
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    })();
  }, []);

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

  const handleInstallClick = useCallback(() => {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.then((result: any) => {
      if (result.outcome === 'accepted') setInstallPrompt(null);
    });
  }, [installPrompt]);

  const handleOpenKeyDialog = useCallback(async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasKey(true);
    }
  }, []);

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
    (
      event: React.ChangeEvent<HTMLInputElement>,
      isBatch = false,
      targetInput: 'car' | 'background' = 'car'
    ) => {
      if (!event.target.files) return;
      const files = Array.from(event.target.files) as File[];

      if (isBatch) {
        const newItems: BatchImageItem[] = [];
        const currentCount = selectedBatchItems.length;
        const MAX = 12;

        for (let i = 0; i < files.length && currentCount + i < MAX; i++) {
          const file = files[i];
          const id = `${file.name}-${Date.now()}-${i}`;
          const url = URL.createObjectURL(file);

          const img = new Image();
          img.onload = () => {
            setSelectedBatchItems(prev =>
              prev.map(item => (item.id === id ? { ...item, originalDims: { w: img.width, h: img.height } } : item))
            );
          };
          img.src = url;

          newItems.push({ id, file, previewUrl: url, originalDims: null, loading: false });
        }
        setSelectedBatchItems(prev => [...prev, ...newItems]);
        setResultBatchItems([]);
      } else {
        const file = files[0];
        if (targetInput === 'car') {
          setSelectedFile(file);
          const url = URL.createObjectURL(file);
          setPreviewUrl(url);
          setResultImage(null);
          setResultText(null);
          const img = new Image();
          img.onload = () => setOriginalDims({ w: img.width, h: img.height });
          img.src = url;
        } else {
          setBackgroundFile(file);
          setSelectedPresetId(null);
        }
      }

      if (event.target) event.target.value = '';
    },
    [selectedBatchItems.length, setBackgroundFile]
  );

  const handleRemoveImage = useCallback(
    (
      e: React.MouseEvent,
      isBatch = false,
      itemId?: string,
      targetInput: 'car' | 'background' = 'car'
    ) => {
      e.stopPropagation();
      if (isBatch && itemId) {
        setSelectedBatchItems(prev => prev.filter(item => item.id !== itemId));
        setResultBatchItems(prev => prev.filter(item => item.id !== itemId));
      } else if (targetInput === 'car') {
        setSelectedFile(null);
        setPreviewUrl(null);
        setOriginalDims(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        setSelectedBackgroundFile(null);
        setBackgroundPreviewUrl(null);
        setSelectedPresetId(null);
        if (backgroundFileInputRef.current) backgroundFileInputRef.current.value = '';
      }
    },
    []
  );

  // ── save to history ──

  const saveToHistory = useCallback(
    async (
      resultImg: string | null,
      resultTxt: string | null,
      promptUsed?: string,
      filename?: string
    ) => {
      if (!resultImg && !resultTxt) return;
      await historyDB.save({
        mode,
        fileName: filename,
        prompt: promptUsed,
        originalImage: previewUrl ?? undefined,
        resultImage: resultImg ?? undefined,
        resultText: resultTxt ?? undefined,
      });
      setHistoryRefresh(n => n + 1);
    },
    [mode, previewUrl]
  );

  // ── main action ──

  const handleAction = useCallback(
    async (specificPrompt?: string) => {
      setLoading({ isLoading: true, message: 'Procesando con Gemini AI...' });
      setResultImage(null);
      setResultText(null);
      setResultBatchItems([]);

      const promptToUse = specificPrompt || prompt;

      try {
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
      mode, prompt, selectedFile, selectedBackgroundFile, backgroundDims, outputWidth, outputHeight,
      carCutoutUrl, bgMarginPercent, bgPositionMode, bgCustomOffset,
      removeBgType, selectedBatchItems, genAspectRatio, genImageSize, saveToHistory,
      modelByMode,
    ]
  );

  // ── retryFailedBatch ──

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

  // ── handleChainedAction ──

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

  // ── resetState ──

  const resetState = useCallback((newMode: AppMode) => {
    setMode(newMode);
    setResultImage(null);
    setResultText(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setOriginalDims(null);
    setSelectedBackgroundFile(null);
    setBackgroundPreviewUrl(null);
    setBackgroundDims(null);
    setOutputWidth(0);
    setOutputHeight(0);
    setSelectedPresetId(null);
    setCarCutoutUrl(null);
    setRemovingBackground(false);
    setBgPositionMode('center');
    setBgMarginPercent(12);
    setBgCustomOffset({ x: 0, y: 0 });
    setSelectedBatchItems([]);
    setResultBatchItems([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (backgroundFileInputRef.current) backgroundFileInputRef.current.value = '';
    if (batchFileInputRef.current) batchFileInputRef.current.value = '';

    if (newMode === AppMode.GENERATE) {
      setPrompt('Un auto deportivo futurista color plata conduciendo bajo la lluvia en una ciudad cyberpunk neon.');
    } else if (newMode === AppMode.ANALYZE) {
      setPrompt('Analiza este vehículo: marca, modelo estimado, y estilo.');
    } else {
      setPrompt('');
    }
    if (newMode === AppMode.REMOVE_BACKGROUND) setRemoveBgType('white');
  }, []);

  // ── derived ──
  const hasSuccessfulBatchResults = resultBatchItems.some(item => item.resultImage);

  // ── context value ──
  const value: AppContextValue = {
    mode,
    resetState,
    selectedFile,
    previewUrl,
    originalDims,
    resultImage,
    resultText,
    selectedBackgroundFile,
    backgroundPreviewUrl,
    backgroundDims,
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
    removeBgType,
    setRemoveBgType,
    selectedBatchItems,
    resultBatchItems,
    hasSuccessfulBatchResults,
    prompt,
    setPrompt,
    genAspectRatio,
    setGenAspectRatio,
    genImageSize,
    setGenImageSize,
    modelByMode,
    setModelForMode,
    imageSizeByMode,
    setImageSizeForMode,
    loading,
    installPrompt,
    hasKey,
    handleInstallClick,
    handleOpenKeyDialog,
    historyRefresh,
    savingPromptName,
    setSavingPromptName,
    addPrompt,
    removePrompt,
    forMode,
    fileInputRef,
    backgroundFileInputRef,
    batchFileInputRef,
    handleFileChange,
    handleRemoveImage,
    handleAction,
    handleChainedAction,
    retryFailedBatch,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
