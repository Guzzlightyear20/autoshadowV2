import React, { useRef, useState, useCallback } from 'react';

interface Props {
  src: string;
  alt?: string;
  className?: string;
}

/**
 * Image with scroll-to-zoom, drag-to-pan, and double-click-to-reset.
 * Minimum scale = 1 (no zoom out beyond natural size).
 * Maximum scale = 8×.
 */
const ZoomableImage: React.FC<Props> = ({ src, alt = 'Resultado', className = '' }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => {
      const next = Math.min(8, Math.max(1, s - e.deltaY * 0.003));
      if (next === 1) setPos({ x: 0, y: 0 }); // snap back when fully zoomed out
      return next;
    });
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale <= 1) return;
      e.preventDefault();
      setDragging(true);
      dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    },
    [scale, pos]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !dragStart.current) return;
      setPos({
        x: dragStart.current.px + (e.clientX - dragStart.current.mx),
        y: dragStart.current.py + (e.clientY - dragStart.current.my),
      });
    },
    [dragging]
  );

  const stopDrag = useCallback(() => {
    setDragging(false);
    dragStart.current = null;
  }, []);

  const cursorStyle =
    scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in';

  return (
    <div
      className={`relative overflow-hidden select-none group ${className}`}
      style={{ cursor: cursorStyle }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onDoubleClick={reset}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          transform: `scale(${scale}) translate(${pos.x / scale}px, ${pos.y / scale}px)`,
          transformOrigin: 'center center',
          transition: dragging ? 'none' : 'transform 0.15s ease',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
        className="max-w-full max-h-[70vh] rounded-lg shadow-2xl object-contain border border-slate-800"
      />

      {/* Zoom-level badge */}
      {scale > 1 && (
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          <span className="bg-black/70 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
            {Math.round(scale * 100)}% &nbsp;·&nbsp; doble-clic para resetear
          </span>
        </div>
      )}

      {/* Hint on hover (only at 1×) */}
      {scale === 1 && (
        <div className="absolute bottom-2 right-2 bg-black/50 text-slate-400 text-xs px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Scroll para zoom · arrastra para mover
        </div>
      )}
    </div>
  );
};

export default ZoomableImage;
