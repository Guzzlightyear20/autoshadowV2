import React, { useEffect, useState, useCallback } from 'react';
import { historyDB, HistoryEntry } from '../hooks/useImageHistory';
import { AppMode } from '../types';
import { downloadResizedImage } from '../utils';

const MODE_LABELS: Record<AppMode, { label: string; color: string }> = {
  [AppMode.EDIT_SHADOW]:       { label: 'Sombra',      color: 'bg-blue-600'    },
  [AppMode.REMOVE_BACKGROUND]: { label: 'Sin Fondo',   color: 'bg-red-600'     },
  [AppMode.BACKGROUND_EDIT]:   { label: 'Fondo',       color: 'bg-green-600'   },
  [AppMode.BATCH_EDIT_SHADOW]: { label: 'Lote',        color: 'bg-purple-600'  },
  [AppMode.GENERATE]:          { label: 'Generado',    color: 'bg-indigo-600'  },
  [AppMode.ANALYZE]:           { label: 'Análisis',    color: 'bg-emerald-600' },
};

const timeAgo = (ts: number): string => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return 'hace un momento';
  if (s < 3600)  return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
};

interface Props {
  /** External signal to reload history (increment after each new save). */
  refreshSignal: number;
}

const HistoryPanel: React.FC<Props> = ({ refreshSignal }) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const load = useCallback(async () => {
    const all = await historyDB.getAll();
    setEntries(all);
  }, []);

  // Reload when a new result is saved or panel is opened
  useEffect(() => { load(); }, [load, refreshSignal]);

  const handleDelete = async (id: string) => {
    await historyDB.remove(id);
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleClear = async () => {
    if (!window.confirm('¿Eliminar todo el historial?')) return;
    await historyDB.clear();
    setEntries([]);
  };

  return (
    <div className="border-t border-slate-800 bg-slate-900/60">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          {/* Clock icon */}
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Historial de sesión
          {entries.length > 0 && (
            <span className="bg-slate-700 text-slate-300 text-xs px-1.5 py-0.5 rounded-full">
              {entries.length}
            </span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Panel body */}
      {isOpen && (
        <div className="px-6 pb-6">
          {entries.length === 0 ? (
            <p className="text-sm text-slate-600 text-center py-6">
              Aún no hay resultados guardados. Procesa una imagen para empezar.
            </p>
          ) : (
            <>
              {/* Clear all button */}
              <div className="flex justify-end mb-3">
                <button
                  onClick={handleClear}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  Limpiar todo
                </button>
              </div>

              {/* Grid of thumbnails */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {entries.map(entry => {
                  const meta = MODE_LABELS[entry.mode];
                  return (
                    <div
                      key={entry.id}
                      className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 group flex flex-col"
                    >
                      {/* Thumbnail */}
                      <div className="relative h-24 bg-slate-950 flex items-center justify-center overflow-hidden">
                        {entry.resultImage ? (
                          <img
                            src={entry.resultImage}
                            alt="Resultado"
                            className="w-full h-full object-cover"
                          />
                        ) : entry.resultText ? (
                          <div className="p-2 text-[10px] text-slate-400 leading-tight overflow-hidden max-h-full">
                            {entry.resultText.slice(0, 120)}…
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">Sin vista previa</span>
                        )}

                        {/* Mode badge */}
                        <span className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white ${meta.color}`}>
                          {meta.label}
                        </span>

                        {/* Delete button — shown on hover */}
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Footer */}
                      <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                        <span className="text-[10px] text-slate-500 truncate">
                          {timeAgo(entry.timestamp)}
                        </span>
                        {entry.resultImage && (
                          <button
                            onClick={() => downloadResizedImage(entry.resultImage!, `history-${entry.id}.png`, 'image/png')}
                            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0"
                            title="Descargar"
                          >
                            ↓ PNG
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default HistoryPanel;
