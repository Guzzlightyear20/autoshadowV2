import React from 'react';
import { AppMode, ImageSize } from '../types';
import { useApp } from '../context/AppContext';
import { MODELS_FOR_MODE, ModelOption } from '../constants/models';

const COST_STYLES: Record<ModelOption['costHint'], string> = {
  low: 'bg-emerald-500/20 text-emerald-400',
  medium: 'bg-amber-500/20 text-amber-400',
  high: 'bg-red-500/20 text-red-400',
};

const ModelSelector: React.FC = () => {
  const { mode, modelByMode, setModelForMode, imageSizeByMode, setImageSizeForMode } = useApp();

  const options = MODELS_FOR_MODE(mode);
  const selected = modelByMode[mode];
  const selectedOption = options.find(o => o.id === selected);
  const showImageSize = mode === AppMode.GENERATE;

  return (
    <div className="space-y-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Modelo</label>
        {selectedOption && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${COST_STYLES[selectedOption.costHint]}`}>
            {selectedOption.costHint === 'low' ? 'Económico' : selectedOption.costHint === 'medium' ? 'Medio' : 'Alto costo'}
          </span>
        )}
      </div>
      <select
        value={selected}
        onChange={e => setModelForMode(mode, e.target.value)}
        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:ring-blue-500 focus:border-blue-500"
      >
        {options.map(o => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>

      {showImageSize && (
        <div className="space-y-1 pt-1">
          <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Resolución</label>
          <select
            value={imageSizeByMode[mode]}
            onChange={e => setImageSizeForMode(mode, e.target.value as ImageSize)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            {Object.values(ImageSize).map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
