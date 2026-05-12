import React, { useEffect, useState } from 'react';
import { AppMode } from './types';
import { AppProvider, useApp } from './context/AppContext';
import ControlsPanel from './components/ControlsPanel';
import ResultView from './components/ResultView';
import HistoryPanel from './components/HistoryPanel';
import { CarIcon, SparkIcon, DownloadIcon, UploadIcon } from './components/Icons';

// ─── Inner shell (has access to context via useApp) ────────────────────────────

const AppShell: React.FC = () => {
  const {
    mode,
    resetState,
    hasKey,
    installPrompt,
    historyRefresh,
    handleOpenKeyDialog,
    handleInstallClick,
    handleFileChange,
  } = useApp();

  // ── Global drag & drop ──
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setIsDragging(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      // Only clear when leaving the browser window entirely
      if (!e.relatedTarget) setIsDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      // Build a synthetic ChangeEvent so handleFileChange can process the dropped files
      const synthetic = {
        target: { files, value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      if (mode === AppMode.BATCH_EDIT_SHADOW) {
        handleFileChange(synthetic, true);
      } else {
        handleFileChange(synthetic, false, 'car');
      }
    };

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [mode, handleFileChange]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">

      {/* ── Global drag-and-drop overlay ── */}
      {isDragging && (
        <div className="fixed inset-0 z-[200] bg-blue-950/90 backdrop-blur-sm border-4 border-dashed border-blue-400 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <UploadIcon />
            </div>
            <p className="text-2xl font-bold text-blue-200">Suelta las imágenes aquí</p>
            <p className="text-blue-400 mt-2 text-sm">
              {mode === AppMode.BATCH_EDIT_SHADOW
                ? 'Se agregarán al lote'
                : 'Se cargará como imagen principal'}
            </p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
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
              Powered by Gemini 2.5 &amp; 3.0
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Navigation tabs ── */}
        <div className="flex flex-wrap gap-2 mb-8 p-1 bg-slate-900/80 rounded-xl border border-slate-800 w-full md:w-fit">
          {(
            [
              { m: AppMode.EDIT_SHADOW,       label: 'Editar & Sombras',  active: 'bg-blue-600 shadow-blue-900/50'    },
              { m: AppMode.REMOVE_BACKGROUND, label: 'Remover Fondo',     active: 'bg-red-600 shadow-red-900/50'      },
              { m: AppMode.BACKGROUND_EDIT,   label: 'Edición de Fondos', active: 'bg-green-600 shadow-green-900/50'  },
              { m: AppMode.BATCH_EDIT_SHADOW, label: 'Lotes',             active: 'bg-purple-600 shadow-purple-900/50'},
              { m: AppMode.GENERATE,          label: 'Generar Nuevo',     active: 'bg-indigo-600 shadow-indigo-900/50'},
              { m: AppMode.ANALYZE,           label: 'Analizar',          active: 'bg-emerald-600 shadow-emerald-900/50'},
            ] as const
          ).map(({ m, label, active }) => (
            <button
              key={m}
              onClick={() => resetState(m)}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === m
                  ? `${active} text-white shadow-lg`
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <ControlsPanel />
          <ResultView />
        </div>
      </main>

      {/* ── History panel ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="rounded-2xl border border-slate-800 overflow-hidden">
          <HistoryPanel refreshSignal={historyRefresh} />
        </div>
      </div>
    </div>
  );
};

// ─── Root export — wraps shell in context provider ─────────────────────────────

const App: React.FC = () => (
  <AppProvider>
    <AppShell />
  </AppProvider>
);

export default App;
