import React from 'react';
import { AppMode, AspectRatio, ImageSize } from '../types';
import { useApp } from '../context/AppContext';
import { Button } from './Button';
import { UploadIcon, SparkIcon, ScissorsIcon, CloseIcon } from './Icons';
import {
  PROMPT_A_MIRROR,
  PROMPT_B_DARK,
  PROMPT_REMOVE_BACKGROUND_WHITE,
  PROMPT_REMOVE_BACKGROUND_TRANSPARENT,
  PROMPT_REMOVE_BACKGROUND_INTERIOR,
} from '../constants/prompts';

const ControlsPanel: React.FC = () => {
  const {
    mode,
    selectedFile,
    previewUrl,
    originalDims,
    selectedBackgroundFile: selectedBackgroundFile,
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
    prompt,
    setPrompt,
    genAspectRatio,
    setGenAspectRatio,
    genImageSize,
    setGenImageSize,
    loading,
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
  } = useApp();

  // Internal setter needed in batch clear button
  // We reach into context just for the setter; keep it clean via handleRemoveImage
  // For "clear all batch" we need to reset the array — expose via a local alias
  // Actually we can call handleRemoveImage per item but that's O(n). Instead we
  // expose selectedBatchItems from context and mutate via a synthetic approach.
  // The cleanest solution: we just call a local wrapper that iterates.
  // Note: context exposes selectedBatchItems; we'll clear them via the existing
  // handleRemoveImage pattern — but for "clear all" we need direct access.
  // We get around this by importing the setter through the context value spread:
  const ctx = useApp();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clearAllBatch = () => {
    // Direct mutation through context setter is not exposed; fake it via DOM:
    // Better: expose clearBatch in context. For now, remove each item.
    // Actually App context exposes selectedBatchItems but not the setter.
    // We'll fire synthetic events: just clear by re-setting via existing handles.
    // The safest approach — add a clearBatch helper to context. But to avoid
    // changing the already-written AppContext we replicate the clear logic here
    // by calling the context's own exported refs & batch items.
    ctx.selectedBatchItems.forEach(item => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fakeEvent = { stopPropagation: () => {} } as any;
      ctx.handleRemoveImage(fakeEvent, true, item.id);
    });
    if (ctx.batchFileInputRef.current) ctx.batchFileInputRef.current.value = '';
  };

  return (
    <div className="lg:col-span-4 space-y-6">

      {/* ── Single-image upload ── */}
      {(mode === AppMode.EDIT_SHADOW ||
        mode === AppMode.ANALYZE ||
        mode === AppMode.BACKGROUND_EDIT ||
        mode === AppMode.REMOVE_BACKGROUND) && (
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-4">Imagen Original (Auto)</h2>
          <div
            className={`border-2 border-dashed rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              previewUrl
                ? 'border-slate-600 bg-slate-800/50'
                : 'border-slate-700 hover:border-blue-500 hover:bg-slate-800/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            style={
              previewUrl
                ? { backgroundImage: `url(${previewUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : {}
            }
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
              onChange={e => handleFileChange(e, false, 'car')}
            />
          </div>
          {previewUrl && (
            <button
              onClick={e => handleRemoveImage(e, false, undefined, 'car')}
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

      {/* ── Batch upload ── */}
      {mode === AppMode.BATCH_EDIT_SHADOW && (
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-4">Imágenes Originales (Lotes)</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {selectedBatchItems.map(item => (
              <div
                key={item.id}
                className="relative w-full h-32 rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden group"
              >
                <img src={item.previewUrl} alt="Preview" className="w-full h-full object-cover" />
                <button
                  onClick={e => handleRemoveImage(e, true, item.id)}
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
                  onChange={e => handleFileChange(e, true)}
                />
              </div>
            )}
          </div>
          {selectedBatchItems.length > 0 && (
            <button
              onClick={clearAllBatch}
              className="text-xs text-red-400 mt-2 hover:text-red-300 underline"
            >
              Remover todas las imágenes
            </button>
          )}
        </div>
      )}

      {/* ── Settings card ── */}
      <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl space-y-4">
        <h2 className="text-lg font-semibold text-white">Configuración</h2>

        {/* Output dimensions (BACKGROUND_EDIT only) */}
        {mode === AppMode.BACKGROUND_EDIT && backgroundDims && (
          <div className="space-y-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
            <label className="text-xs font-bold uppercase text-blue-400 tracking-wider flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              Dimensiones de Salida (px)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Ancho</span>
                <input
                  type="number"
                  value={outputWidth}
                  onChange={e => setOutputWidth(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Alto</span>
                <input
                  type="number"
                  value={outputHeight}
                  onChange={e => setOutputHeight(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-600 italic">
              Original: {backgroundDims.w} x {backgroundDims.h} px
            </p>
          </div>
        )}

        {/* Vehicle scale slider (BACKGROUND_EDIT only) */}
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
              onChange={e => setVehicleScale(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-slate-600 font-medium">
              <span>Pequeño</span><span>Medio</span><span>Grande</span>
            </div>
          </div>
        )}

        {/* Remove-bg type toggle */}
        {(mode === AppMode.REMOVE_BACKGROUND || mode === AppMode.BATCH_EDIT_SHADOW) && (
          <div className="space-y-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
            <label className="text-xs font-bold uppercase text-red-400 tracking-wider flex items-center gap-2">
              <ScissorsIcon />
              Tipo de Fondo
            </label>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setRemoveBgType('white')}
                className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm transition-all ${
                  removeBgType === 'white'
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>Fondo Blanco Impecable</span>
                {removeBgType === 'white' && (
                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                )}
              </button>
              <button
                onClick={() => setRemoveBgType('transparent')}
                className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm transition-all ${
                  removeBgType === 'transparent'
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>Transparencia (PNG)</span>
                {removeBgType === 'transparent' && (
                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Prompt textarea (GENERATE + ANALYZE only) */}
        {(mode === AppMode.GENERATE || mode === AppMode.ANALYZE) && (
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
              Prompt (Instrucción)
            </label>
            <textarea
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none h-32"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe lo que quieres hacer..."
            />

            {/* Prompt library */}
            <div className="space-y-2 pt-1">
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
              {forMode(mode).length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase text-slate-600 font-semibold tracking-wider">Guardados</p>
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

        {/* Aspect ratio + resolution (GENERATE only) */}
        {mode === AppMode.GENERATE && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Relación Aspecto</label>
              <select
                value={genAspectRatio}
                onChange={e => setGenAspectRatio(e.target.value as AspectRatio)}
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
                onChange={e => setGenImageSize(e.target.value as ImageSize)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                {Object.values(ImageSize).map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {mode === AppMode.EDIT_SHADOW || mode === AppMode.BATCH_EDIT_SHADOW || mode === AppMode.REMOVE_BACKGROUND ? (
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
                      onClick={() =>
                        handleAction(
                          removeBgType === 'white' ? PROMPT_REMOVE_BACKGROUND_WHITE : PROMPT_REMOVE_BACKGROUND_TRANSPARENT
                        )
                      }
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
                  onClick={() =>
                    handleAction(
                      removeBgType === 'white' ? PROMPT_REMOVE_BACKGROUND_WHITE : PROMPT_REMOVE_BACKGROUND_TRANSPARENT
                    )
                  }
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
            {loading.isLoading
              ? loading.message
              : mode === AppMode.ANALYZE
              ? 'Analizar'
              : mode === AppMode.BACKGROUND_EDIT
              ? 'Aplicar Edición'
              : 'Generar'}
          </Button>
        )}
      </div>
      {/* ── Flujos Encadenados ── */}
      {(mode === AppMode.EDIT_SHADOW ||
        mode === AppMode.REMOVE_BACKGROUND ||
        mode === AppMode.BACKGROUND_EDIT) &&
        selectedFile && (
          <div className="bg-slate-900 rounded-2xl p-6 border border-purple-900/50 shadow-xl space-y-3">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <span className="text-purple-400 text-lg">⛓</span> Flujos Encadenados
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Combina operaciones en un solo proceso automático de 2 pasos.
            </p>

            {/* Sin Fondo + Sombra Espejo */}
            <Button
              onClick={() => handleChainedAction('shadow-mirror')}
              isLoading={loading.isLoading}
              className="w-full bg-violet-700 hover:bg-violet-600 text-white shadow-lg shadow-violet-900/40"
              disabled={!selectedFile}
            >
              {!loading.isLoading && <SparkIcon />}
              Sin Fondo → Sombra Espejo
            </Button>

            {/* Estudio Completo — only when background template is loaded */}
            <Button
              onClick={() => handleChainedAction('studio-complete')}
              isLoading={loading.isLoading}
              className={`w-full text-white shadow-lg shadow-purple-900/40 transition-all ${
                selectedBackgroundFile
                  ? 'bg-purple-700 hover:bg-purple-600'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
              }`}
              disabled={!selectedFile || !selectedBackgroundFile}
            >
              {!loading.isLoading && <SparkIcon />}
              {selectedBackgroundFile
                ? 'Sin Fondo → Fondo Estudio'
                : 'Sin Fondo → Fondo Estudio (sube plantilla)'}
            </Button>
          </div>
        )}
    </div>
  );
};

export default ControlsPanel;
