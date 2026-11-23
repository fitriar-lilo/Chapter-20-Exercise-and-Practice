import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ExerciseQuestion,
  FocusViolation,
  QuestionProgress,
} from '../types/exercise';
import {
  analyzePracticeWork,
  getPracticeAnswerDisplay,
  TEACHER_EMAIL,
} from './scoring';

export * from './scoring';

function createPracticePdfDoc(
  studentName: string,
  exerciseQuestions: ExerciseQuestion[],
  practiceQuestions: ExerciseQuestion[],
  progressMap: Record<string, QuestionProgress>,
  violations: FocusViolation[]
): { doc: jsPDF; filename: string } {
  const analysis = analyzePracticeWork(
    studentName,
    practiceQuestions,
    progressMap,
    violations
  );
  const displayStudent = analysis.studentName || 'Student (Name Not Provided)';
  const nowStr = new Date().toLocaleString();
  const exerciseDoneCount = exerciseQuestions.filter(
    (q) => progressMap[q.id]?.solved || progressMap[q.id]?.revealed
  ).length;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Orion Nebula Header Banner
  doc.setFillColor(71, 16, 78);
  doc.rect(0, 0, 210, 27, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Histograms & Cumulative Frequency — Practice Report', 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Student Name: ${displayStudent}`, 14, 20);
  doc.text(`Generated: ${nowStr}`, 196, 20, { align: 'right' });

  const mcqPct =
    analysis.mcqMaxPoints > 0
      ? Math.round((analysis.mcqPoints / analysis.mcqMaxPoints) * 100)
      : 0;
  const essayPct =
    analysis.essayMaxPoints > 0
      ? Math.round((analysis.essayPoints / analysis.essayMaxPoints) * 100)
      : 0;

  // Separate Score Summary Box
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 33, 182, 31, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Multiple Choice Score (Q1–10): ${analysis.mcqPoints} / ${analysis.mcqMaxPoints} (${mcqPct}%)`,
    19,
    41
  );
  doc.text(
    `Essay Score (Q11–12): ${analysis.essayPoints} / ${analysis.essayMaxPoints} (${essayPct}%)`,
    19,
    48
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `MCQ Trials — 1st (10): ${analysis.trialCounts[0]}  |  2nd (9): ${analysis.trialCounts[1]}  |  3rd (8.5): ${analysis.trialCounts[2]}  |  4th (8): ${analysis.trialCounts[3]}`,
    19,
    55
  );
  doc.text(
    `Exercise Reviewed (Ungraded): ${exerciseDoneCount}/${exerciseQuestions.length}  |  Tab-Switch Alerts: ${violations.length}  |  Level: ${analysis.performanceLevel}`,
    19,
    61
  );

  // Summary & Analysis
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Performance Summary & Analysis', 14, 73);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  const summaryLines = doc.splitTextToSize(
    `${analysis.strengthsText} ${analysis.recommendationsText}`,
    182
  );
  doc.text(summaryLines, 14, 79);

  const afterSummaryY = 79 + summaryLines.length * 4.7 + 3;

  // Topic Table
  autoTable(doc, {
    startY: afterSummaryY,
    head: [['Topic', 'Questions', 'Solved', 'Points Earned', 'Accuracy']],
    body: analysis.topicStats.map((t) => [
      t.topic,
      String(t.totalQuestions),
      String(t.solvedCount),
      `${t.pointsEarned} / ${t.maxPoints}`,
      `${t.percentage}%`,
    ]),
    styles: { fontSize: 8.5, cellPadding: 2.3 },
    headStyles: { fillColor: [71, 16, 78], textColor: [255, 255, 255] },
    margin: { left: 14, right: 14 },
  });

  const afterTopicY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      afterSummaryY + 26) + 7;

  const mcqQuestions = practiceQuestions.filter((q) => q.type === 'mcq');
  const essayQuestions = practiceQuestions.filter((q) => q.type === 'essay');

  // Table 1: Multiple Choice Questions (Q1-Q10)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `1. Multiple Choice Questions (Q1–10) — Score: ${analysis.mcqPoints} / ${analysis.mcqMaxPoints}`,
    14,
    afterTopicY
  );

  autoTable(doc, {
    startY: afterTopicY + 3,
    head: [['Q#', 'Topic', 'Attempts', 'Status', 'Right Answer', 'Pts']],
    body: mcqQuestions.map((q) => {
      const prog = progressMap[q.id];
      const { attemptsText, resultText, rightAnswerText } =
        getPracticeAnswerDisplay(q, prog);
      return [
        `Q${q.number}`,
        q.topic,
        attemptsText,
        resultText,
        rightAnswerText,
        String(prog?.pointsEarned ?? 0),
      ];
    }),
    foot: [
      [
        '',
        '',
        '',
        '',
        'Multiple Choice Total',
        `${analysis.mcqPoints} / ${analysis.mcqMaxPoints}`,
      ],
    ],
    styles: { fontSize: 8, cellPadding: 2.1, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 11 },
      1: { cellWidth: 32 },
      2: { cellWidth: 22 },
      3: { cellWidth: 31 },
      4: { cellWidth: 70 },
      5: { cellWidth: 16, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  const afterMcqY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      afterTopicY + 55) + 8;

  // Table 2: Essay Questions (Q11-Q12)
  let essayStartY = afterMcqY;
  if (essayStartY > 235) {
    doc.addPage();
    essayStartY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `2. Essay Questions (Q11–12) — Score: ${analysis.essayPoints} / ${analysis.essayMaxPoints}`,
    14,
    essayStartY
  );

  autoTable(doc, {
    startY: essayStartY + 3,
    head: [['Q#', 'Topic', 'Your Final Value', 'Status', 'Right Answer', 'Pts']],
    body: essayQuestions.map((q) => {
      const prog = progressMap[q.id];
      const { attemptsText, resultText, rightAnswerText } =
        getPracticeAnswerDisplay(q, prog);
      return [
        `Q${q.number}`,
        q.topic,
        attemptsText,
        resultText,
        rightAnswerText,
        String(prog?.pointsEarned ?? 0),
      ];
    }),
    foot: [
      [
        '',
        '',
        '',
        '',
        'Essay Total',
        `${analysis.essayPoints} / ${analysis.essayMaxPoints}`,
      ],
    ],
    styles: { fontSize: 8, cellPadding: 2.1, overflow: 'linebreak' },
    headStyles: { fillColor: [71, 16, 78], textColor: [255, 255, 255] },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 11 },
      1: { cellWidth: 32 },
      2: { cellWidth: 28 },
      3: { cellWidth: 31 },
      4: { cellWidth: 64 },
      5: { cellWidth: 16, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  // Written Essay Responses Section
  const afterTableY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      essayStartY + 35) + 8;

  let cursorY = afterTableY;
  if (cursorY > 240) {
    doc.addPage();
    cursorY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Student Written Essay Working (Q11 & Q12)', 14, cursorY);
  cursorY += 6;

  for (const eq of essayQuestions) {
    const prog = progressMap[eq.id];
    const responseBody = prog?.essayText?.trim() || 'No written essay submitted.';
    const finalAns = prog?.essayFinalValue?.trim() || '—';
    const blockLines = doc.splitTextToSize(
      `Final Answer: ${finalAns} | Points: ${prog?.pointsEarned ?? 0}/50\nWorking: ${responseBody}`,
      180
    );
    if (cursorY + blockLines.length * 4.5 + 10 > 278) {
      doc.addPage();
      cursorY = 16;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 16, 78);
    doc.text(`Practice Q${eq.number}: ${eq.subPrompt ?? eq.prompt}`, 14, cursorY);
    cursorY += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(blockLines, 14, cursorY);
    cursorY += blockLines.length * 4.5 + 5;
  }

  // Page Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Page ${i} of ${pageCount} · Submitted for ${TEACHER_EMAIL}`,
      105,
      290,
      { align: 'center' }
    );
  }

  const safeSlug = (analysis.studentName || 'Student')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return {
    doc,
    filename: `${safeSlug || 'Student'}_Practice_Report.pdf`,
  };
}

export function downloadPracticePdf(
  studentName: string,
  exerciseQuestions: ExerciseQuestion[],
  practiceQuestions: ExerciseQuestion[],
  progressMap: Record<string, QuestionProgress>,
  violations: FocusViolation[]
): void {
  const { doc, filename } = createPracticePdfDoc(
    studentName,
    exerciseQuestions,
    practiceQuestions,
    progressMap,
    violations
  );
  doc.save(filename);
}

export function generatePracticePdfBase64(
  studentName: string,
  exerciseQuestions: ExerciseQuestion[],
  practiceQuestions: ExerciseQuestion[],
  progressMap: Record<string, QuestionProgress>,
  violations: FocusViolation[]
): { filename: string; base64: string } {
  const { doc, filename } = createPracticePdfDoc(
    studentName,
    exerciseQuestions,
    practiceQuestions,
    progressMap,
    violations
  );
  const dataUri = doc.output('datauristring');
  const commaIdx = dataUri.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : '';
  return { filename, base64 };
}
