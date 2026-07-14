import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { compositeCarOntoBackground } from '../utils';

const BackgroundPositionPreview: React.FC = () => {
  const {
    carCutoutUrl,
    removingBackground,
    backgroundPreviewUrl,
    outputWidth,
    outputHeight,
    backgroundDims,
    bgPositionMode,
    setBgPositionMode,
    bgMarginPercent,
    setBgMarginPercent,
    bgCustomOffset,
    setBgCustomOffset,
  } = useApp();

  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);

  const canvasWidth = outputWidth || backgroundDims?.w || 1024;
  const canvasHeight = outputHeight || backgroundDims?.h || 1024;

  useEffect(() => {
    if (!carCutoutUrl || !backgroundPreviewUrl) {
      setPreviewSrc(null);
      return;
    }
    let cancelled = false;
    compositeCarOntoBackground(
      carCutoutUrl,
      backgroundPreviewUrl,
      canvasWidth,
      canvasHeight,
      bgMarginPercent,
      bgPositionMode === 'custom' ? bgCustomOffset.x : 0,
      bgPositionMode === 'custom' ? bgCustomOffset.y : 0
    )
      .then(url => {
        if (!cancelled) setPreviewSrc(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [carCutoutUrl, backgroundPreviewUrl, canvasWidth, canvasHeight, bgMarginPercent, bgPositionMode, bgCustomOffset]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (bgPositionMode !== 'custom' || !boxRef.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, startOffset: bgCustomOffset };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const dxFraction = (e.clientX - dragState.current.startX) / rect.width;
    const dyFraction = (e.clientY - dragState.current.startY) / rect.height;
    const nextX = Math.min(0.5, Math.max(-0.5, dragState.current.startOffset.x + dxFraction));
    const nextY = Math.min(0.5, Math.max(-0.5, dragState.current.startOffset.y + dyFraction));
    setBgCustomOffset({ x: nextX, y: nextY });
  };

  const handlePointerUp = () => {
    dragState.current = null;
  };

  return (
    <div className="space-y-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
      <label className="text-xs font-bold uppercase text-emerald-400 tracking-wider">Posición</label>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setBgPositionMode('center')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            bgPositionMode === 'center'
              ? 'bg-white/10 text-white border border-white/20'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          Centro
        </button>
        <button
          type="button"
          onClick={() => setBgPositionMode('custom')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            bgPositionMode === 'custom'
              ? 'bg-white/10 text-white border border-white/20'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          Personalizado
        </button>
      </div>

      <label className="text-xs font-bold uppercase text-emerald-400 tracking-wider flex justify-between items-center pt-1">
        <span>Margen (%)</span>
        <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px]">{bgMarginPercent}%</span>
      </label>
      <input
        type="range"
        min="0"
        max="40"
        step="1"
        value={bgMarginPercent}
        onChange={e => setBgMarginPercent(parseInt(e.target.value))}
        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />

      <div>
        <p className="text-[10px] uppercase text-slate-600 font-semibold tracking-wider mb-1">Vista Previa</p>
        <div
          ref={boxRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`relative h-48 rounded-xl border border-slate-800 bg-slate-900 overflow-hidden flex items-center justify-center ${
            bgPositionMode === 'custom' ? 'cursor-move' : ''
          }`}
        >
          {removingBackground && <p className="text-xs text-slate-500">Quitando fondo del auto…</p>}
          {!removingBackground && !previewSrc && (
            <p className="text-xs text-slate-600 text-center px-4">
              Sube un auto y elegí un fondo para ver la vista previa.
            </p>
          )}
          {!removingBackground && previewSrc && (
            <img
              src={previewSrc}
              alt="Vista previa de posición"
              className="w-full h-full object-contain select-none pointer-events-none"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default BackgroundPositionPreview;
