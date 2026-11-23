import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { ExerciseQuestion, SectionKind } from '../types/exercise';
import { DiagramRenderer } from './DiagramRenderer';

interface AnswerKeyViewProps {
  exerciseQuestions: ExerciseQuestion[];
  practiceQuestions: ExerciseQuestion[];
  practiceCompleted: boolean;
  onOpenQuestion: (section: SectionKind, index: number) => void;
}

export const AnswerKeyView: React.FC<AnswerKeyViewProps> = ({
  exerciseQuestions,
  practiceQuestions,
  practiceCompleted,
  onOpenQuestion,
}) => {
  const [sectionFilter, setSectionFilter] = useState<'exercise' | 'practice'>(
    'exercise'
  );
  const [expandedVisualId, setExpandedVisualId] = useState<string | null>(null);

  const list =
    sectionFilter === 'exercise' ? exerciseQuestions : practiceQuestions;

  return (
    <div className="space-y-6">
      <section className="bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Answer Key &amp; Worked Solutions
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Exercise (Q1–10, ungraded) · Practice (Q1–10 MCQ + Q11–12 Essay, 200 pts
            total)
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setSectionFilter('exercise')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              sectionFilter === 'exercise'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Exercise (Q1–10)
          </button>
          <button
            type="button"
            onClick={() => setSectionFilter('practice')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              sectionFilter === 'practice'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Practice (Q1–12)
          </button>
        </div>
      </section>

      {sectionFilter === 'practice' && !practiceCompleted ? (
        <section className="bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-8 text-center space-y-3 shadow-sm">
          <div className="inline-flex p-3 rounded-lg bg-purple-100 text-purple-900">
            <Lock className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Practice Answer Key Locked
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Complete all 12 Practice questions first to unlock the Practice answer key
            and model essay solutions.
          </p>
          <button
            type="button"
            onClick={() => onOpenQuestion('practice', 0)}
            className="px-4 py-2 text-xs font-medium text-white bg-purple-900 hover:bg-purple-950 rounded-lg transition-colors cursor-pointer"
          >
            Go to Practice
          </button>
        </section>
      ) : (
        <div className="space-y-4">
          {list.map((q, idx) => {
            const rightOptionText =
              q.type === 'mcq'
                ? `${q.correctAnswer}) ${
                    q.options?.find((o) => o.id === q.correctAnswer)?.text ?? ''
                  }`
                : q.correctAnswer;
            const isExpanded = expandedVisualId === q.id;

            return (
              <article
                key={q.id}
                className="bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-5 space-y-3 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono-num font-semibold text-slate-700">
                        {q.section === 'exercise' ? 'Exercise' : 'Practice'} Q{q.number}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{q.topic}</span>
                      <span aria-hidden="true">·</span>
                      <span>{q.type === 'essay' ? 'Essay (50 pts)' : 'MCQ'}</span>
                    </div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {q.prompt} {q.subPrompt ?? ''}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandedVisualId(isExpanded ? null : q.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isExpanded ? (
                        <>
                          Hide Diagram
                          <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                        </>
                      ) : (
                        <>
                          View Diagram
                          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenQuestion(q.section, idx)}
                      className="px-3 py-1.5 text-xs font-medium text-purple-900 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Open Q{q.number}
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <CheckCircle2
                      className="w-4 h-4 text-emerald-700 shrink-0"
                      aria-hidden="true"
                    />
                    <span>Right Answer: {rightOptionText}</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {q.type === 'essay'
                      ? q.essayConfig?.modelAnswer ?? q.explanation
                      : q.explanation}
                  </p>
                </div>

                {isExpanded && (
                  <div className="pt-2 max-w-2xl">
                    <DiagramRenderer
                      key={`ak-${q.id}`}
                      visual={q.visual}
                      alternateVisual={q.alternateVisual}
                      visualNote={q.visualNote}
                      showSolution={true}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
