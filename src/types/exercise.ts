export type SectionKind = 'exercise' | 'practice';

export type QuestionTopic =
  | 'Histogram'
  | 'Cumulative Frequency'
  | 'Frequency Table';

export interface HistogramBar {
  x0: number;
  x1: number;
  y: number;
  label?: string;
  color?: string;
  highlightOnSolve?: boolean;
}

export interface HistogramSpec {
  kind: 'histogram';
  title?: string;
  xLabel: string;
  yLabel: string;
  xMin: number;
  xMax: number;
  xTickStep: number;
  xMinorSubdivisions: number;
  yMin: number;
  yMax: number;
  yTickStep: number;
  yMinorSubdivisions: number;
  discreteLabels?: string[];
  bars: HistogramBar[];
  showGrid?: boolean;
  unitSuffix?: string;
}

export interface CurvePoint {
  x: number;
  y: number;
  showDot?: boolean;
}

export interface GuideLine {
  x: number;
  y: number;
  color: string;
  label?: string;
}

export interface CumulativeCurveSpec {
  kind: 'cumulative';
  title?: string;
  xLabel: string;
  yLabel: string;
  xMin: number;
  xMax: number;
  xDisplayStart?: number;
  hasAxisBreak?: boolean;
  xTickStep: number;
  xMinorSubdivisions: number;
  yMin: number;
  yMax: number;
  yTickStep: number;
  yMinorSubdivisions: number;
  curveColor: string;
  points: CurvePoint[];
  staticGuides?: GuideLine[];
  solveGuide?: GuideLine;
  xUnit?: string;
}

export interface TableSpec {
  kind: 'table';
  caption?: string;
  headers: string[];
  rows: (string | number)[][];
  highlightRowIndex?: number;
  footerRow?: (string | number)[];
}

export type VisualSpec = HistogramSpec | CumulativeCurveSpec | TableSpec;

export interface MultipleChoiceOption {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface EssayConfig {
  expectedNumericValue: number;
  unit?: string;
  keyWorkingTokens: string[];
  modelAnswer: string;
}

export interface ExerciseQuestion {
  id: string; // e.g. 'ex-1' .. 'ex-10', 'pr-1' .. 'pr-12'
  number: number; // 1..10 for Exercise, 1..12 for Practice
  originalPdfNo: number;
  section: SectionKind;
  topic: QuestionTopic;
  type: 'mcq' | 'essay';
  prompt: string;
  subPrompt?: string;
  visual: VisualSpec;
  alternateVisual?: CumulativeCurveSpec;
  visualNote?: string;
  options?: MultipleChoiceOption[];
  correctAnswer: string;
  essayConfig?: EssayConfig;
  explanation: string;
}

export interface QuestionProgress {
  attempts: string[];
  solved: boolean;
  revealed: boolean;
  pointsEarned: number;
  solvedOnTrial: number | null;
  essayText?: string;
  essayFinalValue?: string;
  essayFeedback?: string;
}

export interface FocusViolation {
  timestamp: string;
  reason: 'tab-switch' | 'window-blur' | 'exit-fullscreen';
  questionNumber: number;
}

export const PRACTICE_MCQ_TRIAL_POINTS: readonly [number, number, number, number] = [
  10, 9, 8.5, 8,
];
export const ESSAY_MAX_POINTS = 50;
export const MAX_TRIALS = 4;
export const PRACTICE_MAX_SCORE = 10 * 10 + 2 * 50; // 200
