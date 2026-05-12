import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AppMode, AspectRatio, ImageSize, LoadingState, BatchImageItem } from './types';
import { editCarImage, generateCarImage, analyzeCarImage, analyzeCarImageStream, composeCarWithBackground } from './services/geminiService';
import { fileToBase64, downloadResizedImage, downloadAllBatchImages, resizeBase64Image, processWithConcurrency } from './utils';
import { Button } from './components/Button';
import BeforeAfterSlider from './components/BeforeAfterSlider';
import HistoryPanel from './components/HistoryPanel';
import { historyDB } from './hooks/useImageHistory';
import { usePromptLibrary } from './hooks/usePromptLibrary';

// Icons as simple SVGs
const UploadIcon = () => (
  <svg className="w-8 h-8 mb-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
);
const CarIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 19H5V8h14m-3-5v2.206l-1.6 2.4h-6.8L6 5.206V3h12zM7 15a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4z" /></svg>
);
const SparkIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 3.214L13 21l-2.286-6.857L5 12l5.714-3.214z" /></svg>
);
const CloseIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
);
const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
);
const ScissorsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
);

// Prompts for Shadow Editing
const PROMPT_A_MIRROR = "The vehicle pictured in the source image now rests on a highly polished, glossy white studio floor. Below the vehicle is a realistic, soft contact shadow, darkest and sharpest immediately under the tires and lower chassis to anchor it to the ground, and diffusing gently outwards. Furthermore, there are sharp, realistic reflections of the vehicle's body and wheels visible on the glossy surface. All other elements from the original source image, including the entire background environment, original lighting, and any text or graphics present in the frame, remain unchanged.";

const PROMPT_B_DARK = "Based strictly on image, the vehicle pictured now casts a realistic, soft contact shadow on the surface directly beneath it. This shadow is darkest immediately under the tires and chassis to anchor the car to the ground, and fades gently outwards. All other elements of image, including the vehicle's specific appearance, the entire background environment, original lighting, reflections, and any text or graphics present in the frame, remain absolutely identical to the original source image.";

const PROMPT_C_BACKGROUND = `TRIGGER: "Edición de Fondos" (BACKGROUND EDIT)
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

const PROMPT_REMOVE_BACKGROUND_WHITE = `Actúa como un retocador fotográfico automotriz de alta gama. Tu objetivo es procesar la imagen adjunta del vehículo para adaptarla a un estándar de exhibición de estudio profesional. Ejecuta las siguientes instrucciones con precisión:

1. EXTRACCIÓN Y FONDO:
- Recorta el vehículo aislando perfectamente todos los bordes (carrocería, neumáticos, espejos).
- Elimina el fondo original por completo y reemplázalo por un fondo blanco puro (#FFFFFF).
- Genera una sombra de contacto suave, difuminada y realista debajo del vehículo para integrarlo al nuevo fondo y evitar que parezca "flotando".

2. NEUTRALIZACIÓN DE REFLEJOS (DE-REFLECTION):
- Identifica y elimina todos los reflejos del entorno exterior presentes en la carrocería (árboles, cielo, postes, asfalto, transeúntes u otros vehículos).
- Reemplaza los reflejos ambientales eliminados con gradientes suaves y lineales, simulando la iluminación controlada de grandes cajas de luz (softboxes) típicas de un estudio automotriz o un ciclorama cerrado.

3. PRESERVACIÓN ESTRICTA DEL COLOR:
- [RESTRICCIÓN CRÍTICA]: El tono, la saturación y la luminosidad de la pintura original deben permanecer absolutamente inalterados. La limpieza de reflejos no debe cambiar el código de color base de la pintura bajo ninguna circunstancia.

4. CRISTALES Y METALES:
- Limpia los cristales (parabrisas y ventanas) de reflejos parasitarios del exterior, manteniendo el nivel de tinte polarizado original y la transparencia estructural.
- Suaviza los contrastes duros en las piezas cromadas, parrilla frontal y llantas de aleación, adaptando su brillo a la nueva iluminación neutra de estudio.`;

const PROMPT_REMOVE_BACKGROUND_TRANSPARENT = `TASK: Background Removal (Transparent)
INSTRUCTIONS: 
1) Completely isolate the subject (the vehicle) from its original background. 
2) The resulting image MUST have a transparent background (alpha channel). 
3) CRITICAL: Do NOT modify the subject in any way. Keep the original colors, size, texture, and details pixel-perfectly consistent with the source image.
4) Output ONLY the subject on transparency. No background pixels allowed.`;

const PROMPT_REMOVE_BACKGROUND_INTERIOR = `A precise, high-definition professional studio photograph of the entire, exact car interior cabin derived from image_#.*.*, with the fundamental and non-negotiable instruction that absolutely nothing within the cabin is altered. This includes the retention, unaltered in color, shape, and specific location, of all individual features: the tan-colored leather seats, the unique front seat headrest designs with their black supports, the complete rear-seat bench, all seat belts and buckles, the central rear console with its specific touch screen interface (including all icons and graphics), the air vents, all window switches, and every specific textured trim piece and metallic accent. The sole and only modification is the precise, surgical removal of all exterior elements (buildings, trees, sky) visible through all glass surfaces (windshield, all side windows, rear window, and the entire panoramic sunroof structure). The removed background must be replaced by a flawless, seamless, pure, neutral, high-key studio white background, creating a zero-distraction void while preserving museum-quality fidelity of the interior. The cutouts around complex edges, especially the headrest structures and window frames, are surgically sharp with no original background bleed. Internal lighting is adjusted to be even and soft, consistent with a pure white studio surround, while strictly maintaining the true colors of all internal materials. Nothing is added, removed, or changed within the cabin. All buttons, features, and textures are preserved as in image_#.*.*`;

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.EDIT_SHADOW);
  // Single image states (for EDIT_SHADOW, BACKGROUND_EDIT, GENERATE, ANALYZE modes)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalDims, setOriginalDims] = useState<{w: number, h: number} | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // New states for background template
  const [selectedBackgroundFile, setSelectedBackgroundFile] = useState<File | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | null>(null);
  const [backgroundDims, setBackgroundDims] = useState<{w: number, h: number} | null>(null);
  const [outputWidth, setOutputWidth] = useState<number>(0);
  const [outputHeight, setOutputHeight] = useState<number>(0);
  const [vehicleScale, setVehicleScale] = useState<number>(85);
  const [removeBgType, setRemoveBgType] = useState<'white' | 'transparent'>('white');
  
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);

  // Batch image states (for BATCH_EDIT_SHADOW mode)
  const [selectedBatchItems, setSelectedBatchItems] = useState<BatchImageItem[]>([]);
  const [resultBatchItems, setResultBatchItems] = useState<BatchImageItem[]>([]);
  
  // Settings
  const [prompt, setPrompt] = useState<string>(""); // Used for BACKGROUND_EDIT, GENERATE and ANALYZE
  const [genAspectRatio, setGenAspectRatio] = useState<AspectRatio>(AspectRatio.LANDSCAPE_16_9);
  const [genImageSize, setGenImageSize] = useState<ImageSize>(ImageSize.SIZE_2K);

  const [loading, setLoading] = useState<LoadingState>({ isLoading: false, message: '' });
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [hasKey, setHasKey] = useState<boolean>(true);

  // History: increment to trigger HistoryPanel reload after each new save
  const [historyRefresh, setHistoryRefresh] = useState(0);

  // Prompt library
  const { add: addPrompt, remove: removePrompt, forMode } = usePromptLibrary();
  const [savingPromptName, setSavingPromptName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundFileInputRef = useRef<HTMLInputElement>(null); // New ref for background file input
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // Handle API Key Selection for high-quality models
  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        // @ts-ignore
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleOpenKeyDialog = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasKey(true); // Assume success and proceed
    }
  };

  // Handle PWA Install Prompt
  useEffect(() => {
    const handler = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = () => {
    if (!installPrompt) return;
    
    // Show the install prompt
    installPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    installPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
        setInstallPrompt(null);
      } else {
        console.log('User dismissed the install prompt');
      }
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, isBatch: boolean = false, targetInput: 'car' | 'background' = 'car') => {
    if (!event.target.files) return;

    const files = Array.from(event.target.files) as File[];
    
    if (isBatch) {
      const newItems: BatchImageItem[] = [];
      const currentCount = selectedBatchItems.length;
      const maxBatchSize = 12;

      for (let i = 0; i < files.length && currentCount + i < maxBatchSize; i++) {
        const file = files[i];
        const id = `${file.name}-${Date.now()}-${i}`;
        const url = URL.createObjectURL(file);
        
        const img = new Image();
        img.onload = () => {
          setSelectedBatchItems(prev => prev.map(item => 
            item.id === id ? { ...item, originalDims: { w: img.width, h: img.height } } : item
          ));
        };
        img.src = url;

        newItems.push({ id, file, previewUrl: url, originalDims: null, loading: false });
      }
      setSelectedBatchItems(prev => [...prev, ...newItems]);
      setResultBatchItems([]); // Clear previous batch results
    } else {
      const file = files[0];
      if (targetInput === 'car') {
        setSelectedFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        setResultImage(null);
        setResultText(null);

        const img = new Image();
        img.onload = () => {
          setOriginalDims({ w: img.width, h: img.height });
        };
        img.src = url;
      } else if (targetInput === 'background') {
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
    // Clear the input value so the same file can be selected again
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleRemoveImage = useCallback((e: React.MouseEvent, isBatch: boolean = false, itemId?: string, targetInput: 'car' | 'background' = 'car') => {
    e.stopPropagation();
    if (isBatch && itemId) {
      setSelectedBatchItems(prev => prev.filter(item => item.id !== itemId));
      setResultBatchItems(prev => prev.filter(item => item.id !== itemId));
    } else {
      if (targetInput === 'car') {
        setSelectedFile(null);
        setPreviewUrl(null);
        setOriginalDims(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else if (targetInput === 'background') {
        setSelectedBackgroundFile(null);
        setBackgroundPreviewUrl(null);
        if (backgroundFileInputRef.current) backgroundFileInputRef.current.value = '';
      }
    }
  }, []);

  const handleAction = async (specificPrompt?: string) => {
    setLoading({ isLoading: true, message: 'Procesando con Gemini AI...' });
    setResultImage(null);
    setResultText(null);
    setResultBatchItems([]); // Clear batch results before new processing

    const promptToUse = specificPrompt || prompt;

    try {
      if (mode === AppMode.EDIT_SHADOW) {
        if (!selectedFile) throw new Error("Selecciona una imagen primero.");
        const base64 = await fileToBase64(selectedFile);
        const editedImage = await editCarImage(base64, promptToUse, selectedFile.type);
        setResultImage(editedImage);
        saveToHistory(editedImage, null, promptToUse, selectedFile.name);
      } else if (mode === AppMode.REMOVE_BACKGROUND) {
        if (!selectedFile) throw new Error("Selecciona una imagen primero.");
        const base64 = await fileToBase64(selectedFile);
        const finalPrompt = specificPrompt || (removeBgType === 'white' ? PROMPT_REMOVE_BACKGROUND_WHITE : PROMPT_REMOVE_BACKGROUND_TRANSPARENT);
        const editedImage = await editCarImage(base64, finalPrompt, selectedFile.type);
        setResultImage(editedImage);
        saveToHistory(editedImage, null, finalPrompt, selectedFile.name);
      } else if (mode === AppMode.BACKGROUND_EDIT) {
        if (!selectedFile || !selectedBackgroundFile) throw new Error("Por favor, sube ambas imágenes: la del auto y la plantilla de fondo.");
        const carBase64 = await fileToBase64(selectedFile);
        const backgroundBase64 = await fileToBase64(selectedBackgroundFile);

        // Inject vehicle scale into the prompt
        const dynamicPrompt = PROMPT_C_BACKGROUND.replace(
          "5) SCALING: Scale the car to occupy 85-90% of the width of the background",
          `5) SCALING: Scale the car to occupy exactly ${vehicleScale}% of the width of the background`
        );

        const composedImage = await composeCarWithBackground(
          carBase64,
          selectedFile.type,
          backgroundBase64,
          selectedBackgroundFile.type,
          dynamicPrompt
        );

        // Ensure the result matches the background template dimensions
        if (backgroundDims) {
          const resizedResult = await resizeBase64Image(composedImage, backgroundDims.w, backgroundDims.h);
          setResultImage(resizedResult);
          saveToHistory(resizedResult, null, dynamicPrompt, selectedFile.name);
        } else {
          setResultImage(composedImage);
          saveToHistory(composedImage, null, dynamicPrompt, selectedFile.name);
        }
      } else if (mode === AppMode.GENERATE) {
        const generated = await generateCarImage(promptToUse, genAspectRatio, genImageSize);
        setResultImage(generated);
        saveToHistory(generated, null, promptToUse);
      } else if (mode === AppMode.ANALYZE) {
        if (!selectedFile) throw new Error("Selecciona una imagen primero.");
        const base64 = await fileToBase64(selectedFile);
        const analysisPrompt = promptToUse || "Analiza este vehículo: marca, modelo estimado, color y características visibles.";

        // Show streaming text word-by-word; fall back to single-shot on error
        setResultText('');
        setLoading({ isLoading: false, message: '' }); // release the overlay — text appears live
        let finalText = '';
        try {
          await analyzeCarImageStream(base64, analysisPrompt, selectedFile.type, (chunk) => {
            finalText += chunk;
            setResultText(prev => (prev ?? '') + chunk);
          });
        } catch {
          // Streaming failed — fall back to single-shot
          setLoading({ isLoading: true, message: 'Analizando vehículo...' });
          finalText = await analyzeCarImage(base64, analysisPrompt, selectedFile.type);
          setResultText(finalText);
        }
        saveToHistory(null, finalText, analysisPrompt, selectedFile.name);
      } else if (mode === AppMode.BATCH_EDIT_SHADOW) {
        if (selectedBatchItems.length === 0) throw new Error("Selecciona al menos una imagen para el procesamiento por lotes.");

        const total = selectedBatchItems.length;
        let completed = 0;

        // Show all items as queued immediately so the grid appears before processing starts
        setResultBatchItems(selectedBatchItems.map(item => ({
          ...item, loading: true, resultImage: null, errorMessage: undefined,
        })));
        setLoading({ isLoading: true, message: `Iniciando ${total} imagen${total > 1 ? 'es' : ''}...` });

        // Process up to 3 images concurrently — respects Gemini rate limits
        await processWithConcurrency<BatchImageItem>(
          selectedBatchItems,
          async (item) => {
            try {
              const base64 = await fileToBase64(item.file);
              const editedImage = await editCarImage(base64, promptToUse, item.file.type);
              completed++;
              setLoading({ isLoading: true, message: `Procesando: ${completed} / ${total} completadas` });
              setResultBatchItems(prev => prev.map(i =>
                i.id === item.id ? { ...i, resultImage: editedImage, loading: false } : i
              ));
            } catch (error) {
              completed++;
              console.error(`Error en imagen ${item.file.name}:`, error);
              setLoading({ isLoading: true, message: `Procesando: ${completed} / ${total} completadas` });
              setResultBatchItems(prev => prev.map(i =>
                i.id === item.id ? { ...i, loading: false, errorMessage: 'Error al procesar imagen' } : i
              ));
            }
          },
          3 // max concurrency
        );
      }
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Error: ${msg}`);
    } finally {
      setLoading({ isLoading: false, message: '' });
    }
  };

  /** Save a single result to IndexedDB history and signal HistoryPanel to reload. */
  const saveToHistory = async (
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
  };

  const resetState = useCallback((newMode: AppMode) => {
    setMode(newMode);
    setResultImage(null);
    setResultText(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setOriginalDims(null);
    setSelectedBackgroundFile(null); // Clear background file
    setBackgroundPreviewUrl(null); // Clear background preview
    setBackgroundDims(null); // Clear background dimensions
    setOutputWidth(0);
    setOutputHeight(0);
    setSelectedBatchItems([]);
    setResultBatchItems([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (backgroundFileInputRef.current) backgroundFileInputRef.current.value = ''; // Clear background input
    if (batchFileInputRef.current) batchFileInputRef.current.value = '';
    
    // Set default prompts based on mode
    if (newMode === AppMode.GENERATE) {
      setPrompt("Un auto deportivo futurista color plata conduciendo bajo la lluvia en una ciudad cyberpunk neon.");
    } else if (newMode === AppMode.ANALYZE) {
      setPrompt("Analiza este vehículo: marca, modelo estimado, y estilo.");
    } else if (newMode === AppMode.BACKGROUND_EDIT) {
      setPrompt(""); // Set to empty string as prompt field is hidden
    } else if (newMode === AppMode.REMOVE_BACKGROUND) {
      setPrompt("");
      setRemoveBgType('white');
    }
    else {
      setPrompt(""); // Clear prompt for modes that use buttons or no prompt
    }
  }, []); // Empty dependency array means this function is created once

  const hasSuccessfulBatchResults = resultBatchItems.some(item => item.resultImage);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <CarIcon />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
              AutoShadow AI
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {!hasKey && (
              <button
                onClick={handleOpenKeyDialog}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-full shadow-lg animate-pulse"
              >
                <SparkIcon />
                Activar Modelos Pro
              </button>
            )}
            {installPrompt && (
              <button
                onClick={handleInstallClick}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-full border border-slate-700 transition-colors"
              >
                <DownloadIcon />
                Instalar App
              </button>
            )}
            <div className="text-xs text-slate-500 font-mono hidden sm:block">
              Powered by Gemini 2.5 & 3.0
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 p-1 bg-slate-900/80 rounded-xl border border-slate-800 w-full md:w-fit">
          <button
            onClick={() => resetState(AppMode.EDIT_SHADOW)}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === AppMode.EDIT_SHADOW ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            Editar & Sombras
          </button>
          <button
            onClick={() => resetState(AppMode.REMOVE_BACKGROUND)}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === AppMode.REMOVE_BACKGROUND ? 'bg-red-600 text-white shadow-lg shadow-red-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            Remover Fondo
          </button>
          <button
            onClick={() => resetState(AppMode.BACKGROUND_EDIT)}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === AppMode.BACKGROUND_EDIT ? 'bg-green-600 text-white shadow-lg shadow-green-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            Edición de Fondos
          </button>
          <button
            onClick={() => resetState(AppMode.BATCH_EDIT_SHADOW)}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === AppMode.BATCH_EDIT_SHADOW ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            Lotes
          </button>
          <button
            onClick={() => resetState(AppMode.GENERATE)}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === AppMode.GENERATE ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            Generar Nuevo
          </button>
          <button
            onClick={() => resetState(AppMode.ANALYZE)}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === AppMode.ANALYZE ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            Analizar
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Controls Column */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Image Upload Area (for single image modes) */}
            {(mode === AppMode.EDIT_SHADOW || mode === AppMode.ANALYZE || mode === AppMode.BACKGROUND_EDIT || mode === AppMode.REMOVE_BACKGROUND) && (
              <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                <h2 className="text-lg font-semibold text-white mb-4">Imagen Original (Auto)</h2>
                <div 
                  className={`border-2 border-dashed rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer transition-colors ${previewUrl ? 'border-slate-600 bg-slate-800/50' : 'border-slate-700 hover:border-blue-500 hover:bg-slate-800/50'}`}
                  onClick={() => fileInputRef.current?.click()}
                  style={previewUrl ? { backgroundImage: `url(${previewUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
                >
                  {!previewUrl && (
                    <>
                      <UploadIcon />
                      <p className="text-sm text-slate-400 font-medium">Click para subir auto</p>
                      <p className="text-xs text-slate-500 mt-1">JPG, PNG</p>
                    </>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={(e) => handleFileChange(e, false, 'car')} 
                  />
                </div>
                {previewUrl && (
                  <button 
                    onClick={(e) => handleRemoveImage(e, false, undefined, 'car')}
                    className="text-xs text-red-400 mt-2 hover:text-red-300 underline"
                  >
                    Remover imagen de auto
                  </button>
                )}
                {originalDims && (
                  <p className="text-xs text-slate-600 mt-2 text-center">
                    Dimensiones: {originalDims.w} x {originalDims.h} px
                  </p>
                )}
              </div>
            )}

            {/* Background Template Upload Area (only for BACKGROUND_EDIT mode) */}
            {mode === AppMode.BACKGROUND_EDIT && (
              <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                <h2 className="text-lg font-semibold text-white mb-4">Plantilla de Fondo (Estudio)</h2>
                <div 
                  className={`border-2 border-dashed rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer transition-colors ${backgroundPreviewUrl ? 'border-slate-600 bg-slate-800/50' : 'border-slate-700 hover:border-blue-500 hover:bg-slate-800/50'}`}
                  onClick={() => backgroundFileInputRef.current?.click()}
                  style={backgroundPreviewUrl ? { backgroundImage: `url(${backgroundPreviewUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
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
                    onChange={(e) => handleFileChange(e, false, 'background')} 
                  />
                </div>
                {backgroundPreviewUrl && (
                  <button 
                    onClick={(e) => handleRemoveImage(e, false, undefined, 'background')}
                    className="text-xs text-red-400 mt-2 hover:text-red-300 underline"
                  >
                    Remover plantilla de fondo
                  </button>
                )}
              </div>
            )}

            {/* Batch Image Upload Area */}
            {mode === AppMode.BATCH_EDIT_SHADOW && (
              <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                <h2 className="text-lg font-semibold text-white mb-4">Imágenes Originales (Lotes)</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {selectedBatchItems.map(item => (
                    <div key={item.id} className="relative w-full h-32 rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden group">
                      <img src={item.previewUrl} alt="Preview" className="w-full h-full object-cover" />
                      <button 
                        onClick={(e) => handleRemoveImage(e, true, item.id)}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remover imagen"
                      >
                        <CloseIcon />
                      </button>
                      {item.originalDims && (
                        <p className="absolute bottom-1 left-1 text-white text-[10px] bg-black/50 px-1 rounded">
                          {item.originalDims.w}x{item.originalDims.h}
                        </p>
                      )}
                    </div>
                  ))}
                  {selectedBatchItems.length < 12 && (
                    <div
                      className="border-2 border-dashed rounded-xl h-32 flex flex-col items-center justify-center cursor-pointer transition-colors border-slate-700 hover:border-blue-500 hover:bg-slate-800/50"
                      onClick={() => batchFileInputRef.current?.click()}
                    >
                      <UploadIcon />
                      <p className="text-sm text-slate-400 font-medium">Agregar ({12 - selectedBatchItems.length})</p>
                      <input 
                        type="file" 
                        ref={batchFileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        multiple
                        onChange={(e) => handleFileChange(e, true)} 
                      />
                    </div>
                  )}
                </div>
                 {selectedBatchItems.length > 0 && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBatchItems([]);
                      setResultBatchItems([]);
                      if (batchFileInputRef.current) batchFileInputRef.current.value = '';
                    }}
                    className="text-xs text-red-400 mt-2 hover:text-red-300 underline"
                  >
                    Remover todas las imágenes
                  </button>
                )}
              </div>
            )}


            {/* Prompt & Settings Area */}
            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl space-y-4">
              <h2 className="text-lg font-semibold text-white">Configuración</h2>
              
              {/* Custom Dimensions for Background Edit */}
              {mode === AppMode.BACKGROUND_EDIT && backgroundDims && (
                <div className="space-y-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <label className="text-xs font-bold uppercase text-blue-400 tracking-wider flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    Dimensiones de Salida (px)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Ancho</span>
                      <input 
                        type="number"
                        value={outputWidth}
                        onChange={(e) => setOutputWidth(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Alto</span>
                      <input 
                        type="number"
                        value={outputHeight}
                        onChange={(e) => setOutputHeight(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 italic">
                    Original: {backgroundDims.w} x {backgroundDims.h} px
                  </p>
                </div>
              )}

              {/* Vehicle Scale for Background Edit */}
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
                    onChange={(e) => setVehicleScale(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-600 font-medium">
                    <span>Pequeño</span>
                    <span>Medio</span>
                    <span>Grande</span>
                  </div>
                </div>
              )}

              {/* Background Removal Options */}
              {(mode === AppMode.REMOVE_BACKGROUND || mode === AppMode.BATCH_EDIT_SHADOW) && (
                <div className="space-y-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <label className="text-xs font-bold uppercase text-red-400 tracking-wider flex items-center gap-2">
                    <ScissorsIcon />
                    Tipo de Fondo
                  </label>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setRemoveBgType('white')}
                      className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm transition-all ${removeBgType === 'white' ? 'bg-white/10 text-white border border-white/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      <span>Fondo Blanco Impecable</span>
                      {removeBgType === 'white' && <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>}
                    </button>
                    <button
                      onClick={() => setRemoveBgType('transparent')}
                      className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm transition-all ${removeBgType === 'transparent' ? 'bg-white/10 text-white border border-white/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      <span>Transparencia (PNG)</span>
                      {removeBgType === 'transparent' && <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>}
                    </button>
                  </div>
                </div>
              )}

              {/* Prompt Input - Shown for GENERATE and ANALYZE modes ONLY */}
              {(mode === AppMode.GENERATE || mode === AppMode.ANALYZE) && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                    Prompt (Instrucción)
                  </label>
                  <textarea
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none h-32"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe lo que quieres hacer..."
                  />

                  {/* ── Prompt Library ── */}
                  <div className="space-y-2 pt-1">
                    {/* Save current prompt */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={savingPromptName}
                        onChange={e => setSavingPromptName(e.target.value)}
                        placeholder="Nombre del prompt..."
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500 transition-colors"
                      />
                      <button
                        disabled={!savingPromptName.trim() || !prompt.trim()}
                        onClick={() => {
                          addPrompt(savingPromptName.trim(), prompt, mode);
                          setSavingPromptName('');
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
                      >
                        Guardar
                      </button>
                    </div>

                    {/* Saved prompts for this mode */}
                    {forMode(mode).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase text-slate-600 font-semibold tracking-wider">
                          Guardados
                        </p>
                        <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                          {forMode(mode).map(p => (
                            <div key={p.id} className="flex items-center gap-1 bg-slate-950 rounded-lg px-2 py-1 border border-slate-800">
                              <button
                                onClick={() => setPrompt(p.prompt)}
                                className="flex-1 text-left text-xs text-slate-300 hover:text-white truncate transition-colors"
                                title={p.prompt}
                              >
                                {p.name}
                              </button>
                              <button
                                onClick={() => removePrompt(p.id)}
                                className="text-slate-600 hover:text-red-400 transition-colors text-xs flex-shrink-0"
                                title="Eliminar"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {mode === AppMode.GENERATE && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Relación Aspecto</label>
                    <select 
                      value={genAspectRatio}
                      onChange={(e) => setGenAspectRatio(e.target.value as AspectRatio)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      {Object.values(AspectRatio).map(ratio => (
                        <option key={ratio} value={ratio}>{ratio}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Resolución</label>
                    <select 
                      value={genImageSize}
                      onChange={(e) => setGenImageSize(e.target.value as ImageSize)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      {Object.values(ImageSize).map(size => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {(mode === AppMode.EDIT_SHADOW || mode === AppMode.BATCH_EDIT_SHADOW || mode === AppMode.REMOVE_BACKGROUND) ? (
                <div className="space-y-3 mt-4">
                  {(mode === AppMode.EDIT_SHADOW || mode === AppMode.BATCH_EDIT_SHADOW) && (
                    <>
                      <Button 
                        onClick={() => handleAction(PROMPT_A_MIRROR)} 
                        isLoading={loading.isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50"
                        disabled={mode === AppMode.BATCH_EDIT_SHADOW ? selectedBatchItems.length === 0 : !selectedFile}
                      >
                        {!loading.isLoading && <SparkIcon />}
                        Sombra Espejo
                      </Button>
                      <Button 
                        onClick={() => handleAction(PROMPT_B_DARK)} 
                        isLoading={loading.isLoading}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 border border-slate-600"
                        disabled={mode === AppMode.BATCH_EDIT_SHADOW ? selectedBatchItems.length === 0 : !selectedFile}
                      >
                        {!loading.isLoading && <SparkIcon />}
                        Sombra Oscura
                      </Button>

                      {mode === AppMode.BATCH_EDIT_SHADOW && (
                        <>
                          <Button 
                            onClick={() => handleAction(removeBgType === 'white' ? PROMPT_REMOVE_BACKGROUND_WHITE : PROMPT_REMOVE_BACKGROUND_TRANSPARENT)} 
                            isLoading={loading.isLoading}
                            className="w-full bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/50"
                            disabled={selectedBatchItems.length === 0}
                          >
                            {!loading.isLoading && <ScissorsIcon />}
                            Remover Fondo ({removeBgType === 'white' ? 'Blanco' : 'Transp.'})
                          </Button>
                          <Button 
                            onClick={() => handleAction(PROMPT_REMOVE_BACKGROUND_INTERIOR)} 
                            isLoading={loading.isLoading}
                            className="w-full bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/50"
                            disabled={selectedBatchItems.length === 0}
                          >
                            {!loading.isLoading && <ScissorsIcon />}
                            Remover Background Int
                          </Button>
                        </>
                      )}
                    </>
                  )}
                  {mode === AppMode.REMOVE_BACKGROUND && (
                    <div className="space-y-3">
                      <Button 
                        onClick={() => handleAction(removeBgType === 'white' ? PROMPT_REMOVE_BACKGROUND_WHITE : PROMPT_REMOVE_BACKGROUND_TRANSPARENT)} 
                        isLoading={loading.isLoading}
                        className="w-full bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/50"
                        disabled={!selectedFile}
                      >
                        {!loading.isLoading && <ScissorsIcon />}
                        {removeBgType === 'white' ? 'Remover (Fondo Blanco)' : 'Remover (Transparente)'}
                      </Button>
                      <Button 
                        onClick={() => handleAction(PROMPT_REMOVE_BACKGROUND_INTERIOR)} 
                        isLoading={loading.isLoading}
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/50"
                        disabled={!selectedFile}
                      >
                        {!loading.isLoading && <ScissorsIcon />}
                        Remover Background Int
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <Button 
                  onClick={() => handleAction()} 
                  isLoading={loading.isLoading}
                  className="w-full mt-4"
                  disabled={
                    (!selectedFile && mode !== AppMode.GENERATE) || 
                    (mode === AppMode.BACKGROUND_EDIT && (!selectedFile || !selectedBackgroundFile))
                  }
                >
                  {!loading.isLoading && <SparkIcon />}
                  {loading.isLoading ? loading.message : 
                   mode === AppMode.ANALYZE ? 'Analizar' : 
                   mode === AppMode.BACKGROUND_EDIT ? 'Aplicar Edición' :
                   'Generar'}
                </Button>
              )}
            </div>
          </div>

          {/* Result Column */}
          <div className="lg:col-span-8">
            <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl h-full min-h-[500px] flex flex-col overflow-hidden relative">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <h2 className="text-lg font-semibold text-white">Resultado</h2>
                {(resultImage || resultBatchItems.length > 0) && (
                  <div className="flex gap-2">
                    {/* For single image mode */}
                    {resultImage && mode !== AppMode.BATCH_EDIT_SHADOW && ( // Ensure it's not batch mode
                      <>
                        <Button 
                          variant="secondary" 
                          onClick={() => downloadResizedImage(
                            resultImage, 
                            `autoshadow-${Date.now()}.png`, 
                            'image/png', 
                            mode === AppMode.BACKGROUND_EDIT ? outputWidth : originalDims?.w, 
                            mode === AppMode.BACKGROUND_EDIT ? outputHeight : originalDims?.h
                          )}
                          className="text-xs py-1.5 px-3"
                        >
                          Descargar PNG
                        </Button>
                        {!(mode === AppMode.REMOVE_BACKGROUND && removeBgType === 'transparent') && (
                          <Button 
                            variant="secondary" 
                            onClick={() => downloadResizedImage(
                              resultImage, 
                              `autoshadow-${Date.now()}.jpg`, 
                              'image/jpeg', 
                              mode === AppMode.BACKGROUND_EDIT ? outputWidth : originalDims?.w, 
                              mode === AppMode.BACKGROUND_EDIT ? outputHeight : originalDims?.h
                            )}
                            className="text-xs py-1.5 px-3 bg-slate-800"
                          >
                            Descargar JPG
                          </Button>
                        )}
                      </>
                    )}
                    {/* Batch mode global download */}
                    {mode === AppMode.BATCH_EDIT_SHADOW && hasSuccessfulBatchResults && (
                      <Button
                        variant="primary"
                        onClick={() => downloadAllBatchImages(resultBatchItems)}
                        isLoading={loading.isLoading}
                        className="text-xs py-1.5 px-3"
                      >
                        Descargar Todo (Zip)
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className={`flex-1 ${mode === AppMode.REMOVE_BACKGROUND && removeBgType === 'transparent' && resultImage ? 'bg-checkered' : 'bg-slate-950'} flex items-center justify-center p-4 relative transition-colors`}>
                
                {/* Empty State */}
                {!resultImage && !resultText && !loading.isLoading && resultBatchItems.length === 0 && (
                  <div className="text-center text-slate-600 max-w-sm">
                    <div className="mx-auto w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mb-4 border border-slate-800">
                      <SparkIcon />
                    </div>
                    <p className="text-lg font-medium text-slate-500">Listo para crear magia</p>
                    {mode === AppMode.BATCH_EDIT_SHADOW ? (
                      <p className="text-sm mt-2">Sube hasta 12 imágenes para procesar por lotes.</p>
                    ) : (
                      <p className="text-sm mt-2">Sube una imagen o selecciona un tipo de sombra.</p>
                    )}
                  </div>
                )}

                {/* Blocking overlay — single-image modes only */}
                {loading.isLoading && mode !== AppMode.BATCH_EDIT_SHADOW && (
                  <div className="absolute inset-0 z-10 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
                    <div className="w-16 h-16 border-4 border-blue-600/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                    <p className="text-blue-400 animate-pulse">{loading.message}</p>
                    {mode === AppMode.GENERATE && genImageSize === ImageSize.SIZE_4K && (
                      <p className="text-xs text-slate-500 mt-2">Generar en 4K puede tomar un momento...</p>
                    )}
                  </div>
                )}

                {/* Single Image Result */}
                {resultImage && mode !== AppMode.BATCH_EDIT_SHADOW && (
                  previewUrl && mode !== AppMode.GENERATE
                    ? (
                      <div className="w-full">
                        <BeforeAfterSlider
                          before={previewUrl}
                          after={resultImage}
                          isTransparent={mode === AppMode.REMOVE_BACKGROUND && removeBgType === 'transparent'}
                        />
                        <p className="text-center text-xs text-slate-500 mt-2">← Arrastra para comparar →</p>
                      </div>
                    ) : (
                      <img
                        src={resultImage}
                        alt="Result"
                        className="max-w-full max-h-[70vh] rounded-lg shadow-2xl object-contain border border-slate-800"
                      />
                    )
                )}

                {/* Batch Image Results */}
                {mode === AppMode.BATCH_EDIT_SHADOW && resultBatchItems.length > 0 && (
                  <div className="flex flex-col w-full max-h-[70vh] overflow-y-auto">
                    {/* Non-blocking progress bar — visible while items are still processing */}
                    {loading.isLoading && (
                      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm px-4 py-2 border-b border-slate-700 mb-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-3.5 h-3.5 border-2 border-blue-500/40 border-t-blue-400 rounded-full animate-spin flex-shrink-0"></div>
                          <span className="text-xs text-blue-400">{loading.message}</span>
                        </div>
                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{
                              width: `${(resultBatchItems.filter(i => !i.loading).length / resultBatchItems.length) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-2">
                    {resultBatchItems.map(item => (
                      <div key={item.id} className="bg-slate-900 rounded-lg p-3 border border-slate-800 flex flex-col items-center space-y-2 shadow-lg">
                        {item.loading && (
                           <div className="w-full h-48 bg-slate-800 flex items-center justify-center rounded-md">
                             <div className="w-10 h-10 border-2 border-blue-600/30 border-t-blue-500 rounded-full animate-spin"></div>
                           </div>
                        )}
                        {item.errorMessage && !item.loading && (
                          <div className="w-full h-48 bg-red-900/30 text-red-400 flex items-center justify-center rounded-md text-sm">
                            {item.errorMessage}
                          </div>
                        )}
                        {item.resultImage && !item.loading && (
                          <div className={`w-full h-48 flex items-center justify-center rounded-md border border-slate-700 overflow-hidden ${mode === AppMode.BATCH_EDIT_SHADOW && removeBgType === 'transparent' ? 'bg-checkered' : 'bg-slate-950'}`}>
                            <img 
                              src={item.resultImage} 
                              alt={`Result for ${item.file.name}`} 
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                        )}
                        <p className="text-xs text-slate-400 truncate w-full text-center">
                           Original: {item.file.name} ({item.originalDims?.w}x{item.originalDims?.h}px)
                        </p>
                        {item.resultImage && (
                           <div className="flex gap-2 mt-2">
                             <Button 
                               variant="secondary" 
                               onClick={() => downloadResizedImage(item.resultImage!, `autoshadow-${item.id}.png`, 'image/png', item.originalDims?.w, item.originalDims?.h)}
                               className="text-xs py-1.5 px-3"
                             >
                               Descargar PNG
                             </Button>
                             {!(mode === AppMode.BATCH_EDIT_SHADOW && removeBgType === 'transparent') && (
                               <Button 
                                 variant="secondary" 
                                 onClick={() => downloadResizedImage(item.resultImage!, `autoshadow-${item.id}.jpg`, 'image/jpeg', item.originalDims?.w, item.originalDims?.h)}
                                 className="text-xs py-1.5 px-3 bg-slate-800"
                               >
                                 Descargar JPG
                               </Button>
                             )}
                           </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                )}

                {/* Text Analysis Result */}
                {resultText && (
                  <div className="w-full max-w-2xl bg-slate-900 p-6 rounded-xl border border-slate-800 overflow-y-auto max-h-[70vh]">
                    <h3 className="text-xl font-bold text-emerald-400 mb-4 flex items-center gap-2">
                      <span className="bg-emerald-500/10 p-1 rounded">✨</span> Análisis de Vehículo
                    </h3>
                    <div className="prose prose-invert prose-slate max-w-none whitespace-pre-wrap leading-relaxed">
                      {resultText}
                      {/* Blinking cursor while streaming */}
                      {!loading.isLoading && mode === AppMode.ANALYZE && (
                        <span className="inline-block w-0.5 h-4 bg-emerald-400 ml-0.5 animate-pulse align-middle" />
                      )}
                    </div>
                    <div className="mt-8 pt-4 border-t border-slate-800 text-xs text-slate-500 text-center">
                      Nota: Este análisis es generado por IA y puede contener imprecisiones sobre especificaciones técnicas exactas.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── History Panel ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="rounded-2xl border border-slate-800 overflow-hidden">
          <HistoryPanel refreshSignal={historyRefresh} />
        </div>
      </div>
    </div>
  );
};

export default App;