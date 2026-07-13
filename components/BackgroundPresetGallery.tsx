import React from 'react';
import { useApp } from '../context/AppContext';
import { BACKGROUND_PRESETS, BackgroundPreset } from '../constants/backgroundPresets';
import { UploadIcon } from './Icons';

const BackgroundPresetGallery: React.FC = () => {
  const {
    selectedPresetId,
    setSelectedPresetId,
    setBackgroundFile,
    backgroundPreviewUrl,
    backgroundFileInputRef,
    handleFileChange,
  } = useApp();

  const handlePresetClick = async (preset: BackgroundPreset) => {
    try {
      const res = await fetch(preset.path);
      if (!res.ok) throw new Error('No se pudo cargar el fondo.');
      const blob = await res.blob();
      const file = new File([blob], `${preset.id}.jpg`, { type: blob.type });
      setBackgroundFile(file);
      setSelectedPresetId(preset.id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Error: ${msg}`);
    }
  };

  const isCustomActive = selectedPresetId === null && !!backgroundPreviewUrl;

  return (
    <div className="grid grid-cols-3 gap-3">
      {BACKGROUND_PRESETS.map(preset => (
        <button
          key={preset.id}
          type="button"
          onClick={() => handlePresetClick(preset)}
          className={`relative h-24 rounded-xl border-2 bg-cover bg-center transition-colors ${
            selectedPresetId === preset.id
              ? 'border-blue-500'
              : 'border-slate-700 hover:border-blue-500/50'
          }`}
          style={{ backgroundImage: `url(${preset.path})` }}
          title={preset.name}
        >
          {selectedPresetId === preset.id && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          )}
          <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded-b-xl truncate">
            {preset.name}
          </span>
        </button>
      ))}

      <div
        onClick={() => backgroundFileInputRef.current?.click()}
        className={`relative h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer bg-cover bg-center transition-colors ${
          isCustomActive ? 'border-blue-500 bg-slate-800/50' : 'border-slate-700 hover:border-blue-500/50'
        }`}
        style={isCustomActive ? { backgroundImage: `url(${backgroundPreviewUrl})` } : {}}
      >
        {!isCustomActive && (
          <>
            <UploadIcon />
            <span className="text-[10px] text-slate-400 font-medium text-center px-1 mt-1">Subir la mía</span>
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
    </div>
  );
};

export default BackgroundPresetGallery;
