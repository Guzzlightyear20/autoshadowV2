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
  vehicleScale: number;
  setOutputWidth: (v: number) => void;
  setOutputHeight: (v: number) => void;
  setVehicleScale: (v: number) => void;

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
  const [vehicleScale, setVehicleScale] = useState(85);

  // ── remove-bg ──
  const [removeBgType, setRemoveBgType] = useState<'white' | 'transparent'>('white');

  // ── batch ──
  const [selectedBatchItems, setSelectedBatchItems] = useState<BatchImageItem[]>([]);
  const [resultBatchItems, setResultBatchItems] = useState<BatchImageItem[]>([]);

  // ── settings ──
  const [prompt, setPrompt] = useState('');
  const [genAspectRatio, setGenAspectRatio] = useState<AspectRatio>(AspectRatio.LANDSCAPE_16_9);
  const [genImageSize, setGenImageSize] = useState<ImageSize>(ImageSize.SIZE_2K);

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
          const editedImage = await editCarImage(base64, promptToUse, selectedFile.type);
          setResultImage(editedImage);
          saveToHistory(editedImage, null, promptToUse, selectedFile.name);

        } else if (mode === AppMode.REMOVE_BACKGROUND) {
          if (!selectedFile) throw new Error('Selecciona una imagen primero.');
          const base64 = await compressImageForAPI(selectedFile);
          const finalPrompt =
            specificPrompt ||
            (removeBgType === 'white' ? PROMPT_REMOVE_BACKGROUND_WHITE : PROMPT_REMOVE_BACKGROUND_TRANSPARENT);
          const editedImage = await editCarImage(base64, finalPrompt, selectedFile.type);
          setResultImage(editedImage);
          saveToHistory(editedImage, null, finalPrompt, selectedFile.name);

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
            dynamicPrompt
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
          const generated = await generateCarImage(promptToUse, genAspectRatio, genImageSize);
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
            });
          } catch {
            setLoading({ isLoading: true, message: 'Analizando vehículo...' });
            finalText = await analyzeCarImage(base64, analysisPrompt, selectedFile.type);
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
                  editCarImage(base64, promptToUse, item.file.type)
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
            editCarImage(base64, retryPrompt, item.file.type)
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
  }, [resultBatchItems, prompt]);

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
          const noBg = await editCarImage(base64, PROMPT_REMOVE_BACKGROUND_WHITE, selectedFile.type);
          const noBgBase64 = noBg.split(',')[1];

          // Step 2: Add mirror shadow to the clean result
          setLoading({ isLoading: true, message: 'Paso 2/2: Aplicando sombra espejo…' });
          const withShadow = await editCarImage(noBgBase64, PROMPT_A_MIRROR, 'image/png');
          setResultImage(withShadow);
          saveToHistory(withShadow, null, 'Flujo: Sin Fondo + Sombra Espejo', selectedFile.name);

        } else if (flow === 'studio-complete') {
          if (!selectedBackgroundFile) {
            alert('Para "Estudio Completo" necesitas subir también la plantilla de fondo.');
            return;
          }

          // Step 1: Remove background
          setLoading({ isLoading: true, message: 'Paso 1/2: Removiendo fondo del auto…' });
          const noBg = await editCarImage(base64, PROMPT_REMOVE_BACKGROUND_WHITE, selectedFile.type);
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
            dynamicPrompt
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
    [selectedFile, selectedBackgroundFile, vehicleScale, backgroundDims, saveToHistory]
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
    vehicleScale,
    setOutputWidth,
    setOutputHeight,
    setVehicleScale,
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
