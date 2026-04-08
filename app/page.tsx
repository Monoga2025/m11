'use client';

import { useCallback, useRef, useState } from 'react';
import PhysicsCanvas, {
  type PhysicsCanvasHandle,
} from '@/components/canvas/PhysicsCanvas';
import ExerciseImage from '@/components/exercise/ExerciseImage';
import type { AnalysisResult, Stroke } from '@/lib/types';

const BOTTOM_BAR_H = 64; // px — keep in sync with the bottom bar's h-16

const INK_COLORS: Array<{ label: string; value: string }> = [
  { label: 'Negro',  value: '#1F2937' },
  { label: 'Azul',   value: '#2563EB' },
  { label: 'Rojo',   value: '#DC2626' },
  { label: 'Verde',  value: '#16A34A' },
];

export default function Home() {
  const canvasRef = useRef<PhysicsCanvasHandle>(null);
  // Holds the last AI-suggested nextStep until the student draws, then moves it to previousSteps
  const pendingStepRef = useRef<string | null>(null);

  const [inkColor, setInkColor] = useState(INK_COLORS[0].value);
  const [ghostStrokes, setGhostStrokes] = useState<Stroke[]>([]);
  const [exerciseUrl, setExerciseUrl] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [previousSteps, setPreviousSteps] = useState<string[]>([]);

  // ── Stroke complete ──────────────────────────────────────────────────────
  const handleStrokeComplete = useCallback((_stroke: Stroke) => {
    setGhostStrokes([]);
    // Commit the pending step hint into history once the student actually draws
    const pending = pendingStepRef.current;
    if (pending) {
      pendingStepRef.current = null;
      setPreviousSteps((prev) => [...prev.slice(-4), pending]); // keep last 5
    }
  }, []);

  // ── Help (AI analysis) ───────────────────────────────────────────────────
  const handleHelp = useCallback(async () => {
    if (isAnalyzing) return;

    const snapshot = canvasRef.current?.takeSnapshot() ?? '';

    setIsAnalyzing(true);
    try {
      const exerciseBase64 = exerciseUrl.startsWith('data:')
        ? exerciseUrl.split(',')[1] ?? ''
        : '';

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseImage: exerciseBase64,
          canvasImage: snapshot,
          previousSteps,
        }),
      });

      if (!res.ok) {
        const { error } = (await res.json()) as { error: string };
        throw new Error(error);
      }

      const result = (await res.json()) as AnalysisResult;
      setAnalysis(result);
      // Stage the next step — it enters previousSteps once the student draws
      pendingStepRef.current = result.nextStep;

      // Scale ghost stroke from normalized (0–1) to canvas pixel space
      if (result.ghostStroke.points.length > 0) {
        const cw = window.innerWidth;
        const ch = window.innerHeight - BOTTOM_BAR_H;

        const scaledStroke: Stroke = {
          ...result.ghostStroke,
          points: result.ghostStroke.points.map((p) => ({
            x: p.x * cw,
            y: p.y * ch,
          })),
        };
        setGhostStrokes([scaledStroke]);
      }
    } catch (err) {
      console.error('Error de análisis:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing, exerciseUrl]);

  // ── New exercise (file picker) ───────────────────────────────────────────
  const handleNewExercise = useCallback(() => {
    setGhostStrokes([]);
    setAnalysis(null);
    setPreviousSteps([]);
    pendingStepRef.current = null;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setExerciseUrl(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      {/* ── Full-screen drawing canvas ─────────────────────────────────── */}
      <PhysicsCanvas
        ref={canvasRef}
        ghostStrokes={ghostStrokes}
        onStrokeComplete={handleStrokeComplete}
        inkColor={inkColor}
        inkWidth={2}
      />

      {/* ── Floating exercise image ────────────────────────────────────── */}
      <ExerciseImage imageUrl={exerciseUrl} />

      {/* ── AI tip overlay ─────────────────────────────────────────────── */}
      {analysis && (
        <div className="absolute top-4 right-4 z-30 max-w-xs rounded-xl bg-gray-900/95 p-4 shadow-2xl backdrop-blur-sm border border-gray-700">
          <p
            className={`text-sm font-semibold ${
              analysis.isCorrect ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {analysis.isCorrect ? '✓ Correcto' : '✗ Revisa'}
          </p>
          <p className="mt-1 text-sm text-gray-200 leading-snug">{analysis.nextStep}</p>
          <p className="mt-2 text-xs text-gray-400 italic">{analysis.tip}</p>
          <button
            className="mt-3 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            onClick={() => { setAnalysis(null); setGhostStrokes([]); }}
          >
            Cerrar
          </button>
        </div>
      )}

      {/* ── Bottom bar ─────────────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-30 h-16 flex items-center justify-between px-5 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800">
        {/* Ink color selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 mr-1">Tinta</span>
          {INK_COLORS.map((color) => (
            <button
              key={color.value}
              onClick={() => setInkColor(color.value)}
              title={color.label}
              className={`w-7 h-7 rounded-full border-2 transition-transform ${
                inkColor === color.value
                  ? 'border-white scale-110 shadow-md'
                  : 'border-gray-600 hover:scale-105'
              }`}
              style={{ backgroundColor: color.value }}
              aria-label={`Color ${color.label}`}
            />
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleHelp()}
            disabled={isAnalyzing}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {isAnalyzing ? 'Analizando…' : 'Ayuda'}
          </button>
          <button
            onClick={handleNewExercise}
            className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors"
          >
            Nuevo ejercicio
          </button>
        </div>
      </div>
    </main>
  );
}
