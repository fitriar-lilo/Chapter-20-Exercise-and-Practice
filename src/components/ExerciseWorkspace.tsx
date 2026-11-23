import React, { useState } from 'react';
import {
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  HelpCircle,
  RotateCcw,
  User,
  XCircle,
} from 'lucide-react';
import { ExerciseQuestion, QuestionProgress } from '../types/exercise';
import { DiagramRenderer } from './DiagramRenderer';

interface ExerciseWorkspaceProps {
  studentName: string;
  onChangeStudentName: (name: string) => void;
  lastSavedAt: string | null;
  onSaveProgress: () => void;
  questions: ExerciseQuestion[];
  currentIndex: number;
  progressMap: Record<string, QuestionProgress>;
  onSelectQuestion: (index: number) => void;
  onSubmitAnswer: (questionId: string, guess: string) => void;
  onRevealAnswer: (questionId: string) => void;
  onResetQuestion: (questionId: string) => void;
  onGoToPractice: () => void;
}

export const ExerciseWorkspace: React.FC<ExerciseWorkspaceProps> = ({
  studentName,
  onChangeStudentName,
  lastSavedAt,
  onSaveProgress,
  questions,
  currentIndex,
  progressMap,
  onSelectQuestion,
  onSubmitAnswer,
  onRevealAnswer,
  onResetQuestion,
  onGoToPractice,
}) => {
  const question = questions[currentIndex];
  const progress: QuestionProgress = progressMap[question.id] ?? {
    attempts: [],
    solved: false,
    revealed: false,
    pointsEarned: 0,
    solvedOnTrial: null,
  };

  const [justSaved, setJustSaved] = useState(false);

  const isFinished = progress.solved || progress.revealed;
  const completedCount = questions.filter((q) => {
    const p = progressMap[q.id];
    return Boolean(p && (p.solved || p.revealed));
  }).length;

  const handleManualSave = () => {
    onSaveProgress();
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Student Name, Save & Exercise Navigator */}
      <section className="bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex-1 max-w-md">
            <label
              htmlFor="exercise-student-name"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Student Full Name
            </label>
            <div className="relative">
              <User
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="exercise-student-name"
                type="text"
                value={studentName}
                onChange={(e) => onChangeStudentName(e.target.value)}
                placeholder="Write your full name here..."
                className="w-full h-10 pl-9 pr-3 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-purple-700"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-slate-600 text-left md:text-right">
              <div className="font-medium text-slate-800">
                {justSaved
                  ? 'Progress saved in this browser'
                  : lastSavedAt
                  ? `Auto-saved · ${lastSavedAt}`
                  : 'Auto-saves as you work'}
              </div>
              <div>You can close this tab and continue later.</div>
            </div>

            <button
              type="button"
              onClick={handleManualSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookmarkCheck className="w-4 h-4 text-purple-800" aria-hidden="true" />
              {justSaved ? 'Saved' : 'Save Progress'}
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
            <span className="font-semibold text-slate-900">
              Part 1: Exercise (Questions 1–10)
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span>Ungraded Warm-Up (No Score)</span>
          </div>
          <span className="font-mono-num text-xs text-slate-600">
            Reviewed {completedCount} / {questions.length}
          </span>
        </div>

        {/* Question Index Buttons 1..10 */}
        <div className="flex flex-wrap gap-1.5" aria-label="Exercise question navigator">
          {questions.map((q, idx) => {
            const qProg = progressMap[q.id];
            const isCurrent = idx === currentIndex;
            const isSolved = qProg?.solved;
            const isRevealed = !isSolved && qProg?.revealed;

            let btnStyle =
              'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-400';
            if (isCurrent) {
              btnStyle = 'bg-purple-800 text-white border-purple-800 font-semibold';
            } else if (isSolved) {
              btnStyle =
                'bg-emerald-50 text-emerald-800 border-emerald-300 hover:border-emerald-500';
            } else if (isRevealed) {
              btnStyle = 'bg-slate-100 text-slate-600 border-slate-300';
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
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Two-Zone Exercise Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Exercise Q{question.number} Diagram &amp; Data
            </h2>
            <span className="text-xs font-mono-num text-slate-500">
              {question.topic} · No Score
            </span>
          </div>

          <DiagramRenderer
            key={question.id}
            visual={question.visual}
            alternateVisual={question.alternateVisual}
            visualNote={question.visualNote}
            showSolution={isFinished}
          />
        </section>

        <section className="lg:col-span-5 bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-5 sm:p-6 space-y-5 shadow-sm">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Exercise Question {question.number} of {questions.length}
              </span>
              <span className="font-mono-num">Ungraded Practice</span>
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

          {/* Options */}
          {question.options && (
            <div className="space-y-2.5" role="group" aria-label="Answer choices">
              {question.options.map((opt) => {
                const wasTried = progress.attempts.includes(opt.id);
                const isCorrectOpt = opt.id === question.correctAnswer;
                const showAsCorrect = isFinished && isCorrectOpt;
                const showAsWrong = wasTried && !isCorrectOpt;
                const disabled = isFinished || wasTried;

                let cardStyle =
                  'bg-white border-slate-200 hover:border-purple-700 hover:bg-purple-50/40 text-slate-900 cursor-pointer';
                if (showAsCorrect) {
                  cardStyle =
                    'bg-emerald-50 border-emerald-600 text-emerald-950 font-medium';
                } else if (showAsWrong) {
                  cardStyle =
                    'bg-rose-50/70 border-rose-300 text-rose-900 opacity-85 cursor-not-allowed';
                } else if (isFinished) {
                  cardStyle =
                    'bg-slate-50 border-slate-200 text-slate-500 cursor-default';
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSubmitAnswer(question.id, opt.id)}
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

          {!isFinished && progress.attempts.length > 0 && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
              <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-semibold">Not quite right.</span> Try another option
                or click Show Answer to inspect the worked steps.
              </div>
            </div>
          )}

          {isFinished && (
            <div
              className={`p-4 rounded-lg border space-y-2 ${
                progress.solved
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                {progress.solved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                    <span>Correct! (Exercise is ungraded)</span>
                  </>
                ) : (
                  <>
                    <span>
                      Right Answer: {question.correctAnswer})
                    </span>
                  </>
                )}
              </div>

              <p className="text-sm text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">Explanation: </span>
                {question.explanation}
              </p>
            </div>
          )}

          {/* Bottom Controls */}
          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!isFinished ? (
                <button
                  type="button"
                  onClick={() => onRevealAnswer(question.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  Show Answer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onResetQuestion(question.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  Try Again
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
                  onClick={onGoToPractice}
                  className="inline-flex items-center gap-1 px-4 py-2 text-xs font-medium text-white bg-purple-800 rounded-lg hover:bg-purple-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Start Practice (Q1–12)
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
