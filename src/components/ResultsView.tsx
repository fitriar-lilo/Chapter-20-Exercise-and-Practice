import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  User,
  XCircle,
} from 'lucide-react';
import type { AutoEmailState } from '../App';
import {
  ESSAY_MAX_POINTS,
  ExerciseQuestion,
  FocusViolation,
  MAX_TRIALS,
  QuestionProgress,
} from '../types/exercise';
import {
  analyzePracticeWork,
  buildEmailReportContent,
  downloadPracticePdf,
  getPracticeAnswerDisplay,
  TEACHER_EMAIL,
} from '../utils/reportGenerator';

interface ResultsViewProps {
  studentName: string;
  onChangeStudentName: (name: string) => void;
  exerciseQuestions: ExerciseQuestion[];
  practiceQuestions: ExerciseQuestion[];
  progressMap: Record<string, QuestionProgress>;
  violations: FocusViolation[];
  autoEmailState: AutoEmailState;
  onRetryAutoSend: (forceResend?: boolean) => void;
  onJumpToPracticeQuestion: (index: number) => void;
  onResetAll: () => void;
  onViewAnswerKey: () => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  studentName,
  onChangeStudentName,
  exerciseQuestions,
  practiceQuestions,
  progressMap,
  violations,
  autoEmailState,
  onRetryAutoSend,
  onJumpToPracticeQuestion,
  onResetAll,
  onViewAnswerKey,
}) => {
  const [copied, setCopied] = useState(false);
  const [nameWarning, setNameWarning] = useState(false);

  const analysis = useMemo(
    () =>
      analyzePracticeWork(
        studentName,
        practiceQuestions,
        progressMap,
        violations
      ),
    [studentName, practiceQuestions, progressMap, violations]
  );

  const emailReport = useMemo(
    () =>
      buildEmailReportContent(
        studentName,
        practiceQuestions,
        progressMap,
        violations
      ),
    [studentName, practiceQuestions, progressMap, violations]
  );

  const exerciseCompletedCount = exerciseQuestions.filter(
    (q) => progressMap[q.id]?.solved || progressMap[q.id]?.revealed
  ).length;

  const handleDownloadPdf = () => {
    if (!studentName.trim()) {
      setNameWarning(true);
      return;
    }
    setNameWarning(false);
    downloadPracticePdf(
      studentName,
      exerciseQuestions,
      practiceQuestions,
      progressMap,
      violations
    );
  };

  const handleCopyEmailBody = async () => {
    try {
      await navigator.clipboard.writeText(
        `To: ${TEACHER_EMAIL}\nSubject: ${emailReport.subject}\n\n${emailReport.body}`
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const essayQuestions = practiceQuestions.filter((q) => q.type === 'essay');

  return (
    <div className="space-y-6">
      {/* Top Final Score & Export Panel */}
      <section className="bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-6 space-y-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">
              Final Practice Score, Summary &amp; Analysis
            </h1>
            <p className="text-sm text-slate-600">
              Practice Q1–10 MCQ (10/9/8.5/8 pts) + Q11–12 Essay (50 pts each) ·
              Exercise Q1–10 is ungraded ({exerciseCompletedCount}/10 reviewed)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-purple-900 hover:bg-purple-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Download PDF Report
            </button>

            <button
              type="button"
              onClick={onViewAnswerKey}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              View Answer Key
            </button>

            <button
              type="button"
              onClick={onResetAll}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Reset All
            </button>
          </div>
        </div>

        {/* Student Name Row */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1 max-w-md">
            <label
              htmlFor="results-student-name"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Student Full Name (Required for PDF &amp; teacher email)
            </label>
            <div className="relative">
              <User
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="results-student-name"
                type="text"
                value={studentName}
                onChange={(e) => {
                  onChangeStudentName(e.target.value);
                  if (nameWarning && e.target.value.trim()) setNameWarning(false);
                }}
                placeholder="Enter your full name..."
                className={`w-full h-10 pl-9 pr-3 text-sm rounded-lg border text-slate-900 placeholder:text-slate-400 focus:outline-none ${
                  nameWarning
                    ? 'border-rose-500 bg-rose-50/40 focus:border-rose-600'
                    : 'border-slate-300 bg-slate-50 focus:bg-white focus:border-purple-700'
                }`}
              />
            </div>
            {nameWarning && (
              <p className="text-xs text-rose-700 font-medium mt-1">
                Please enter your full name before downloading your PDF or emailing your
                score.
              </p>
            )}
          </div>

          <div className="text-xs text-slate-600 pb-2">
            Practice Status:{' '}
            <span className="font-semibold text-slate-900">
              {analysis.isAllCompleted
                ? `Completed (${analysis.completedCount}/${analysis.totalQuestions})`
                : `${analysis.completedCount}/${analysis.totalQuestions} questions completed`}
            </span>
          </div>
        </div>

        {/* Separate Score Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
            <div className="text-xs font-medium text-purple-900">
              Multiple Choice Score (Q1–10)
            </div>
            <div className="mt-1 text-3xl font-bold font-mono-num text-purple-950">
              {analysis.mcqPoints}
              <span className="text-base font-normal text-purple-700">
                {' '}
                / {analysis.mcqMaxPoints}
              </span>
            </div>
            <div className="mt-1 text-xs text-purple-900 font-mono-num">
              {analysis.mcqMaxPoints > 0
                ? Math.round((analysis.mcqPoints / analysis.mcqMaxPoints) * 100)
                : 0}
              % · T1:{analysis.trialCounts[0]} T2:{analysis.trialCounts[1]} T3:
              {analysis.trialCounts[2]} T4:{analysis.trialCounts[3]}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-indigo-50 border border-indigo-200">
            <div className="text-xs font-medium text-indigo-900">
              Essay Score (Q11–12)
            </div>
            <div className="mt-1 text-3xl font-bold font-mono-num text-indigo-950">
              {analysis.essayPoints}
              <span className="text-base font-normal text-indigo-700">
                {' '}
                / {analysis.essayMaxPoints}
              </span>
            </div>
            <div className="mt-1 text-xs text-indigo-900 font-mono-num">
              {analysis.essayMaxPoints > 0
                ? Math.round((analysis.essayPoints / analysis.essayMaxPoints) * 100)
                : 0}
              % · 50 points per essay
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs font-medium text-slate-600">
              Overall Mastery
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {analysis.performanceLevel}
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono-num">
              {analysis.solvedCount} / {analysis.totalQuestions} questions solved
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs font-medium text-slate-600">
              Focus Lock Integrity
            </div>
            <div className="mt-1 text-3xl font-bold font-mono-num text-slate-900">
              {violations.length}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {violations.length === 0
                ? 'No tab switches detected'
                : 'Tab-switch / focus alerts'}
            </div>
          </div>
        </div>
      </section>

      {/* Topic Analysis & Teacher Email */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-6 space-y-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Work Summary &amp; Topic Analysis
            </h2>
            <p className="text-sm text-slate-700 mt-2 leading-relaxed">
              {analysis.strengthsText}
            </p>
            <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
              {analysis.recommendationsText}
            </p>
          </div>

          <div className="space-y-4 pt-2 border-t border-slate-200">
            {analysis.topicStats.map((stat) => (
              <div key={stat.topic} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-slate-900">{stat.topic}</span>
                  <span className="font-mono-num text-xs text-slate-600">
                    {stat.solvedCount}/{stat.totalQuestions} solved ·{' '}
                    {stat.pointsEarned}/{stat.maxPoints} pts ({stat.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <div
                    className={`h-full transition-all ${
                      stat.percentage >= 80
                        ? 'bg-emerald-600'
                        : stat.percentage >= 55
                        ? 'bg-purple-700'
                        : 'bg-amber-600'
                    }`}
                    style={{ width: `${stat.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {violations.length > 0 && (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
                <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                Tab-Switch &amp; Focus Alert Log ({violations.length})
              </div>
              <div className="max-h-28 overflow-y-auto text-xs font-mono-num text-slate-600 space-y-1">
                {violations.map((v, i) => (
                  <div key={i}>
                    [{v.timestamp}] {v.reason} on Practice Q{v.questionNumber}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-6 space-y-4 flex flex-col justify-between shadow-sm">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Automatic Email Submission ({TEACHER_EMAIL})
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              When all 12 Practice questions are completed with your name, your separated
              Multiple Choice and Essay scores (with PDF report) are automatically sent
              to{' '}
              <span className="font-mono-num font-semibold text-slate-900">
                {TEACHER_EMAIL}
              </span>
              .
            </p>

            {/* Real-time Automatic Email Status */}
            {autoEmailState.status === 'sending' && (
              <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-900 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                <span>
                  Automatically sending final score and PDF report to {TEACHER_EMAIL}...
                </span>
              </div>
            )}

            {autoEmailState.status === 'sent' && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2">
                <CheckCircle2
                  className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <div className="font-semibold">
                    Final score automatically sent to {TEACHER_EMAIL}
                  </div>
                  {autoEmailState.sentAt && (
                    <div className="text-emerald-800 mt-0.5 font-mono-num">
                      Delivered at {autoEmailState.sentAt} · Includes MCQ (Q1–10), Essay
                      (Q11–12), &amp; PDF attachment
                    </div>
                  )}
                </div>
              </div>
            )}

            {autoEmailState.status === 'unconfigured' && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2">
                <AlertTriangle
                  className="w-4 h-4 text-amber-700 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <div className="font-semibold">
                    Server Email Credentials Required for Background Auto-Send
                  </div>
                  <div className="mt-0.5 text-amber-900">
                    Add <span className="font-mono-num font-semibold">RESEND_API_KEY</span>{' '}
                    or <span className="font-mono-num font-semibold">SMTP_USER</span> &amp;{' '}
                    <span className="font-mono-num font-semibold">SMTP_PASS</span> in AI
                    Studio Secrets, or use the email button below.
                  </div>
                </div>
              </div>
            )}

            {autoEmailState.status === 'error' && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-950 flex items-start gap-2">
                <XCircle
                  className="w-4 h-4 text-rose-700 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <div className="font-semibold">Automatic Send Issue</div>
                  <div className="mt-0.5 text-rose-900">
                    {autoEmailState.message ||
                      'Could not send automatically. Click Retry or use the Email App button below.'}
                  </div>
                </div>
              </div>
            )}

            {autoEmailState.status === 'idle' && !analysis.isAllCompleted && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                Complete all 12 Practice questions and enter your full name to trigger
                automatic email delivery.
              </div>
            )}

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono-num text-slate-700 space-y-1">
              <div className="truncate">
                <span className="text-slate-500">To:</span> {TEACHER_EMAIL}
              </div>
              <div className="truncate">
                <span className="text-slate-500">Subject:</span> {emailReport.subject}
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              disabled={!analysis.isAllCompleted || autoEmailState.status === 'sending'}
              onClick={() => {
                if (!studentName.trim()) {
                  setNameWarning(true);
                  return;
                }
                setNameWarning(false);
                onRetryAutoSend(true);
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-purple-900 hover:bg-purple-950 disabled:opacity-45 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  autoEmailState.status === 'sending' ? 'animate-spin' : ''
                }`}
                aria-hidden="true"
              />
              {autoEmailState.status === 'sent'
                ? `Resend Score Automatically to ${TEACHER_EMAIL}`
                : `Auto-Send Final Score to ${TEACHER_EMAIL}`}
            </button>

            <div className="grid grid-cols-3 gap-2">
              <a
                href={emailReport.mailtoUrl}
                onClick={(e) => {
                  if (!studentName.trim()) {
                    e.preventDefault();
                    setNameWarning(true);
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                Email App
              </a>

              <button
                type="button"
                onClick={handleCopyEmailBody}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    Copy Text
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                PDF
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Written Essay Summary (Q11 & Q12) */}
      <section className="bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl p-6 space-y-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Essay Responses (Practice Q11 &amp; Q12 · 50 pts each)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {essayQuestions.map((eq) => {
            const prog = progressMap[eq.id];
            return (
              <div
                key={eq.id}
                className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    Practice Q{eq.number} ({eq.topic})
                  </span>
                  <span className="text-xs font-mono-num font-semibold text-purple-900">
                    {prog?.pointsEarned ?? 0} / {ESSAY_MAX_POINTS} pts
                  </span>
                </div>
                <p className="text-xs text-slate-600">{eq.subPrompt}</p>
                <div className="text-xs text-slate-800 bg-white border border-slate-200 rounded-md p-2.5 whitespace-pre-wrap">
                  {prog?.essayText?.trim() || 'No written explanation submitted.'}
                </div>
                <div className="text-xs font-mono-num text-slate-700">
                  Your Final Value: {prog?.essayFinalValue?.trim() || '—'} · Right
                  Answer: {eq.correctAnswer}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 1. Multiple Choice Scorecard (Q1-10) */}
      <section className="bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">
            1. Multiple Choice Scorecard (Q1–10)
          </h2>
          <span className="text-sm font-mono-num font-semibold text-purple-900">
            Score: {analysis.mcqPoints} / {analysis.mcqMaxPoints}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="px-5 py-3">Q#</th>
                <th className="px-5 py-3">Topic</th>
                <th className="px-5 py-3">Attempts</th>
                <th className="px-5 py-3">Right Answer</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {practiceQuestions
                .filter((q) => q.type === 'mcq')
                .map((q) => {
                  const idx = practiceQuestions.findIndex((item) => item.id === q.id);
                  const prog = progressMap[q.id];
                  const attempts = prog?.attempts.length ?? 0;
                  const isSolved = prog?.solved ?? false;
                  const isDone = Boolean(
                    prog && (prog.solved || prog.revealed || attempts >= MAX_TRIALS)
                  );
                  const { attemptsText, rightAnswerText } = getPracticeAnswerDisplay(
                    q,
                    prog
                  );

                  return (
                    <tr
                      key={q.id}
                      onClick={() => onJumpToPracticeQuestion(idx)}
                      className="border-b last:border-b-0 border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3 text-sm font-mono-num font-semibold text-slate-900">
                        {q.number}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {q.topic}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono-num text-slate-600 whitespace-nowrap">
                        {attemptsText}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono-num text-slate-700 max-w-xs truncate">
                        {isDone ? rightAnswerText : '—'}
                      </td>
                      <td className="px-5 py-3 text-xs whitespace-nowrap">
                        {isSolved ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            Trial {prog?.solvedOnTrial}
                          </span>
                        ) : isDone ? (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                            <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            {prog?.revealed ? 'Revealed' : 'No points'}
                          </span>
                        ) : attempts > 0 ? (
                          <span className="text-amber-700 font-medium">
                            In progress ({attempts}/{MAX_TRIALS})
                          </span>
                        ) : (
                          <span className="text-slate-400">Unanswered</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm font-mono-num font-semibold text-right text-slate-900">
                        {prog?.pointsEarned ?? 0}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200 text-sm font-semibold text-slate-900">
                <td colSpan={5} className="px-5 py-3 text-right">
                  Multiple Choice Score (Q1–10)
                </td>
                <td className="px-5 py-3 text-right font-mono-num text-purple-900">
                  {analysis.mcqPoints} / {analysis.mcqMaxPoints}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 2. Essay Scorecard (Q11-12) */}
      <section className="bg-white/95 backdrop-blur-sm border border-purple-200/70 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">
            2. Essay Scorecard (Q11–12)
          </h2>
          <span className="text-sm font-mono-num font-semibold text-indigo-900">
            Score: {analysis.essayPoints} / {analysis.essayMaxPoints}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="px-5 py-3">Q#</th>
                <th className="px-5 py-3">Topic</th>
                <th className="px-5 py-3">Your Final Answer</th>
                <th className="px-5 py-3">Right Answer</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {practiceQuestions
                .filter((q) => q.type === 'essay')
                .map((q) => {
                  const idx = practiceQuestions.findIndex((item) => item.id === q.id);
                  const prog = progressMap[q.id];
                  const attempts = prog?.attempts.length ?? 0;
                  const isDone = Boolean(
                    prog && (prog.solved || prog.revealed || attempts > 0)
                  );
                  const { attemptsText, rightAnswerText } = getPracticeAnswerDisplay(
                    q,
                    prog
                  );

                  return (
                    <tr
                      key={q.id}
                      onClick={() => onJumpToPracticeQuestion(idx)}
                      className="border-b last:border-b-0 border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3 text-sm font-mono-num font-semibold text-slate-900">
                        {q.number}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {q.topic}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono-num text-slate-600 whitespace-nowrap">
                        {attemptsText}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono-num text-slate-700 max-w-xs truncate">
                        {isDone ? rightAnswerText : '—'}
                      </td>
                      <td className="px-5 py-3 text-xs whitespace-nowrap">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            Evaluated
                          </span>
                        ) : (
                          <span className="text-slate-400">Unanswered</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm font-mono-num font-semibold text-right text-slate-900">
                        {prog?.pointsEarned ?? 0} / {ESSAY_MAX_POINTS}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200 text-sm font-semibold text-slate-900">
                <td colSpan={5} className="px-5 py-3 text-right">
                  Essay Score (Q11–12)
                </td>
                <td className="px-5 py-3 text-right font-mono-num text-indigo-900">
                  {analysis.essayPoints} / {analysis.essayMaxPoints}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
};
