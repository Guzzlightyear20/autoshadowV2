import React, { useState, useRef, useCallback } from 'react';

interface Props {
  before: string;
  after: string;
  isTransparent?: boolean;
}

const BeforeAfterSlider: React.FC<Props> = ({ before, after, isTransparent = false }) => {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clamped = Math.max(2, Math.min(clientX - rect.left, rect.width - 2));
    setPosition((clamped / rect.width) * 100);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    updatePosition(e.clientX);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) updatePosition(e.clientX);
  };
  const stopDrag = () => { isDragging.current = false; };
  const onTouchMove = (e: React.TouchEvent) => updatePosition(e.touches[0].clientX);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-lg cursor-col-resize"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onTouchMove={onTouchMove}
      onTouchEnd={stopDrag}
    >
      {/* Result image — full width underneath */}
      <div className={isTransparent ? 'bg-checkered' : 'bg-slate-950'}>
        <img src={after} alt="Resultado" className="w-full block max-h-[70vh] object-contain" draggable={false} />
      </div>

      {/* Original image — clipped to left side of the divider */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <div className={`w-full h-full flex items-center justify-center ${isTransparent ? 'bg-checkered' : 'bg-slate-950'}`}>
          <img src={before} alt="Original" className="w-full max-h-[70vh] object-contain" draggable={false} />
        </div>
      </div>

      {/* Vertical divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.9)] pointer-events-none"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        {/* Drag handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 bg-white rounded-full shadow-xl flex items-center justify-center border border-slate-200 pointer-events-none">
          <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full pointer-events-none">
        Original
      </div>
      <div className="absolute top-3 right-3 bg-blue-600/90 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full pointer-events-none">
        Resultado
      </div>
    </div>
  );
};

export default BeforeAfterSlider;
