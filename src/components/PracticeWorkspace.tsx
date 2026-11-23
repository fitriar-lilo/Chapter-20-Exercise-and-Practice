import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookmarkCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  HelpCircle,
  Lock,
  ShieldAlert,
  User,
  Volume2,
  XCircle,
} from 'lucide-react';
import {
  ESSAY_MAX_POINTS,
  ExerciseQuestion,
  FocusViolation,
  MAX_TRIALS,
  PRACTICE_MAX_SCORE,
  PRACTICE_MCQ_TRIAL_POINTS,
  QuestionProgress,
} from '../types/exercise';
import { practiceAlarm } from '../utils/alarmAudio';
import { DiagramRenderer } from './DiagramRenderer';

interface PracticeWorkspaceProps {
  studentName: string;
  onChangeStudentName: (name: string) => void;
  lastSavedAt: string | null;
  onSaveProgress: () => void;
  questions: ExerciseQuestion[];
  currentIndex: number;
  progressMap: Record<string, QuestionProgress>;
  violations: FocusViolation[];
  isLocked: boolean;
  onSetLocked: (locked: boolean) => void;
  onRecordViolation: (violation: FocusViolation) => void;
  onSelectQuestion: (index: number) => void;
  onSubmitMcqAnswer: (questionId: string, guess: string) => void;
  onSubmitEssayAnswer: (
    questionId: string,
    essayText: string,
    finalValue: string
  ) => void;
  onRevealAnswer: (questionId: string) => void;
  onFinishPractice: () => void;
}

export const PracticeWorkspace: React.FC<PracticeWorkspaceProps> = ({
  studentName,
  onChangeStudentName,
  lastSavedAt,
  onSaveProgress,
  questions,
  currentIndex,
  progressMap,
  violations,
  isLocked,
  onSetLocked,
  onRecordViolation,
  onSelectQuestion,
  onSubmitMcqAnswer,
  onSubmitEssayAnswer,
  onRevealAnswer,
  onFinishPractice,
}) => {
  const question = questions[currentIndex];
  const progress: QuestionProgress = progressMap[question.id] ?? {
    attempts: [],
    solved: false,
    revealed: false,
    pointsEarned: 0,
    solvedOnTrial: null,
  };

  const [essayText, setEssayText] = useState(progress.essayText ?? '');
  const [essayFinal, setEssayFinal] = useState(progress.essayFinalValue ?? '');
  const [essayError, setEssayError] = useState('');
  const [nameError, setNameError] = useState(false);
  const [alarmModalOpen, setAlarmModalOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const lastViolationTimeRef = useRef<number>(0);

  // Sync essay inputs when changing questions
  useEffect(() => {
    setEssayText(progress.essayText ?? '');
    setEssayFinal(progress.essayFinalValue ?? '');
    setEssayError('');
  }, [question.id, progress.essayText, progress.essayFinalValue]);

  const completedCount = questions.filter((q) => {
    const p = progressMap[q.id];
    if (!p) return false;
    if (q.type === 'essay') {
      return p.solved || p.revealed || p.attempts.length > 0;
    }
    return p.solved || p.revealed || p.attempts.length >= MAX_TRIALS;
  }).length;
  const allCompleted = completedCount === questions.length;

  // Trigger alarm + log violation when leaving tab/window/fullscreen during locked Practice
  useEffect(() => {
    if (!isLocked || allCompleted) {
      practiceAlarm.stop();
      return;
    }

    const triggerViolation = (reason: FocusViolation['reason']) => {
      const nowMs = Date.now();
      // Debounce rapid duplicate visibility + blur events within 1.2s
      if (nowMs - lastViolationTimeRef.current < 1200) {
        practiceAlarm.start();
        setAlarmModalOpen(true);
        return;
      }
      lastViolationTimeRef.current = nowMs;

      practiceAlarm.start();
      setAlarmModalOpen(true);
      onRecordViolation({
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        reason,
        questionNumber: question.number,
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerViolation('tab-switch');
      }
    };

    const handleWindowBlur = () => {
      triggerViolation('window-blur');
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        triggerViolation('exit-fullscreen');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        (e.ctrlKey || e.metaKey) &&
        (key === 't' || key === 'n' || key === 'w' || key === 'tab')
      ) {
        e.preventDefault();
        triggerViolation('tab-switch');
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isLocked, allCompleted, question.number, onRecordViolation]);

  // Stop alarm cleanly on unmount
  useEffect(() => {
    return () => {
      practiceAlarm.stop();
    };
  }, []);

  const enterLockMode = async () => {
    if (!studentName.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    practiceAlarm.unlock();
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen may be restricted in certain iframe sandboxes; focus/tab lock still enforces alarm
    }
    onSetLocked(true);
  };

  const handleAcknowledgeAlarm = async () => {
    practiceAlarm.stop();
    setAlarmModalOpen(false);
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore if fullscreen request is blocked
    }
  };

  const handleCompleteAndUnlock = async () => {
    practiceAlarm.stop();
    onSetLocked(false);
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen exit error
    }
    onFinishPractice();
  };

  const handleManualSave = () => {
    onSaveProgress();
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2500);
  };

  const handleEssaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!essayText.trim()) {
      setEssayError('Write your step-by-step explanation before submitting.');
      return;
    }
    if (!essayFinal.trim()) {
      setEssayError('Enter your final numerical answer.');
      return;
    }
    setEssayError('');
    onSubmitEssayAnswer(question.id, essayText.trim(), essayFinal.trim());
  };

  const totalScore = questions.reduce(
    (sum, q) => sum + (progressMap[q.id]?.pointsEarned ?? 0),
    0
  );

  // Lock Gate before starting or resuming locked Practice
  if (!isLocked && !allCompleted) {
    return (
      <section className="max-w-2xl mx-auto bg-white/95 backdrop-blur-sm border border-purple-200/80 rounded-xl p-6 sm:p-8 space-y-6 shadow-md">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-purple-100 text-purple-900 shrink-0">
            <Lock className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Part 2: Practice Assessment (Questions 1–12)
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Screen lock and tab-switch alarm protection will be activated when you
              begin.
            </p>
          </div>
        </div>

        <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">Scoring &amp; Lock Rules</div>
          <ul className="list-disc pl-5 space-y-1.5 text-sm">
            <li>
              <span className="font-medium text-slate-900">Questions 1–10 (MCQ):</span>{' '}
              1st trial = <span className="font-mono-num font-semibold">10</span> pts ·
              2nd = <span className="font-mono-num font-semibold">9</span> pts · 3rd ={' '}
              <span className="font-mono-num font-semibold">8.5</span> pts · 4th ={' '}
              <span className="font-mono-num font-semibold">8</span> pts.
            </li>
            <li>
              <span className="font-medium text-slate-900">
                Questions 11–12 (Essay):
              </span>{' '}
              <span className="font-mono-num font-semibold">50</span> points each (100
              pts total for essays). Maximum total score:{' '}
              <span className="font-mono-num font-semibold">{PRACTICE_MAX_SCORE}</span>{' '}
              pts.
            </li>
            <li>
              <span className="font-medium text-slate-900">
                Locked Focus &amp; Alarm:
              </span>{' '}
              Do not switch tabs, open other windows, or exit fullscreen during Practice.
              Attempting to open another tab will sound an alarm and record the alert in
              your report.
            </li>
          </ul>
        </div>

        <div>
          <label
            htmlFor="practice-gate-name"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            Student Full Name (Required)
          </label>
          <div className="relative">
            <User
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="practice-gate-name"
              type="text"
              value={studentName}
              onChange={(e) => {
                onChangeStudentName(e.target.value);
                if (nameError && e.target.value.trim()) setNameError(false);
              }}
              placeholder="Enter your full name to unlock Practice..."
              className={`w-full h-11 pl-9 pr-3 text-sm rounded-lg border text-slate-900 placeholder:text-slate-400 focus:outline-none ${
                nameError
                  ? 'border-rose-500 bg-rose-50/40'
                  : 'border-slate-300 bg-white focus:border-purple-700'
              }`}
            />
          </div>
          {nameError && (
            <p className="text-xs text-rose-700 font-medium mt-1">
              Please write your full name before starting Practice.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <span className="text-xs text-slate-500 font-mono-num">
            {completedCount > 0
              ? `Saved progress found: ${completedCount}/${questions.length} completed`
              : 'Ready to start · 12 questions'}
          </span>

          <button
            type="button"
            onClick={enterLockMode}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-purple-900 hover:bg-purple-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Lock className="w-4 h-4" aria-hidden="true" />
            {completedCount > 0
              ? 'Resume Practice & Lock Screen'
              : 'Start Practice & Lock Screen'}
          </button>
        </div>
      </section>
    );
  }

  const attemptsUsed = progress.attempts.length;
  const isQuestionDone =
    question.type === 'essay'
      ? progress.solved || progress.revealed || attemptsUsed > 0
      : progress.solved || progress.revealed || attemptsUsed >= MAX_TRIALS;
  const nextTrialNumber = Math.min(attemptsUsed + 1, MAX_TRIALS);
  const nextPotentialPoints = PRACTICE_MCQ_TRIAL_POINTS[nextTrialNumber - 1];

  return (
    <div className="space-y-6 relative">
      {/* Alarm Alert Modal on Tab Switch / Window Leave */}
      {alarmModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="alarm-title"
        >
          <div className="max-w-md w-full bg-white rounded-xl border-2 border-rose-600 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="p-2.5 rounded-lg bg-rose-100 shrink-0">
                <Volume2 className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h2 id="alarm-title" className="text-lg font-bold text-slate-900">
                  Focus Lock Alarm Triggered
                </h2>
                <p className="text-xs font-medium text-rose-700">
                  Leaving this tab or window is locked during Practice.
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              An attempt to switch tabs, open another window, or exit fullscreen was
              detected and recorded (total alerts:{' '}
              <span className="font-mono-num font-bold text-rose-700">
                {violations.length}
              </span>
              ). Stay on this page until all 12 Practice questions are completed.
            </p>

            <button
              type="button"
              onClick={handleAcknowledgeAlarm}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg transition-colors cursor-pointer"
            >
              Silence Alarm &amp; Return to Practice
            </button>
          </div>
        </div>
      )}

      {/* Practice Status & Navigator Header */}
      <section className="bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <span className="font-semibold text-slate-900">
              Part 2: Practice (Q1–12)
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="text-slate-700">
              Student:{' '}
              <span className="font-semibold text-slate-900">
                {studentName || 'Unnamed'}
              </span>
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-900">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              {allCompleted ? 'Unlocked (Completed)' : 'Page Locked'}
            </span>
            {violations.length > 0 && (
              <>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 font-mono-num">
                  <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                  Tab Alerts: {violations.length}
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-medium text-slate-900">
              Practice Score:{' '}
              <span className="font-mono-num font-bold text-purple-900">
                {totalScore}
              </span>{' '}
              <span className="text-slate-400 font-mono-num">
                / {PRACTICE_MAX_SCORE}
              </span>
            </div>

            <button
              type="button"
              onClick={handleManualSave}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookmarkCheck className="w-3.5 h-3.5 text-purple-800" aria-hidden="true" />
              {justSaved
                ? 'Saved'
                : lastSavedAt
                ? `Save (${lastSavedAt})`
                : 'Save Progress'}
            </button>
          </div>
        </div>

        {/* Question Navigator 1..12 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" aria-label="Practice question navigator">
            {questions.map((q, idx) => {
              const qProg = progressMap[q.id];
              const isCurrent = idx === currentIndex;
              const isSolved = qProg?.solved;
              const isDone =
                q.type === 'essay'
                  ? Boolean(qProg && (qProg.solved || qProg.revealed || qProg.attempts.length > 0))
                  : Boolean(
                      qProg &&
                        (qProg.solved ||
                          qProg.revealed ||
                          qProg.attempts.length >= MAX_TRIALS)
                    );
              const isExhausted = !isSolved && isDone;
              const hasTried =
                (qProg?.attempts.length ?? 0) > 0 && !isSolved && !isExhausted;

              let btnStyle =
                'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-400';
              if (isCurrent) {
                btnStyle = 'bg-purple-900 text-white border-purple-900 font-semibold';
              } else if (isSolved) {
                btnStyle =
                  'bg-emerald-50 text-emerald-800 border-emerald-300 hover:border-emerald-500';
              } else if (isExhausted) {
                btnStyle =
                  'bg-rose-50 text-rose-800 border-rose-300 hover:border-rose-500';
              } else if (hasTried) {
                btnStyle =
                  'bg-amber-50 text-amber-800 border-amber-300 hover:border-amber-500';
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onSelectQuestion(idx)}
                  className={`h-9 min-w-[2.5rem] px-2.5 text-xs font-mono-num rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${btnStyle}`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {q.number}
                  {q.type === 'essay' ? 'E' : ''}
                </button>
              );
            })}
          </div>

          <span className="text-xs font-mono-num text-slate-600">
            Completed {completedCount} / {questions.length}
          </span>
        </div>

        {allCompleted && (
          <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>
                All 12 Practice questions completed! Your separated MCQ and Essay scores
                are automatically submitted to fitriar@semesta.sch.id. Click Finish to
                unlock and review your Final Report.
              </span>
            </div>
            <button
              type="button"
              onClick={handleCompleteAndUnlock}
              className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
            >
              Finish &amp; View Final Score
            </button>
          </div>
        )}
      </section>

      {/* Main Two-Zone Practice Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Practice Q{question.number} Diagram &amp; Data
            </h2>
            <span className="text-xs font-mono-num text-slate-500">
              {question.topic} ·{' '}
              {question.type === 'essay' ? 'Essay (50 pts)' : 'Multiple Choice (10 pts)'}
            </span>
          </div>

          <DiagramRenderer
            key={question.id}
            visual={question.visual}
            alternateVisual={question.alternateVisual}
            visualNote={question.visualNote}
            showSolution={isQuestionDone}
          />
        </section>

        <section className="lg:col-span-5 bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-5 sm:p-6 space-y-5 shadow-sm">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Practice Question {question.number} of {questions.length}
                {question.type === 'essay' ? ' (Essay)' : ''}
              </span>
              <span className="font-mono-num">
                {isQuestionDone
                  ? `Earned: ${progress.pointsEarned} pts`
                  : question.type === 'essay'
                  ? `Worth ${ESSAY_MAX_POINTS} pts`
                  : `Trial ${nextTrialNumber} of ${MAX_TRIALS} · Worth ${nextPotentialPoints} pts`}
              </span>
            </div>

            <h1 className="text-lg font-semibold text-slate-900 leading-snug">
              {question.prompt}
            </h1>
            {question.subPrompt && (
              <p className="text-base font-medium text-slate-800 leading-snug pt-1">
                {question.subPrompt}
              </p>
            )}
          </div>

          {/* MCQ Scoring Schedule */}
          {question.type === 'mcq' && (
            <div className="grid grid-cols-4 gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg text-center">
              {PRACTICE_MCQ_TRIAL_POINTS.map((pts, idx) => {
                const trialNum = idx + 1;
                const isActiveTrial = !isQuestionDone && nextTrialNumber === trialNum;
                const isWonTrial = progress.solvedOnTrial === trialNum;
                const isMissedTrial =
                  !isWonTrial &&
                  (attemptsUsed >= trialNum || (isQuestionDone && !progress.solved));

                return (
                  <div
                    key={trialNum}
                    className={`py-1.5 px-1 rounded-md border text-xs transition-colors ${
                      isWonTrial
                        ? 'bg-emerald-600 text-white border-emerald-700 font-semibold'
                        : isActiveTrial
                        ? 'bg-white text-purple-900 border-purple-400 font-semibold'
                        : isMissedTrial
                        ? 'bg-slate-100 text-slate-400 border-transparent line-through'
                        : 'bg-transparent text-slate-600 border-transparent'
                    }`}
                  >
                    <div>Trial {trialNum}</div>
                    <div className="font-mono-num">{pts} pts</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* MCQ Options */}
          {question.type === 'mcq' && question.options && (
            <div className="space-y-2.5" role="group" aria-label="Answer choices">
              {question.options.map((opt) => {
                const wasTried = progress.attempts.includes(opt.id);
                const isCorrectOpt = opt.id === question.correctAnswer;
                const showAsCorrect = isQuestionDone && isCorrectOpt;
                const showAsWrong = wasTried && !isCorrectOpt;
                const disabled = isQuestionDone || wasTried;

                let cardStyle =
                  'bg-white border-slate-200 hover:border-purple-700 hover:bg-purple-50/40 text-slate-900 cursor-pointer';
                if (showAsCorrect) {
                  cardStyle =
                    'bg-emerald-50 border-emerald-600 text-emerald-950 font-medium';
                } else if (showAsWrong) {
                  cardStyle =
                    'bg-rose-50/70 border-rose-300 text-rose-900 opacity-85 cursor-not-allowed';
                } else if (isQuestionDone) {
                  cardStyle =
                    'bg-slate-50 border-slate-200 text-slate-500 cursor-default';
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSubmitMcqAnswer(question.id, opt.id)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-left transition-colors min-h-[48px] ${cardStyle}`}
                  >
                    <div className="flex items-baseline gap-3 min-w-0">
                      <span className="font-mono-num text-sm font-semibold shrink-0">
                        {opt.id})
                      </span>
                      <span className="text-sm leading-snug">{opt.text}</span>
                    </div>

                    {showAsCorrect && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 shrink-0 whitespace-nowrap">
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        Right Answer
                      </span>
                    )}
                    {showAsWrong && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 shrink-0 whitespace-nowrap">
                        <XCircle className="w-4 h-4" aria-hidden="true" />
                        Incorrect
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Essay Question Form (Q11 & Q12 — 50 pts each) */}
          {question.type === 'essay' && (
            <form onSubmit={handleEssaySubmit} className="space-y-4">
              <div>
                <label
                  htmlFor={`essay-text-${question.id}`}
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Step-by-Step Working &amp; Explanation (Up to 50 points)
                </label>
                <textarea
                  id={`essay-text-${question.id}`}
                  rows={5}
                  disabled={isQuestionDone}
                  value={essayText}
                  onChange={(e) => {
                    setEssayText(e.target.value);
                    if (essayError) setEssayError('');
                  }}
                  placeholder="Explain which intervals or values you read from the diagram and show your calculation steps..."
                  className="w-full p-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-purple-700 disabled:bg-slate-50 disabled:text-slate-600"
                />
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label
                    htmlFor={`essay-final-${question.id}`}
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Final Answer
                  </label>
                  <div className="relative">
                    <input
                      id={`essay-final-${question.id}`}
                      type="text"
                      disabled={isQuestionDone}
                      value={essayFinal}
                      onChange={(e) => {
                        setEssayFinal(e.target.value);
                        if (essayError) setEssayError('');
                      }}
                      placeholder={`e.g. ${question.essayConfig?.expectedNumericValue}`}
                      className="w-full h-11 px-3.5 pr-14 text-sm font-mono-num bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-purple-700 disabled:bg-slate-50 disabled:text-slate-600"
                    />
                    {question.essayConfig?.unit && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono-num text-slate-500 pointer-events-none">
                        {question.essayConfig.unit}
                      </span>
                    )}
                  </div>
                </div>

                {!isQuestionDone && (
                  <button
                    type="submit"
                    className="h-11 px-4 text-sm font-medium text-white bg-purple-900 hover:bg-purple-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Submit Essay
                  </button>
                )}
              </div>

              {essayError && (
                <p className="text-xs text-rose-700 font-medium">{essayError}</p>
              )}
            </form>
          )}

          {!isQuestionDone && question.type === 'mcq' && attemptsUsed > 0 && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
              <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-semibold">Not quite right.</span> You have{' '}
                <span className="font-mono-num font-semibold">
                  {MAX_TRIALS - attemptsUsed}
                </span>{' '}
                {MAX_TRIALS - attemptsUsed === 1 ? 'trial' : 'trials'} remaining. Next
                correct trial earns{' '}
                <span className="font-mono-num font-semibold">
                  {nextPotentialPoints} pts
                </span>
                .
              </div>
            </div>
          )}

          {isQuestionDone && (
            <div
              className={`p-4 rounded-lg border space-y-2 ${
                progress.solved
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                  {progress.solved ? (
                    <>
                      <CheckCircle2
                        className="w-4 h-4 text-emerald-700"
                        aria-hidden="true"
                      />
                      {question.type === 'essay'
                        ? 'Essay Evaluated'
                        : `Correct on Trial ${progress.solvedOnTrial}`}
                    </>
                  ) : (
                    <>
                      <AlertTriangle
                        className="w-4 h-4 text-amber-700"
                        aria-hidden="true"
                      />
                      {question.type === 'essay'
                        ? 'Essay Evaluated'
                        : `Right Answer: ${question.correctAnswer}`}
                    </>
                  )}
                </span>
                <span className="text-xs font-mono-num font-semibold">
                  +{progress.pointsEarned} pts
                </span>
              </div>

              {progress.essayFeedback && (
                <p className="text-xs font-medium text-slate-800">
                  {progress.essayFeedback}
                </p>
              )}

              <p className="text-sm text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">Right Answer: </span>
                <span className="font-mono-num font-semibold">
                  {question.type === 'mcq'
                    ? `${question.correctAnswer}) ${
                        question.options?.find((o) => o.id === question.correctAnswer)?.text ?? ''
                      }`
                    : question.correctAnswer}
                </span>
              </p>

              <p className="text-sm text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">
                  {question.type === 'essay' ? 'Model Essay Solution: ' : 'Explanation: '}
                </span>
                {question.type === 'essay'
                  ? question.essayConfig?.modelAnswer ?? question.explanation
                  : question.explanation}
              </p>
            </div>
          )}

          {/* Bottom Controls */}
          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              {!isQuestionDone && (
                <button
                  type="button"
                  onClick={() => onRevealAnswer(question.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  Show Answer (0 pts)
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => onSelectQuestion(currentIndex - 1)}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                Previous
              </button>

              {currentIndex < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => onSelectQuestion(currentIndex + 1)}
                  className="inline-flex items-center gap-1 px-4 py-2 text-xs font-medium text-white bg-purple-900 rounded-lg hover:bg-purple-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Next
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCompleteAndUnlock}
                  className="inline-flex items-center gap-1 px-4 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Finish &amp; Unlock
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
