export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  width: number;
}

/**
 * Same shape as Stroke.
 * When returned by analyzeExercise, points use normalized coordinates (0–1).
 * Scale to canvas pixels before passing to PhysicsCanvas as ghostStrokes.
 */
export type StrokeData = Stroke;

export interface ExerciseAnalysis {
  isCorrect: boolean;
  nextStep: string;
  tip: string;
}

export interface AnalysisResult extends ExerciseAnalysis {
  ghostStroke: StrokeData;
}

export interface AnalysisContext {
  /**
   * Steps the student has already completed, in order (max 5 are used).
   * Each string is the `nextStep` text from a prior AI response.
   */
  previousSteps: string[];
  /**
   * Optional free-form hint about the exercise topic.
   * Include 'MRUA' to inject kinematic base formulas into the AI prompt.
   */
  topicHint?: string;
}
