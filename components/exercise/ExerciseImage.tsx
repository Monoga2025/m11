'use client';

import { useRef, useState } from 'react';

interface ExerciseImageProps {
  imageUrl: string;
}

type DragKind = 'move' | 'resize';

interface DragState {
  kind: DragKind;
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
}

const MIN_WIDTH = 160;
const MIN_HEIGHT = 120;
const INITIAL_WIDTH = 320;
const INITIAL_HEIGHT = 240;

export default function ExerciseImage({ imageUrl }: ExerciseImageProps) {
  const [position, setPosition] = useState({ left: 16, top: 16 });
  const [size, setSize] = useState({ width: INITIAL_WIDTH, height: INITIAL_HEIGHT });
  const [isMinimized, setIsMinimized] = useState(false);

  const dragRef = useRef<DragState | null>(null);

  // ── Generic drag start ───────────────────────────────────────────────────
  function startDrag(e: React.PointerEvent<HTMLElement>, kind: DragKind) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLeft: position.left,
      startTop: position.top,
      startWidth: size.width,
      startHeight: size.height,
    };
  }

  function onDragMove(e: React.PointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;

    if (d.kind === 'move') {
      setPosition({ left: d.startLeft + dx, top: d.startTop + dy });
    } else {
      setSize({
        width: Math.max(MIN_WIDTH, d.startWidth + dx),
        height: Math.max(MIN_HEIGHT, d.startHeight + dy),
      });
    }
  }

  function endDrag() {
    dragRef.current = null;
  }

  return (
    <div
      className="absolute z-20 rounded-xl overflow-hidden shadow-2xl border border-gray-700 bg-gray-900 select-none"
      style={{ left: position.left, top: position.top, width: size.width }}
    >
      {/* ── Header / drag handle ─────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-800 cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => startDrag(e, 'move')}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="text-xs font-medium text-gray-400 pointer-events-none">
          Ejercicio
        </span>
        <button
          className="flex-shrink-0 text-gray-400 hover:text-white transition-colors text-xs leading-none px-1"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setIsMinimized((v) => !v)}
          aria-label={isMinimized ? 'Expandir' : 'Minimizar'}
        >
          {isMinimized ? '▲' : '▼'}
        </button>
      </div>

      {/* ── Image area ───────────────────────────────────────────────────── */}
      {!isMinimized && (
        <div className="relative" style={{ height: size.height }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next-eslint/no-img-element
            <img
              src={imageUrl}
              alt="Ejercicio de física"
              className="w-full h-full object-contain bg-white"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-gray-500 gap-1">
              <span className="text-2xl">📐</span>
              <span className="text-xs">Sin imagen</span>
              <span className="text-xs opacity-60">Carga un ejercicio</span>
            </div>
          )}

          {/* ── Resize handle (bottom-right corner) ────────────────────── */}
          <div
            className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize"
            style={{
              background: 'linear-gradient(135deg, transparent 50%, #6B7280 50%)',
            }}
            onPointerDown={(e) => startDrag(e, 'resize')}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-label="Redimensionar"
          />
        </div>
      )}
    </div>
  );
}
