import {
  ESSAY_MAX_POINTS,
  type ExerciseQuestion,
  type FocusViolation,
  MAX_TRIALS,
  PRACTICE_MAX_SCORE,
  PRACTICE_MCQ_TRIAL_POINTS,
  type QuestionProgress,
  type QuestionTopic,
} from '../types/exercise.ts';

export const TEACHER_EMAIL = 'fitriar@semesta.sch.id';

export interface TopicStat {
  topic: QuestionTopic;
  totalQuestions: number;
  solvedCount: number;
  pointsEarned: number;
  maxPoints: number;
  percentage: number;
}

export interface PracticeAnalysis {
  studentName: string;
  completedCount: number;
  totalQuestions: number;
  isAllCompleted: boolean;
  solvedCount: number;
  mcqPoints: number;
  mcqMaxPoints: number;
  essayPoints: number;
  essayMaxPoints: number;
  totalScore: number;
  maxScore: number;
  scorePercentage: number;
  trialCounts: [number, number, number, number];
  missedOrRevealedNumbers: number[];
  unansweredNumbers: number[];
  topicStats: TopicStat[];
  performanceLevel: string;
  strengthsText: string;
  recommendationsText: string;
  violations: FocusViolation[];
}

export function evaluateEssayResponse(
  question: ExerciseQuestion,
  essayText: string,
  finalValueStr: string
): { points: number; solved: boolean; feedback: string } {
  const config = question.essayConfig;
  if (!config) {
    return { points: 0, solved: false, feedback: 'Rubric unavailable.' };
  }

  const cleanedVal = finalValueStr.replace(/%|fish|cm|kg/gi, '').trim();
  const parsedVal = Number(cleanedVal);
  const isFinalCorrect =
    cleanedVal.length > 0 &&
    !Number.isNaN(parsedVal) &&
    Math.abs(parsedVal - config.expectedNumericValue) < 1e-6;

  const normalizedEssay = essayText.trim().toLowerCase();
  const matchedTokens = config.keyWorkingTokens.filter((token) =>
    normalizedEssay.includes(token.toLowerCase())
  );
  const hasMeaningfulExplanation = normalizedEssay.length >= 20;

  if (isFinalCorrect && hasMeaningfulExplanation && matchedTokens.length >= 2) {
    return {
      points: ESSAY_MAX_POINTS,
      solved: true,
      feedback: `Full credit (50/50 pts): Accurate final answer (${question.correctAnswer}) supported by clear step-by-step values from the diagram.`,
    };
  }

  if (isFinalCorrect && hasMeaningfulExplanation) {
    return {
      points: 45,
      solved: true,
      feedback: `45/50 pts: Correct final answer (${question.correctAnswer}). Include all intermediate readings (${config.keyWorkingTokens.join(', ')}) for full working credit.`,
    };
  }

  if (isFinalCorrect) {
    return {
      points: 35,
      solved: true,
      feedback: `35/50 pts: Final answer (${question.correctAnswer}) is correct, but a fuller step-by-step explanation is needed for full essay credit.`,
    };
  }

  if (matchedTokens.length >= 2 && hasMeaningfulExplanation) {
    return {
      points: 20,
      solved: false,
      feedback: `Partial credit (20/50 pts): Your working references correct readings from the diagram, though the final answer did not match ${question.correctAnswer}.`,
    };
  }

  return {
    points: 0,
    solved: false,
    feedback: `0/50 pts: Compare your steps with the model solution (${question.correctAnswer}).`,
  };
}

/**
 * Recomputes authoritative scores server-side from raw submitted answers
 * so client-supplied points cannot be forged.
 */
export function recomputeVerifiedPracticeProgress(
  practiceQuestions: ExerciseQuestion[],
  rawProgressMap: Record<string, unknown>
): Record<string, QuestionProgress> {
  const verified: Record<string, QuestionProgress> = {};

  for (const q of practiceQuestions) {
    const rawEntry = rawProgressMap[q.id];
    if (!rawEntry || typeof rawEntry !== 'object') {
      continue;
    }
    const entry = rawEntry as Record<string, unknown>;
    const revealed = Boolean(entry.revealed);

    if (q.type === 'essay') {
      const essayText =
        typeof entry.essayText === 'string' ? entry.essayText.slice(0, 4000) : '';
      const essayFinalValue =
        typeof entry.essayFinalValue === 'string'
          ? entry.essayFinalValue.slice(0, 100)
          : '';
      const hasSubmitted =
        Boolean(essayText.trim()) ||
        Boolean(essayFinalValue.trim()) ||
        (Array.isArray(entry.attempts) && entry.attempts.length > 0);

      if (revealed && !hasSubmitted) {
        verified[q.id] = {
          attempts: [],
          solved: false,
          revealed: true,
          pointsEarned: 0,
          solvedOnTrial: null,
          essayText,
          essayFinalValue,
          essayFeedback: 'Answer revealed before submission (0 pts).',
        };
      } else if (hasSubmitted) {
        const evalRes = evaluateEssayResponse(q, essayText, essayFinalValue);
        verified[q.id] = {
          attempts: [essayFinalValue],
          solved: evalRes.solved,
          revealed,
          pointsEarned: revealed && !evalRes.solved ? 0 : evalRes.points,
          solvedOnTrial: evalRes.solved ? 1 : null,
          essayText,
          essayFinalValue,
          essayFeedback: evalRes.feedback,
        };
      }
      continue;
    }

    // Multiple Choice (Q1-10): recompute exact trial and score
    const rawAttempts = Array.isArray(entry.attempts) ? entry.attempts : [];
    const attempts: string[] = [];
    let solved = false;
    let solvedOnTrial: number | null = null;
    let pointsEarned = 0;

    for (const item of rawAttempts) {
      if (typeof item !== 'string') continue;
      const guess = item.trim().toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(guess)) continue;
      if (attempts.includes(guess)) continue;
      if (attempts.length >= MAX_TRIALS || solved) break;

      attempts.push(guess);
      if (guess === q.correctAnswer) {
        solved = true;
        solvedOnTrial = attempts.length;
        pointsEarned = PRACTICE_MCQ_TRIAL_POINTS[attempts.length - 1] ?? 0;
      }
    }

    verified[q.id] = {
      attempts,
      solved,
      revealed: !solved && revealed,
      pointsEarned,
      solvedOnTrial,
    };
  }

  return verified;
}

export function analyzePracticeWork(
  studentName: string,
  practiceQuestions: ExerciseQuestion[],
  progressMap: Record<string, QuestionProgress>,
  violations: FocusViolation[]
): PracticeAnalysis {
  const totalQuestions = practiceQuestions.length;
  let completedCount = 0;
  let solvedCount = 0;
  let mcqPoints = 0;
  let essayPoints = 0;
  let mcqMaxPoints = 0;
  let essayMaxPoints = 0;
  const trialCounts: [number, number, number, number] = [0, 0, 0, 0];
  const missedOrRevealedNumbers: number[] = [];
  const unansweredNumbers: number[] = [];

  for (const q of practiceQuestions) {
    const maxQ = q.type === 'essay' ? ESSAY_MAX_POINTS : PRACTICE_MCQ_TRIAL_POINTS[0];
    if (q.type === 'essay') essayMaxPoints += maxQ;
    else mcqMaxPoints += maxQ;

    const prog = progressMap[q.id];
    const attempts = prog?.attempts.length ?? 0;
    const isSolved = prog?.solved ?? false;
    const isCompleted =
      q.type === 'essay'
        ? Boolean(prog && (prog.solved || prog.revealed || attempts > 0))
        : Boolean(
            prog && (prog.solved || prog.revealed || attempts >= MAX_TRIALS)
          );

    if (isCompleted) {
      completedCount += 1;
      const earned = prog?.pointsEarned ?? 0;
      if (q.type === 'essay') {
        essayPoints += earned;
      } else {
        mcqPoints += earned;
      }

      if (isSolved) {
        solvedCount += 1;
        if (
          q.type === 'mcq' &&
          prog?.solvedOnTrial &&
          prog.solvedOnTrial >= 1 &&
          prog.solvedOnTrial <= 4
        ) {
          trialCounts[prog.solvedOnTrial - 1] += 1;
        }
      } else {
        missedOrRevealedNumbers.push(q.number);
      }
    } else {
      unansweredNumbers.push(q.number);
    }
  }

  const totalScore = mcqPoints + essayPoints;
  const maxScore = PRACTICE_MAX_SCORE;
  const scorePercentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  const topics: QuestionTopic[] = [
    'Histogram',
    'Cumulative Frequency',
    'Frequency Table',
  ];

  const topicStats: TopicStat[] = topics.map((topic) => {
    const qs = practiceQuestions.filter((q) => q.topic === topic);
    const maxPoints = qs.reduce(
      (sum, q) =>
        sum + (q.type === 'essay' ? ESSAY_MAX_POINTS : PRACTICE_MCQ_TRIAL_POINTS[0]),
      0
    );
    let earned = 0;
    let solved = 0;

    for (const q of qs) {
      const prog = progressMap[q.id];
      if (prog) {
        earned += prog.pointsEarned;
        if (prog.solved) solved += 1;
      }
    }

    return {
      topic,
      totalQuestions: qs.length,
      solvedCount: solved,
      pointsEarned: earned,
      maxPoints,
      percentage: maxPoints > 0 ? Math.round((earned / maxPoints) * 100) : 0,
    };
  });

  let performanceLevel = 'In Progress';
  if (completedCount === totalQuestions) {
    if (scorePercentage >= 90) performanceLevel = 'Excellent Mastery';
    else if (scorePercentage >= 75) performanceLevel = 'Proficient';
    else if (scorePercentage >= 60) performanceLevel = 'Developing';
    else performanceLevel = 'Needs Further Practice';
  }

  const sortedTopics = [...topicStats].sort((a, b) => b.percentage - a.percentage);
  const strongest = sortedTopics[0];
  const weakest = sortedTopics[sortedTopics.length - 1];

  const strengthsText =
    completedCount === 0
      ? 'No Practice questions have been completed yet. Start the locked Practice session to generate your score and analysis.'
      : `Strongest area: ${strongest.topic} (${strongest.pointsEarned}/${strongest.maxPoints} pts, ${strongest.percentage}%). Multiple-choice score: ${mcqPoints}/${mcqMaxPoints} pts (${trialCounts[0]} solved on 1st trial); Essay score: ${essayPoints}/${essayMaxPoints} pts.`;

  let recommendationsText = '';
  if (unansweredNumbers.length > 0) {
    recommendationsText = `${unansweredNumbers.length} Practice question(s) remain incomplete (Q${unansweredNumbers.join(', Q')}). Complete all 12 questions for your full final score.`;
  } else if (missedOrRevealedNumbers.length > 0) {
    recommendationsText = `Review ${weakest.topic} (${weakest.percentage}%) and revisit Practice Q${missedOrRevealedNumbers.join(', Q')} to strengthen accuracy.`;
  } else if (scorePercentage < 90) {
    recommendationsText = `All 12 Practice questions completed! Revisit ${weakest.topic} (${weakest.percentage}%) to improve first-trial precision and full-credit essay working.`;
  } else {
    recommendationsText =
      'Strong mastery across all topics, with high first-trial accuracy on multiple-choice questions and complete written reasoning on the essay problems.';
  }

  return {
    studentName: studentName.trim(),
    completedCount,
    totalQuestions,
    isAllCompleted: completedCount === totalQuestions,
    solvedCount,
    mcqPoints,
    mcqMaxPoints,
    essayPoints,
    essayMaxPoints,
    totalScore,
    maxScore,
    scorePercentage,
    trialCounts,
    missedOrRevealedNumbers,
    unansweredNumbers,
    topicStats,
    performanceLevel,
    strengthsText,
    recommendationsText,
    violations,
  };
}

export function getPracticeAnswerDisplay(
  q: ExerciseQuestion,
  prog?: QuestionProgress
): { attemptsText: string; resultText: string; rightAnswerText: string } {
  const rightAnswerText =
    q.type === 'mcq'
      ? `${q.correctAnswer}) ${
          q.options?.find((o) => o.id === q.correctAnswer)?.text ?? ''
        }`
      : q.correctAnswer;

  if (q.type === 'essay') {
    const submitted = Boolean(prog && (prog.attempts.length > 0 || prog.revealed));
    return {
      attemptsText: prog?.essayFinalValue?.trim()
        ? prog.essayFinalValue
        : submitted
        ? 'Submitted'
        : '—',
      resultText: !submitted
        ? 'Unanswered'
        : prog?.revealed && prog.pointsEarned === 0
        ? 'Revealed (0 pts)'
        : `${prog?.pointsEarned ?? 0} / ${ESSAY_MAX_POINTS} pts`,
      rightAnswerText,
    };
  }

  const attempts = prog?.attempts ?? [];
  const attemptsText = attempts.length === 0 ? '—' : attempts.join(', ');

  let resultText = 'Unanswered';
  if (prog?.solved) {
    resultText = `Correct (Trial ${prog.solvedOnTrial})`;
  } else if (prog?.revealed) {
    resultText = 'Revealed (0 pts)';
  } else if (attempts.length >= MAX_TRIALS) {
    resultText = 'Max Trials (0 pts)';
  } else if (attempts.length > 0) {
    resultText = `In Progress (${attempts.length}/${MAX_TRIALS})`;
  }

  return { attemptsText, resultText, rightAnswerText };
}

export function buildEmailReportContent(
  studentName: string,
  practiceQuestions: ExerciseQuestion[],
  progressMap: Record<string, QuestionProgress>,
  violations: FocusViolation[]
): { subject: string; body: string; mailtoUrl: string } {
  const analysis = analyzePracticeWork(
    studentName,
    practiceQuestions,
    progressMap,
    violations
  );
  const name = (analysis.studentName || 'Student').replace(/[\r\n]+/g, ' ');
  const mcqPct =
    analysis.mcqMaxPoints > 0
      ? Math.round((analysis.mcqPoints / analysis.mcqMaxPoints) * 100)
      : 0;
  const essayPct =
    analysis.essayMaxPoints > 0
      ? Math.round((analysis.essayPoints / analysis.essayMaxPoints) * 100)
      : 0;

  const subject = `Practice Score - ${name} (MCQ: ${analysis.mcqPoints}/${analysis.mcqMaxPoints}, Essay: ${analysis.essayPoints}/${analysis.essayMaxPoints})`;

  const topicLines = analysis.topicStats
    .map(
      (t) =>
        `- ${t.topic}: ${t.pointsEarned}/${t.maxPoints} pts (${t.percentage}%), ${t.solvedCount}/${t.totalQuestions} solved`
    )
    .join('\n');

  const mcqLines = practiceQuestions
    .filter((q) => q.type === 'mcq')
    .map((q) => {
      const prog = progressMap[q.id];
      const pts = prog?.pointsEarned ?? 0;
      const status = prog?.solved
        ? `Trial ${prog.solvedOnTrial}`
        : prog?.revealed
        ? 'Revealed'
        : (prog?.attempts.length ?? 0) >= MAX_TRIALS
        ? 'Exhausted'
        : 'Unanswered';
      return `Q${q.number}: ${pts}/10 pts (${status})`;
    })
    .join('\n');

  const essayLines = practiceQuestions
    .filter((q) => q.type === 'essay')
    .map((q) => {
      const prog = progressMap[q.id];
      const pts = prog?.pointsEarned ?? 0;
      const val = prog?.essayFinalValue?.trim() || '—';
      const essaySummary = prog?.essayText?.trim()
        ? ` | Working: ${prog.essayText.trim().slice(0, 300)}`
        : '';
      return `Q${q.number}: ${pts}/50 pts (Ans: ${val}${essaySummary})`;
    })
    .join('\n');

  const body = [
    `Student Name: ${name}`,
    `Assessment: Histograms & Cumulative Frequency — Practice (Q1–Q12)`,
    ``,
    `SEPARATE SCORES:`,
    `- Multiple Choice Score (Q1–10): ${analysis.mcqPoints} / ${analysis.mcqMaxPoints} (${mcqPct}%)`,
    `- Essay Score (Q11–12): ${analysis.essayPoints} / ${analysis.essayMaxPoints} (${essayPct}%)`,
    ``,
    `Performance Level: ${analysis.performanceLevel}`,
    `Tab-Switch / Focus Alerts During Practice: ${violations.length}`,
    ``,
    `MCQ Trial Breakdown:`,
    `- 1st Trial (10 pts): ${analysis.trialCounts[0]}`,
    `- 2nd Trial (9 pts): ${analysis.trialCounts[1]}`,
    `- 3rd Trial (8.5 pts): ${analysis.trialCounts[2]}`,
    `- 4th Trial (8 pts): ${analysis.trialCounts[3]}`,
    ``,
    `Topic Analysis:`,
    topicLines,
    ``,
    `Summary:`,
    `${analysis.strengthsText}`,
    `${analysis.recommendationsText}`,
    ``,
    `1. Multiple Choice Questions (Q1–10):`,
    mcqLines,
    ``,
    `2. Essay Questions (Q11–12):`,
    essayLines,
  ].join('\n');

  const mailtoUrl = `mailto:${TEACHER_EMAIL}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  return { subject, body, mailtoUrl };
}
