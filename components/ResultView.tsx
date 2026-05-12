import React, { useState } from 'react';
import { AppMode, ImageSize } from '../types';
import { useApp } from '../context/AppContext';
import { Button } from './Button';
import BeforeAfterSlider from './BeforeAfterSlider';
import { SparkIcon, DownloadIcon, ShareIcon, WebpIcon } from './Icons';
import { downloadResizedImage, downloadAllBatchImages, shareImage } from '../utils';

const ResultView: React.FC = () => {
  const {
    mode,
    previewUrl,
    originalDims,
    resultImage,
    resultText,
    resultBatchItems,
    hasSuccessfulBatchResults,
    loading,
    removeBgType,
    outputWidth,
    outputHeight,
    genImageSize,
  } = useApp();

  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const handleShare = async () => {
    if (!resultImage) return;
    setShareStatus('Compartiendo…');
    try {
      const status = await shareImage(resultImage, `autoshadow-${Date.now()}.png`);
      if (status === 'shared') setShareStatus('✓ Compartido');
      else if (status === 'copied') setShareStatus('✓ Copiado al portapapeles');
      else setShareStatus('No soportado');
    } catch {
      setShareStatus('Error al compartir');
    }
    setTimeout(() => setShareStatus(null), 3000);
  };

  const dlWidth  = mode === AppMode.BACKGROUND_EDIT ? outputWidth  : originalDims?.w;
  const dlHeight = mode === AppMode.BACKGROUND_EDIT ? outputHeight : originalDims?.h;

  return (
    <div className="lg:col-span-8">
      <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl h-full min-h-[500px] flex flex-col overflow-hidden relative">

        {/* ── Header bar ── */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-lg font-semibold text-white">Resultado</h2>

          {(resultImage || resultBatchItems.length > 0) && (
            <div className="flex flex-wrap gap-2 justify-end">

              {/* Single-image download buttons */}
              {resultImage && mode !== AppMode.BATCH_EDIT_SHADOW && (
                <>
                  {/* PNG */}
                  <Button
                    variant="secondary"
                    onClick={() =>
                      downloadResizedImage(resultImage, `autoshadow-${Date.now()}.png`, 'image/png', dlWidth, dlHeight)
                    }
                    className="text-xs py-1.5 px-3 flex items-center gap-1"
                  >
                    <DownloadIcon /> PNG
                  </Button>

                  {/* WebP */}
                  <Button
                    variant="secondary"
                    onClick={() =>
                      downloadResizedImage(resultImage, `autoshadow-${Date.now()}.webp`, 'image/webp', dlWidth, dlHeight)
                    }
                    className="text-xs py-1.5 px-3 flex items-center gap-1"
                  >
                    <WebpIcon /> WebP
                  </Button>

                  {/* JPG (not for transparent) */}
                  {!(mode === AppMode.REMOVE_BACKGROUND && removeBgType === 'transparent') && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        downloadResizedImage(resultImage, `autoshadow-${Date.now()}.jpg`, 'image/jpeg', dlWidth, dlHeight)
                      }
                      className="text-xs py-1.5 px-3 bg-slate-800 flex items-center gap-1"
                    >
                      <DownloadIcon /> JPG
                    </Button>
                  )}

                  {/* Share */}
                  <Button
                    variant="secondary"
                    onClick={handleShare}
                    className="text-xs py-1.5 px-3 flex items-center gap-1"
                    title="Compartir imagen"
                  >
                    <ShareIcon />
                    {shareStatus ?? 'Compartir'}
                  </Button>
                </>
              )}

              {/* Batch download all */}
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

        {/* ── Body ── */}
        <div
          className={`flex-1 ${
            mode === AppMode.REMOVE_BACKGROUND && removeBgType === 'transparent' && resultImage
              ? 'bg-checkered'
              : 'bg-slate-950'
          } flex items-center justify-center p-4 relative transition-colors`}
        >

          {/* Empty state */}
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

          {/* Blocking overlay (single-image modes) */}
          {loading.isLoading && mode !== AppMode.BATCH_EDIT_SHADOW && (
            <div className="absolute inset-0 z-10 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
              <div className="w-16 h-16 border-4 border-blue-600/30 border-t-blue-500 rounded-full animate-spin mb-4" />
              <p className="text-blue-400 animate-pulse">{loading.message}</p>
              {mode === AppMode.GENERATE && genImageSize === ImageSize.SIZE_4K && (
                <p className="text-xs text-slate-500 mt-2">Generar en 4K puede tomar un momento…</p>
              )}
            </div>
          )}

          {/* Single image result */}
          {resultImage && mode !== AppMode.BATCH_EDIT_SHADOW && (
            previewUrl && mode !== AppMode.GENERATE ? (
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

          {/* Batch results */}
          {mode === AppMode.BATCH_EDIT_SHADOW && resultBatchItems.length > 0 && (
            <div className="flex flex-col w-full max-h-[70vh] overflow-y-auto">
              {/* Non-blocking progress bar */}
              {loading.isLoading && (
                <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm px-4 py-2 border-b border-slate-700 mb-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-3.5 h-3.5 border-2 border-blue-500/40 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
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
                  <div
                    key={item.id}
                    className="bg-slate-900 rounded-lg p-3 border border-slate-800 flex flex-col items-center space-y-2 shadow-lg"
                  >
                    {item.loading && (
                      <div className="w-full h-48 bg-slate-800 flex items-center justify-center rounded-md">
                        <div className="w-10 h-10 border-2 border-blue-600/30 border-t-blue-500 rounded-full animate-spin" />
                      </div>
                    )}
                    {item.errorMessage && !item.loading && (
                      <div className="w-full h-48 bg-red-900/30 text-red-400 flex items-center justify-center rounded-md text-sm">
                        {item.errorMessage}
                      </div>
                    )}
                    {item.resultImage && !item.loading && (
                      <div
                        className={`w-full h-48 flex items-center justify-center rounded-md border border-slate-700 overflow-hidden ${
                          removeBgType === 'transparent' ? 'bg-checkered' : 'bg-slate-950'
                        }`}
                      >
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
                      <div className="flex flex-wrap gap-2 mt-2 justify-center">
                        <Button
                          variant="secondary"
                          onClick={() =>
                            downloadResizedImage(
                              item.resultImage!,
                              `autoshadow-${item.id}.png`,
                              'image/png',
                              item.originalDims?.w,
                              item.originalDims?.h
                            )
                          }
                          className="text-xs py-1.5 px-3"
                        >
                          PNG
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            downloadResizedImage(
                              item.resultImage!,
                              `autoshadow-${item.id}.webp`,
                              'image/webp',
                              item.originalDims?.w,
                              item.originalDims?.h
                            )
                          }
                          className="text-xs py-1.5 px-3"
                        >
                          WebP
                        </Button>
                        {removeBgType !== 'transparent' && (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              downloadResizedImage(
                                item.resultImage!,
                                `autoshadow-${item.id}.jpg`,
                                'image/jpeg',
                                item.originalDims?.w,
                                item.originalDims?.h
                              )
                            }
                            className="text-xs py-1.5 px-3 bg-slate-800"
                          >
                            JPG
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Text analysis result */}
          {resultText && (
            <div className="w-full max-w-2xl bg-slate-900 p-6 rounded-xl border border-slate-800 overflow-y-auto max-h-[70vh]">
              <h3 className="text-xl font-bold text-emerald-400 mb-4 flex items-center gap-2">
                <span className="bg-emerald-500/10 p-1 rounded">✨</span> Análisis de Vehículo
              </h3>
              <div className="prose prose-invert prose-slate max-w-none whitespace-pre-wrap leading-relaxed">
                {resultText}
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
  );
};

export default ResultView;
