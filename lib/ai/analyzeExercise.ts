import type { AnalysisResult, AnalysisContext, StrokeData } from '@/lib/types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'deepseek/deepseek-v3-base';

// NOTE: deepseek-v3-base is a text-only model.
// For actual image analysis swap MODEL for a multimodal model,
// e.g. "google/gemini-2.0-flash" or "anthropic/claude-3.5-sonnet".

const MAX_RETRIES = 2;        // 3 total attempts (initial + 2 retries)
const RETRY_BASE_MS = 600;    // 600 ms, 1 200 ms
const MAX_PREV_STEPS = 5;     // older steps are dropped to keep the prompt tight

// ── MRUA detection ────────────────────────────────────────────────────────────

const MRUA_KEYWORDS = [
  'mrua',
  'mruv',
  'uniformemente acelerado',
  'aceleración constante',
] as const;

const MRUA_FORMULAS = `
Fórmulas MRUA (Movimiento Rectilíneo Uniformemente Acelerado):
  v  = v₀ + a·t
  x  = x₀ + v₀·t + ½·a·t²
  v² = v₀² + 2·a·(x − x₀)
  a  = (v − v₀) / t   [aceleración constante]
`.trim();

function isMRUAContext(context: AnalysisContext): boolean {
  if (context.topicHint?.toLowerCase().includes('mrua')) return true;
  const text = [context.topicHint ?? '', ...context.previousSteps].join(' ').toLowerCase();
  return MRUA_KEYWORDS.some((kw) => text.includes(kw));
}

// ── Ghost stroke (normalized 0–1 coords) ─────────────────────────────────────

type CanvasRegion =
  | 'top-left'
  | 'top-right'
  | 'center'
  | 'bottom-left'
  | 'bottom-right';

const VALID_REGIONS: readonly CanvasRegion[] = [
  'top-left', 'top-right', 'center', 'bottom-left', 'bottom-right',
];

/**
 * Returns a two-point ghost stroke in normalized (0–1) coordinates.
 * The caller (page.tsx) is responsible for scaling to canvas pixels.
 */
function buildGhostStroke(region: CanvasRegion = 'center'): StrokeData {
  const regionPoints: Record<CanvasRegion, [{ x: number; y: number }, { x: number; y: number }]> = {
    'top-left':     [{ x: 0.05, y: 0.15 }, { x: 0.40, y: 0.15 }],
    'top-right':    [{ x: 0.55, y: 0.15 }, { x: 0.92, y: 0.15 }],
    center:         [{ x: 0.15, y: 0.50 }, { x: 0.85, y: 0.50 }],
    'bottom-left':  [{ x: 0.05, y: 0.75 }, { x: 0.40, y: 0.75 }],
    'bottom-right': [{ x: 0.55, y: 0.75 }, { x: 0.92, y: 0.75 }],
  };

  return {
    points: regionPoints[region].map((p) => ({ ...p })),
    color: '#D1D5DB',
    width: 3,
  };
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────

/**
 * Fetches `url` with up to `maxRetries` retries on network errors or HTTP 5xx.
 * 4xx responses are returned immediately (non-retryable).
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries: number,
): Promise<Response> {
  let lastError: Error = new Error('No attempts made');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);

      // Success, or a client error (4xx) that retrying won't fix
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res;
      }

      // 5xx: consume body and mark for retry
      const body = await res.text();
      lastError = new Error(`OpenRouter ${res.status}: ${body}`);
    } catch (err) {
      // Network-level error (DNS, timeout, etc.)
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < maxRetries) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, RETRY_BASE_MS * (attempt + 1)),
      );
    }
  }

  throw lastError;
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildSystemPrompt(mrua: boolean): string {
  const base =
    'Eres un tutor experto en Dinámica de Ingeniería (Beer & Johnston). ' +
    'Responde ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.';

  return mrua ? `${base}\n\n${MRUA_FORMULAS}` : base;
}

interface AIResponse {
  isCorrect: boolean;
  nextStep: string;
  tip: string;
  region?: CanvasRegion;
}

function buildUserMessage(
  exerciseImage: string,
  canvasImage: string,
  context: AnalysisContext,
): { role: 'user'; content: unknown } {
  const recentSteps = context.previousSteps.slice(-MAX_PREV_STEPS);

  // ── Build prompt text ──────────────────────────────────────────────────
  const lines: string[] = [];

  if (recentSteps.length > 0) {
    lines.push('Pasos ya completados por el estudiante:');
    recentSteps.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
    lines.push('');
  }

  lines.push(
    'Analiza el ejercicio de física (imagen 1) y el trazo actual del estudiante (imagen 2).',
    '',
    'Responde ÚNICAMENTE con este JSON (sin markdown, sin texto extra):',
    '{',
    '  "isCorrect": boolean,',
    '  "nextStep": "qué debe hacer el estudiante a continuación en español (máx 120 chars)",',
    '  "tip": "concepto o fórmula de Beer & Johnston relevante en español (máx 100 chars)",',
    '  "region": "zona del canvas donde continuar: top-left | top-right | center | bottom-left | bottom-right"',
    '}',
  );

  const promptText = lines.join('\n');
  const hasImages = exerciseImage.length > 0 && canvasImage.length > 0;

  if (hasImages) {
    return {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${exerciseImage}` } },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${canvasImage}` } },
        { type: 'text', text: promptText },
      ],
    };
  }

  return { role: 'user', content: promptText };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Calls OpenRouter to analyze a physics exercise and the student's current work.
 *
 * @param exerciseImage - Base64-encoded PNG of the exercise problem ('' if unavailable)
 * @param canvasImage   - Base64-encoded PNG of the student's current canvas ('' if unavailable)
 * @param context       - Previous steps + optional topic hint for formula injection
 *
 * Returns an `AnalysisResult` whose `ghostStroke.points` are in normalized (0–1) space.
 * Scale them to canvas pixels before passing to `PhysicsCanvas`.
 */
export async function analyzeExercise(
  exerciseImage: string,
  canvasImage: string,
  context: AnalysisContext = { previousSteps: [] },
): Promise<AnalysisResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const mrua = isMRUAContext(context);

  const response = await fetchWithRetry(
    OPENROUTER_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
        'X-Title': 'PhysicsInk',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt(mrua) },
          buildUserMessage(exerciseImage, canvasImage, context),
        ],
        temperature: 0.2,
        max_tokens: 350,
      }),
    },
    MAX_RETRIES,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const raw = data.choices[0]?.message?.content?.trim() ?? '';

  // Strip markdown code fences if the model wraps the JSON
  const jsonStr = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: AIResponse;
  try {
    parsed = JSON.parse(jsonStr) as AIResponse;
  } catch {
    throw new Error(`Could not parse AI response as JSON: ${raw}`);
  }

  const region: CanvasRegion =
    parsed.region !== undefined && (VALID_REGIONS as readonly string[]).includes(parsed.region)
      ? parsed.region
      : 'center';

  return {
    isCorrect: Boolean(parsed.isCorrect),
    nextStep: String(parsed.nextStep ?? ''),
    tip: String(parsed.tip ?? ''),
    ghostStroke: buildGhostStroke(region),
  };
}
