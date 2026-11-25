import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExerciseWorkspace } from './components/ExerciseWorkspace';
import { PracticeWorkspace } from './components/PracticeWorkspace';
import { ResultsView } from './components/ResultsView';
import {
  EXERCISE_PART_QUESTIONS,
  PRACTICE_PART_QUESTIONS,
} from './data/questions';
import {
  FocusViolation,
  MAX_TRIALS,
  PRACTICE_MCQ_TRIAL_POINTS,
  QuestionProgress,
  SectionKind,
} from './types/exercise';
import { practiceAlarm } from './utils/alarmAudio';
import {
  evaluateEssayResponse,
  generatePracticePdfBase64,
} from './utils/reportGenerator';

type ActiveView = 'exercise' | 'practice' | 'results';

export interface AutoEmailState {
  status: 'idle' | 'sending' | 'sent' | 'unconfigured' | 'error';
  sentAt?: string;
  message?: string;
  provider?: 'resend' | 'smtp' | null;
}

const STORAGE_KEY = 'hcf_exercise_practice_v2';

interface StoredState {
  studentName: string;
  exerciseIndex: number;
  practiceIndex: number;
  progressMap: Record<string, QuestionProgress>;
  violations: FocusViolation[];
  lastSavedAt: string | null;
  sentSignature: string | null;
  sentAt: string | null;
}

function formatSaveTime(): string {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function loadStoredState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        studentName: '',
        exerciseIndex: 0,
        practiceIndex: 0,
        progressMap: {},
        violations: [],
        lastSavedAt: null,
        sentSignature: null,
        sentAt: null,
      };
    }
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      studentName: typeof parsed.studentName === 'string' ? parsed.studentName : '',
      exerciseIndex:
        typeof parsed.exerciseIndex === 'number' &&
        parsed.exerciseIndex >= 0 &&
        parsed.exerciseIndex < EXERCISE_PART_QUESTIONS.length
          ? parsed.exerciseIndex
          : 0,
      practiceIndex:
        typeof parsed.practiceIndex === 'number' &&
        parsed.practiceIndex >= 0 &&
        parsed.practiceIndex < PRACTICE_PART_QUESTIONS.length
          ? parsed.practiceIndex
          : 0,
      progressMap: parsed.progressMap ?? {},
      violations: Array.isArray(parsed.violations) ? parsed.violations : [],
      lastSavedAt:
        typeof parsed.lastSavedAt === 'string' ? parsed.lastSavedAt : null,
      sentSignature:
        typeof parsed.sentSignature === 'string' ? parsed.sentSignature : null,
      sentAt: typeof parsed.sentAt === 'string' ? parsed.sentAt : null,
    };
  } catch {
    return {
      studentName: '',
      exerciseIndex: 0,
      practiceIndex: 0,
      progressMap: {},
      violations: [],
      lastSavedAt: null,
      sentSignature: null,
      sentAt: null,
    };
  }
}

export default function App() {
  const [initial] = useState<StoredState>(() => loadStoredState());
  const [activeView, setActiveView] = useState<ActiveView>('exercise');
  const [studentName, setStudentName] = useState<string>(initial.studentName);
  const [exerciseIndex, setExerciseIndex] = useState<number>(initial.exerciseIndex);
  const [practiceIndex, setPracticeIndex] = useState<number>(initial.practiceIndex);
  const [progressMap, setProgressMap] = useState<Record<string, QuestionProgress>>(
    initial.progressMap
  );
  const [violations, setViolations] = useState<FocusViolation[]>(initial.violations);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initial.lastSavedAt);
  const [sentSignature, setSentSignature] = useState<string | null>(
    initial.sentSignature
  );
  const [autoEmailState, setAutoEmailState] = useState<AutoEmailState>(() =>
    initial.sentSignature
      ? { status: 'sent', sentAt: initial.sentAt ?? undefined }
      : { status: 'idle' }
  );
  const inFlightSigRef = useRef<string | null>(null);

  const practiceCompleted = PRACTICE_PART_QUESTIONS.every((q) => {
    const p = progressMap[q.id];
    if (!p) return false;
    if (q.type === 'essay') return p.solved || p.revealed || p.attempts.length > 0;
    return p.solved || p.revealed || p.attempts.length >= MAX_TRIALS;
  });

  const practiceSignature = useMemo(() => {
    if (!practiceCompleted || !studentName.trim()) return null;
    const practiceOnly: Record<string, QuestionProgress> = {};
    for (const q of PRACTICE_PART_QUESTIONS) {
      if (progressMap[q.id]) {
        practiceOnly[q.id] = progressMap[q.id];
      }
    }
    return JSON.stringify({
      studentName: studentName.trim(),
      practiceOnly,
      violationCount: violations.length,
    });
  }, [practiceCompleted, studentName, progressMap, violations.length]);

  const persistNow = useCallback(
    (
      name: string,
      exIdx: number,
      prIdx: number,
      map: Record<string, QuestionProgress>,
      viols: FocusViolation[],
      sentSig: string | null,
      sentAtVal?: string
    ) => {
      const savedTime = formatSaveTime();
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            studentName: name,
            exerciseIndex: exIdx,
            practiceIndex: prIdx,
            progressMap: map,
            violations: viols,
            lastSavedAt: savedTime,
            sentSignature: sentSig,
            sentAt: sentAtVal ?? null,
          })
        );
        setLastSavedAt(savedTime);
      } catch {
        // Ignore storage quota issues
      }
    },
    []
  );

  useEffect(() => {
    persistNow(
      studentName,
      exerciseIndex,
      practiceIndex,
      progressMap,
      violations,
      sentSignature,
      autoEmailState.sentAt
    );
  }, [
    studentName,
    exerciseIndex,
    practiceIndex,
    progressMap,
    violations,
    sentSignature,
    autoEmailState.sentAt,
    persistNow,
  ]);

  const sendScoreAutomatically = useCallback(
    async (forceResend = false) => {
      if (!practiceCompleted || !studentName.trim() || !practiceSignature) {
        return;
      }
      if (!forceResend) {
        if (
          sentSignature === practiceSignature ||
          inFlightSigRef.current === practiceSignature
        ) {
          return;
        }
      }

      inFlightSigRef.current = practiceSignature;
      setAutoEmailState((prev) => ({ ...prev, status: 'sending', message: undefined }));

      try {
        let pdfBase64 = '';
        try {
          pdfBase64 = generatePracticePdfBase64(
            studentName,
            EXERCISE_PART_QUESTIONS,
            PRACTICE_PART_QUESTIONS,
            progressMap,
            violations
          ).base64;
        } catch {
          // Proceed without PDF attachment if browser PDF serialization fails
        }

        const res = await fetch('/api/send-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentName: studentName.trim(),
            progressMap,
            violations,
            pdfBase64,
            forceResend,
          }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          sent?: boolean;
          configured?: boolean;
          sentAt?: string;
          provider?: 'resend' | 'smtp' | null;
          message?: string;
          error?: string;
        };

        if (res.ok && data.sent) {
          setSentSignature(practiceSignature);
          setAutoEmailState({
            status: 'sent',
            sentAt: data.sentAt ?? formatSaveTime(),
            provider: data.provider ?? null,
            message: undefined,
          });
        } else if (data.configured === false) {
          setAutoEmailState({
            status: 'unconfigured',
            provider: null,
            message:
              data.message ||
              'Server email delivery is not configured yet in Secrets.',
          });
        } else {
          setAutoEmailState({
            status: 'error',
            message:
              data.error ||
              data.message ||
              'Automatic email delivery failed. Please retry or use the mail fallback.',
          });
        }
      } catch {
        setAutoEmailState({
          status: 'error',
          message:
            'Could not reach the server to send the email automatically.',
        });
      } finally {
        if (inFlightSigRef.current === practiceSignature) {
          inFlightSigRef.current = null;
        }
      }
    },
    [
      practiceCompleted,
      studentName,
      practiceSignature,
      sentSignature,
      progressMap,
      violations,
    ]
  );

  // Automatically email final score to fitriar@semesta.sch.id once Practice Q1-12 is completed
  useEffect(() => {
    if (
      practiceCompleted &&
      studentName.trim().length > 0 &&
      practiceSignature &&
      sentSignature !== practiceSignature
    ) {
      void sendScoreAutomatically(false);
    }
  }, [
    practiceCompleted,
    studentName,
    practiceSignature,
    sentSignature,
    sendScoreAutomatically,
  ]);

  const handleManualSave = () => {
    persistNow(
      studentName,
      exerciseIndex,
      practiceIndex,
      progressMap,
      violations,
      sentSignature,
      autoEmailState.sentAt
    );
  };

  // Exercise (Ungraded, Q1-10)
  const handleExerciseSubmit = (questionId: string, guess: string) => {
    const question = EXERCISE_PART_QUESTIONS.find((q) => q.id === questionId);
    if (!question) return;

    setProgressMap((prev) => {
      const current: QuestionProgress = prev[questionId] ?? {
        attempts: [],
        solved: false,
        revealed: false,
        pointsEarned: 0,
        solvedOnTrial: null,
      };
      if (current.solved || current.revealed || current.attempts.includes(guess)) {
        return prev;
      }
      const nextAttempts = [...current.attempts, guess];
      const isCorrect = guess === question.correctAnswer;
      return {
        ...prev,
        [questionId]: {
          ...current,
          attempts: nextAttempts,
          solved: isCorrect,
          pointsEarned: 0,
          solvedOnTrial: isCorrect ? nextAttempts.length : null,
        },
      };
    });
  };

  // Practice MCQ (Q1-10: 10, 9, 8.5, 8 pts)
  const handlePracticeMcqSubmit = (questionId: string, guess: string) => {
    const question = PRACTICE_PART_QUESTIONS.find((q) => q.id === questionId);
    if (!question) return;

    setProgressMap((prev) => {
      const current: QuestionProgress = prev[questionId] ?? {
        attempts: [],
        solved: false,
        revealed: false,
        pointsEarned: 0,
        solvedOnTrial: null,
      };
      if (
        current.solved ||
        current.revealed ||
        current.attempts.length >= MAX_TRIALS ||
        current.attempts.includes(guess)
      ) {
        return prev;
      }
      const nextAttempts = [...current.attempts, guess];
      const trialNumber = nextAttempts.length;
      const isCorrect = guess === question.correctAnswer;

      return {
        ...prev,
        [questionId]: {
          ...current,
          attempts: nextAttempts,
          solved: isCorrect,
          pointsEarned: isCorrect
            ? PRACTICE_MCQ_TRIAL_POINTS[trialNumber - 1] ?? 0
            : 0,
          solvedOnTrial: isCorrect ? trialNumber : null,
        },
      };
    });
  };

  // Practice Essay (Q11-12: 50 pts each)
  const handlePracticeEssaySubmit = (
    questionId: string,
    essayText: string,
    finalValue: string
  ) => {
    const question = PRACTICE_PART_QUESTIONS.find((q) => q.id === questionId);
    if (!question) return;

    const evaluation = evaluateEssayResponse(question, essayText, finalValue);

    setProgressMap((prev) => ({
      ...prev,
      [questionId]: {
        attempts: [finalValue],
        solved: evaluation.solved,
        revealed: false,
        pointsEarned: evaluation.points,
        solvedOnTrial: evaluation.solved ? 1 : null,
        essayText,
        essayFinalValue: finalValue,
        essayFeedback: evaluation.feedback,
      },
    }));
  };

  const handleRevealAnswer = (questionId: string) => {
    setProgressMap((prev) => {
      const current: QuestionProgress = prev[questionId] ?? {
        attempts: [],
        solved: false,
        revealed: false,
        pointsEarned: 0,
        solvedOnTrial: null,
      };
      if (current.solved) return prev;
      return {
        ...prev,
        [questionId]: {
          ...current,
          revealed: true,
          pointsEarned: 0,
        },
      };
    });
  };

  const handleResetExerciseQuestion = (questionId: string) => {
    setProgressMap((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const handleRecordViolation = useCallback((violation: FocusViolation) => {
    setViolations((prev) => [...prev, violation]);
  }, []);

  const handleResetAll = () => {
    practiceAlarm.stop();
    setProgressMap({});
    setViolations([]);
    setSentSignature(null);
    setAutoEmailState({ status: 'idle' });
    setExerciseIndex(0);
    setPracticeIndex(0);
    setActiveView('exercise');
  };

  const handleOpenQuestion = (section: SectionKind, index: number) => {
    if (section === 'exercise') {
      setExerciseIndex(index);
      setActiveView('exercise');
    } else {
      setPracticeIndex(index);
      setActiveView('practice');
    }
  };

  return (
    <div className="min-h-screen flex flex-col text-slate-900">
      {/* Strict 3-Zone Top Bar */}
      <header className="bg-white/95 backdrop-blur-sm border-b border-purple-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveView('exercise')}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer text-left"
          >
            Histograms &amp; Cumulative Frequency
          </button>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav
            className="hidden md:flex items-center gap-6 text-sm font-medium"
            aria-label="Primary navigation"
          >
            <button
              type="button"
              onClick={() => setActiveView('exercise')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'exercise'
                  ? 'border-purple-800 text-slate-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Exercise
            </button>
            <button
              type="button"
              onClick={() => setActiveView('practice')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'practice'
                  ? 'border-purple-800 text-slate-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Practice
            </button>
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('results')}
              className="px-4 py-2 text-xs font-medium text-white bg-purple-900 hover:bg-purple-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Final Score
            </button>
          </div>
        </div>

        {/* Mobile Secondary Navigation Row */}
        <div className="md:hidden border-t border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveView('exercise')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeView === 'exercise'
                ? 'bg-purple-900 text-white'
                : 'text-slate-600 bg-slate-100'
            }`}
          >
            Exercise
          </button>
          <button
            type="button"
            onClick={() => setActiveView('practice')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeView === 'practice'
                ? 'bg-purple-900 text-white'
                : 'text-slate-600 bg-slate-100'
            }`}
          >
            Practice
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeView === 'exercise' && (
          <ExerciseWorkspace
            studentName={studentName}
            onChangeStudentName={setStudentName}
            lastSavedAt={lastSavedAt}
            onSaveProgress={handleManualSave}
            questions={EXERCISE_PART_QUESTIONS}
            currentIndex={exerciseIndex}
            progressMap={progressMap}
            onSelectQuestion={setExerciseIndex}
            onSubmitAnswer={handleExerciseSubmit}
            onRevealAnswer={handleRevealAnswer}
            onResetQuestion={handleResetExerciseQuestion}
            onGoToPractice={() => setActiveView('practice')}
          />
        )}

        {activeView === 'practice' && (
          <PracticeWorkspace
            studentName={studentName}
            onChangeStudentName={setStudentName}
            lastSavedAt={lastSavedAt}
            onSaveProgress={handleManualSave}
            questions={PRACTICE_PART_QUESTIONS}
            currentIndex={practiceIndex}
            progressMap={progressMap}
            violations={violations}
            onRecordViolation={handleRecordViolation}
            onSelectQuestion={setPracticeIndex}
            onSubmitMcqAnswer={handlePracticeMcqSubmit}
            onSubmitEssayAnswer={handlePracticeEssaySubmit}
            onRevealAnswer={handleRevealAnswer}
            onFinishPractice={() => setActiveView('results')}
          />
        )}

        {activeView === 'results' && (
          <ResultsView
            studentName={studentName}
            onChangeStudentName={setStudentName}
            exerciseQuestions={EXERCISE_PART_QUESTIONS}
            practiceQuestions={PRACTICE_PART_QUESTIONS}
            progressMap={progressMap}
            violations={violations}
            autoEmailState={autoEmailState}
            onRetryAutoSend={(force) => {
              void sendScoreAutomatically(force);
            }}
            onJumpToPracticeQuestion={(idx) => handleOpenQuestion('practice', idx)}
            onResetAll={handleResetAll}
          />
        )}
      </main>
    </div>
  );
}
