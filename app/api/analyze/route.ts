import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { analyzeExercise } from '@/lib/ai/analyzeExercise';
import type { AnalysisResult, AnalysisContext } from '@/lib/types';

interface RequestBody {
  exerciseImage: string;
  canvasImage: string;
  previousSteps?: string[];
  topicHint?: string;
}

function isValidBody(value: unknown): value is RequestBody {
  if (typeof value !== 'object' || value === null) return false;

  const b = value as Record<string, unknown>;

  if (typeof b.exerciseImage !== 'string' || typeof b.canvasImage !== 'string') {
    return false;
  }

  if (b.previousSteps !== undefined) {
    if (
      !Array.isArray(b.previousSteps) ||
      !(b.previousSteps as unknown[]).every((s) => typeof s === 'string')
    ) {
      return false;
    }
  }

  if (b.topicHint !== undefined && typeof b.topicHint !== 'string') {
    return false;
  }

  return true;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AnalysisResult | { error: string }>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      {
        error:
          'Body must contain exerciseImage: string, canvasImage: string. ' +
          'Optional: previousSteps: string[], topicHint: string.',
      },
      { status: 400 },
    );
  }

  const context: AnalysisContext = {
    previousSteps: body.previousSteps ?? [],
    topicHint: body.topicHint,
  };

  try {
    const result = await analyzeExercise(body.exerciseImage, body.canvasImage, context);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
