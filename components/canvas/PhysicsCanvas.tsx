'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { Canvas as FabricCanvas, FabricObject } from 'fabric';
import type { Stroke, Point } from '@/lib/types';

const GHOST_COLOR = '#D1D5DB';
const GHOST_OPACITY = 0.5;

export interface PhysicsCanvasHandle {
  /** Returns a base64 PNG of the canvas (without ghost strokes). */
  takeSnapshot: () => string;
}

interface PhysicsCanvasProps {
  ghostStrokes: Stroke[];
  onStrokeComplete: (stroke: Stroke) => void;
  inkColor: string;
  inkWidth: number;
}

const PhysicsCanvas = forwardRef<PhysicsCanvasHandle, PhysicsCanvasProps>(
  function PhysicsCanvas({ ghostStrokes, onStrokeComplete, inkColor, inkWidth }, ref) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<FabricCanvas | null>(null);
    const ghostObjectsRef = useRef<FabricObject[]>([]);
    const currentPointsRef = useRef<Point[]>([]);
    const isDrawingRef = useRef(false);

    // Keep latest prop values accessible inside fabric event closures
    const inkColorRef = useRef(inkColor);
    const inkWidthRef = useRef(inkWidth);
    inkColorRef.current = inkColor;
    inkWidthRef.current = inkWidth;

    // Keep latest onStrokeComplete accessible without recreating fabric events
    const onStrokeCompleteRef = useRef(onStrokeComplete);
    onStrokeCompleteRef.current = onStrokeComplete;

    // Signals when Fabric is ready so the ghost-strokes effect can safely run
    const [fabricReady, setFabricReady] = useState(false);

    // ── Expose takeSnapshot ──────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      takeSnapshot() {
        const fc = fabricRef.current;
        if (!fc) return '';

        // Temporarily hide ghost strokes so only student work is captured
        ghostObjectsRef.current.forEach((obj) => {
          obj.set('visible', false);
        });
        fc.renderAll();

        const dataURL = fc.toDataURL({ format: 'png', quality: 0.85, multiplier: 1 });

        // Restore ghost strokes
        ghostObjectsRef.current.forEach((obj) => {
          obj.set('visible', true);
        });
        fc.renderAll();

        return dataURL.split(',')[1] ?? '';
      },
    }));

    // ── Initialize Fabric.js ─────────────────────────────────────────────────
    useEffect(() => {
      if (!canvasElRef.current || !wrapperRef.current) return;

      const wrapper = wrapperRef.current;
      let disposed = false;

      const init = async () => {
        const { Canvas, PencilBrush } = await import('fabric');
        if (disposed || !canvasElRef.current) return;

        const fc = new Canvas(canvasElRef.current, {
          isDrawingMode: true,
          backgroundColor: '#111827',
        });

        fc.setDimensions({ width: wrapper.offsetWidth, height: wrapper.offsetHeight });

        const brush = new PencilBrush(fc);
        brush.color = inkColorRef.current;
        brush.width = inkWidthRef.current;
        fc.freeDrawingBrush = brush;

        // ── Track pointer points (for pressure + onStrokeComplete data) ──────
        fc.on('mouse:down', (opt) => {
          isDrawingRef.current = true;
          const pressure = 'pressure' in opt.e ? (opt.e as PointerEvent).pressure : 0.5;
          currentPointsRef.current = [
            { x: opt.pointer.x, y: opt.pointer.y, pressure },
          ];
        });

        fc.on('mouse:move', (opt) => {
          if (!isDrawingRef.current) return;
          const pressure = 'pressure' in opt.e ? (opt.e as PointerEvent).pressure : 0.5;
          currentPointsRef.current.push({
            x: opt.pointer.x,
            y: opt.pointer.y,
            pressure,
          });
        });

        fc.on('mouse:up', () => {
          isDrawingRef.current = false;
          // Points are consumed in path:created (fired after mouse:up by PencilBrush)
        });

        fc.on('path:created', () => {
          const points = currentPointsRef.current;
          currentPointsRef.current = [];
          if (points.length < 2) return;

          onStrokeCompleteRef.current({
            points,
            color: inkColorRef.current,
            width: inkWidthRef.current,
          });
        });

        fabricRef.current = fc;
        setFabricReady(true);
      };

      void init();

      // ── Resize observer ───────────────────────────────────────────────────
      const ro = new ResizeObserver(() => {
        const fc = fabricRef.current;
        if (!fc || !wrapper) return;
        fc.setDimensions({ width: wrapper.offsetWidth, height: wrapper.offsetHeight });
        fc.renderAll();
      });
      ro.observe(wrapper);

      return () => {
        disposed = true;
        ro.disconnect();
        const fc = fabricRef.current;
        fabricRef.current = null;
        setFabricReady(false);
        if (fc) void fc.dispose();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Update brush when ink props change ───────────────────────────────────
    useEffect(() => {
      const fc = fabricRef.current;
      if (!fc?.freeDrawingBrush) return;
      fc.freeDrawingBrush.color = inkColor;
      fc.freeDrawingBrush.width = inkWidth;
    }, [inkColor, inkWidth]);

    // ── Render ghost strokes ─────────────────────────────────────────────────
    useEffect(() => {
      if (!fabricReady) return;
      const fc = fabricRef.current;
      if (!fc) return;

      // Remove previous ghost objects
      ghostObjectsRef.current.forEach((obj) => fc.remove(obj));
      ghostObjectsRef.current = [];

      if (ghostStrokes.length === 0) {
        fc.renderAll();
        return;
      }

      import('fabric')
        .then(({ Path }) => {
          // Guard: canvas might have been disposed between the import and this callback
          if (fabricRef.current !== fc) return;

          for (const stroke of ghostStrokes) {
            if (stroke.points.length < 2) continue;

            const pathData = stroke.points
              .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
              .join(' ');

            const ghostPath = new Path(pathData, {
              stroke: GHOST_COLOR,
              strokeWidth: stroke.width,
              fill: '',
              opacity: GHOST_OPACITY,
              selectable: false,
              evented: false,
              strokeLineCap: 'round',
              strokeLineJoin: 'round',
            });

            ghostObjectsRef.current.push(ghostPath as unknown as FabricObject);
            fc.add(ghostPath as unknown as FabricObject);
          }

          fc.renderAll();
        })
        .catch(console.error);
    }, [ghostStrokes, fabricReady]);

    return (
      <div ref={wrapperRef} className="canvas-wrapper absolute inset-0">
        <canvas ref={canvasElRef} />
      </div>
    );
  },
);

export default PhysicsCanvas;
