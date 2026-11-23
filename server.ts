import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRACTICE_PART_QUESTIONS } from './src/data/questions.ts';
import {
  ESSAY_MAX_POINTS,
  type FocusViolation,
  MAX_TRIALS,
  type QuestionProgress,
} from './src/types/exercise.ts';
import {
  analyzePracticeWork,
  buildEmailReportContent,
  getPracticeAnswerDisplay,
  recomputeVerifiedPracticeProgress,
  TEACHER_EMAIL,
} from './src/utils/scoring.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Deduplicate identical automatic email submissions in memory (cap at 500 entries)
const sentSubmissions = new Map<
  string,
  { sentAt: string; messageId: string; provider: string }
>();

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeViolations(raw: unknown): FocusViolation[] {
  if (!Array.isArray(raw)) return [];
  const allowedReasons = new Set<FocusViolation['reason']>([
    'tab-switch',
    'window-blur',
    'exit-fullscreen',
  ]);
  return raw.slice(0, 100).flatMap((item): FocusViolation[] => {
    if (!item || typeof item !== 'object') return [];
    const obj = item as Record<string, unknown>;
    const reason = obj.reason;
    const timestamp =
      typeof obj.timestamp === 'string' ? obj.timestamp.slice(0, 30) : '';
    const questionNumber =
      typeof obj.questionNumber === 'number' && Number.isFinite(obj.questionNumber)
        ? Math.max(1, Math.min(12, Math.trunc(obj.questionNumber)))
        : 1;
    if (
      typeof reason !== 'string' ||
      !allowedReasons.has(reason as FocusViolation['reason'])
    ) {
      return [];
    }
    return [
      {
        timestamp,
        reason: reason as FocusViolation['reason'],
        questionNumber,
      },
    ];
  });
}

function getEmailProviderConfig():
  | { kind: 'resend'; apiKey: string; from: string }
  | {
      kind: 'smtp';
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      from: string;
    }
  | null {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    return {
      kind: 'resend',
      apiKey: resendKey,
      from:
        process.env.SMTP_FROM?.trim() ||
        'Histograms Exercise <onboarding@resend.dev>',
    };
  }

  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  if (smtpUser && smtpPass) {
    const port = Number(process.env.SMTP_PORT) || 465;
    return {
      kind: 'smtp',
      host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
      port,
      secure: port === 465,
      user: smtpUser,
      pass: smtpPass,
      from: process.env.SMTP_FROM?.trim() || smtpUser,
    };
  }

  return null;
}

function buildHtmlEmailBody(
  studentName: string,
  verifiedProgress: Record<string, QuestionProgress>,
  violations: FocusViolation[]
): string {
  const analysis = analyzePracticeWork(
    studentName,
    PRACTICE_PART_QUESTIONS,
    verifiedProgress,
    violations
  );
  const mcqPct =
    analysis.mcqMaxPoints > 0
      ? Math.round((analysis.mcqPoints / analysis.mcqMaxPoints) * 100)
      : 0;
  const essayPct =
    analysis.essayMaxPoints > 0
      ? Math.round((analysis.essayPoints / analysis.essayMaxPoints) * 100)
      : 0;

  const mcqRowsHtml = PRACTICE_PART_QUESTIONS.filter((q) => q.type === 'mcq')
    .map((q) => {
      const prog = verifiedProgress[q.id];
      const { attemptsText, resultText, rightAnswerText } =
        getPracticeAnswerDisplay(q, prog);
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;">Q${q.number}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(q.topic)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(attemptsText)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(resultText)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(rightAnswerText)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${prog?.pointsEarned ?? 0}</td>
        </tr>`;
    })
    .join('');

  const essayRowsHtml = PRACTICE_PART_QUESTIONS.filter((q) => q.type === 'essay')
    .map((q) => {
      const prog = verifiedProgress[q.id];
      const { attemptsText, resultText, rightAnswerText } =
        getPracticeAnswerDisplay(q, prog);
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;">Q${q.number}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(q.topic)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(attemptsText)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(resultText)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(rightAnswerText)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${prog?.pointsEarned ?? 0} / ${ESSAY_MAX_POINTS}</td>
        </tr>`;
    })
    .join('');

  const essayWorkingHtml = PRACTICE_PART_QUESTIONS.filter(
    (q) => q.type === 'essay'
  )
    .map((q) => {
      const prog = verifiedProgress[q.id];
      const working = prog?.essayText?.trim() || 'No written essay submitted.';
      const ans = prog?.essayFinalValue?.trim() || '—';
      return `
        <div style="margin-top:10px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
          <div style="font-weight:600;color:#47104e;">Practice Q${q.number}: ${escapeHtml(q.subPrompt ?? q.prompt)}</div>
          <div style="margin-top:4px;font-size:13px;color:#334155;"><strong>Final Value:</strong> ${escapeHtml(ans)} &middot; <strong>Score:</strong> ${prog?.pointsEarned ?? 0}/${ESSAY_MAX_POINTS} pts</div>
          <div style="margin-top:6px;font-size:13px;color:#0f172a;white-space:pre-wrap;">${escapeHtml(working)}</div>
        </div>`;
    })
    .join('');

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:740px;margin:0 auto;color:#0f172a;line-height:1.5;">
      <div style="background:#47104e;color:#ffffff;padding:20px 24px;border-radius:10px 10px 0 0;">
        <h1 style="margin:0;font-size:18px;">Histograms &amp; Cumulative Frequency — Practice Score Report</h1>
        <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">Student: <strong>${escapeHtml(analysis.studentName)}</strong> &middot; Submitted ${escapeHtml(new Date().toLocaleString())}</p>
      </div>
      <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;background:#ffffff;">
        <table style="width:100%;border-collapse:separate;border-spacing:10px 0;margin:0 -10px 18px;">
          <tr>
            <td style="width:50%;padding:14px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;">
              <div style="font-size:12px;color:#581c87;font-weight:600;">Multiple Choice Score (Q1–10)</div>
              <div style="font-size:24px;font-weight:700;color:#3b0764;margin-top:4px;">${analysis.mcqPoints} / ${analysis.mcqMaxPoints} (${mcqPct}%)</div>
              <div style="font-size:12px;color:#6b21a8;margin-top:4px;">T1: ${analysis.trialCounts[0]} &middot; T2: ${analysis.trialCounts[1]} &middot; T3: ${analysis.trialCounts[2]} &middot; T4: ${analysis.trialCounts[3]}</div>
            </td>
            <td style="width:50%;padding:14px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;">
              <div style="font-size:12px;color:#312e81;font-weight:600;">Essay Score (Q11–12)</div>
              <div style="font-size:24px;font-weight:700;color:#1e1b4b;margin-top:4px;">${analysis.essayPoints} / ${analysis.essayMaxPoints} (${essayPct}%)</div>
              <div style="font-size:12px;color:#3730a3;margin-top:4px;">50 pts per essay &middot; Tab alerts: ${violations.length}</div>
            </td>
          </tr>
        </table>

        <p style="font-size:13px;color:#334155;margin:0 0 14px;">
          <strong>Summary:</strong> ${escapeHtml(analysis.strengthsText)} ${escapeHtml(analysis.recommendationsText)}
        </p>

        <h2 style="font-size:15px;margin:18px 0 8px;color:#0f172a;">1. Multiple Choice Questions (Q1–10) — ${analysis.mcqPoints} / ${analysis.mcqMaxPoints}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#0f172a;color:#ffffff;text-align:left;">
              <th style="padding:8px 10px;">Q#</th>
              <th style="padding:8px 10px;">Topic</th>
              <th style="padding:8px 10px;">Attempts</th>
              <th style="padding:8px 10px;">Status</th>
              <th style="padding:8px 10px;">Right Answer</th>
              <th style="padding:8px 10px;text-align:right;">Pts</th>
            </tr>
          </thead>
          <tbody>${mcqRowsHtml}</tbody>
        </table>

        <h2 style="font-size:15px;margin:20px 0 8px;color:#0f172a;">2. Essay Questions (Q11–12) — ${analysis.essayPoints} / ${analysis.essayMaxPoints}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#47104e;color:#ffffff;text-align:left;">
              <th style="padding:8px 10px;">Q#</th>
              <th style="padding:8px 10px;">Topic</th>
              <th style="padding:8px 10px;">Final Value</th>
              <th style="padding:8px 10px;">Status</th>
              <th style="padding:8px 10px;">Right Answer</th>
              <th style="padding:8px 10px;text-align:right;">Pts</th>
            </tr>
          </thead>
          <tbody>${essayRowsHtml}</tbody>
        </table>

        <h2 style="font-size:15px;margin:20px 0 8px;color:#0f172a;">Written Essay Responses</h2>
        ${essayWorkingHtml}
      </div>
    </div>`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/email-status', (_req, res) => {
    const cfg = getEmailProviderConfig();
    res.json({
      configured: Boolean(cfg),
      provider: cfg?.kind ?? null,
      recipient: TEACHER_EMAIL,
    });
  });

  app.post('/api/send-score', async (req, res) => {
    try {
      const body = req.body as Record<string, unknown> | null;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ sent: false, error: 'Invalid request payload.' });
        return;
      }

      const rawName = typeof body.studentName === 'string' ? body.studentName : '';
      const studentName = rawName.replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
      if (!studentName) {
        res.status(400).json({
          sent: false,
          error: 'Student name is required before sending the final score.',
        });
        return;
      }

      const rawProgressMap =
        body.progressMap && typeof body.progressMap === 'object'
          ? (body.progressMap as Record<string, unknown>)
          : {};
      const verifiedProgress = recomputeVerifiedPracticeProgress(
        PRACTICE_PART_QUESTIONS,
        rawProgressMap
      );
      const violations = sanitizeViolations(body.violations);

      // Verify all 12 practice questions are completed before auto-sending
      const completedCount = PRACTICE_PART_QUESTIONS.filter((q) => {
        const p = verifiedProgress[q.id];
        if (!p) return false;
        if (q.type === 'essay') return p.solved || p.revealed || p.attempts.length > 0;
        return p.solved || p.revealed || p.attempts.length >= MAX_TRIALS;
      }).length;

      if (completedCount < PRACTICE_PART_QUESTIONS.length) {
        res.status(400).json({
          sent: false,
          error: `Only ${completedCount} of ${PRACTICE_PART_QUESTIONS.length} Practice questions are completed.`,
        });
        return;
      }

      const signature = crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            studentName,
            verifiedProgress,
            violationCount: violations.length,
          })
        )
        .digest('hex');

      const forceResend = Boolean(body.forceResend);
      const cached = sentSubmissions.get(signature);
      if (cached && !forceResend) {
        res.json({
          sent: true,
          configured: true,
          deduplicated: true,
          recipient: TEACHER_EMAIL,
          sentAt: cached.sentAt,
          provider: cached.provider,
          messageId: cached.messageId,
        });
        return;
      }

      const cfg = getEmailProviderConfig();
      if (!cfg) {
        res.json({
          sent: false,
          configured: false,
          recipient: TEACHER_EMAIL,
          message:
            'Automatic server email requires RESEND_API_KEY or SMTP_USER & SMTP_PASS in Settings -> Secrets.',
        });
        return;
      }

      const { subject, body: textBody } = buildEmailReportContent(
        studentName,
        PRACTICE_PART_QUESTIONS,
        verifiedProgress,
        violations
      );
      const htmlBody = buildHtmlEmailBody(
        studentName,
        verifiedProgress,
        violations
      );

      // Validate optional base64 PDF attachment (max 2.5 MB decoded)
      let attachmentBuffer: Buffer | null = null;
      let attachmentFilename = 'Practice_Report.pdf';
      if (typeof body.pdfBase64 === 'string' && body.pdfBase64.length > 0) {
        const cleanedB64 = body.pdfBase64.replace(/\s+/g, '');
        if (/^[A-Za-z0-9+/=]+$/.test(cleanedB64) && cleanedB64.length <= 3_500_000) {
          const buf = Buffer.from(cleanedB64, 'base64');
          if (buf.subarray(0, 4).toString('utf8') === '%PDF') {
            attachmentBuffer = buf;
            const slug = studentName
              .replace(/[^a-zA-Z0-9_-]+/g, '_')
              .replace(/^_+|_+$/g, '');
            attachmentFilename = `${slug || 'Student'}_Practice_Report.pdf`;
          }
        }
      }

      let messageId = '';
      if (cfg.kind === 'resend') {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: cfg.from,
            to: [TEACHER_EMAIL],
            subject,
            text: textBody,
            html: htmlBody,
            ...(attachmentBuffer
              ? {
                  attachments: [
                    {
                      filename: attachmentFilename,
                      content: attachmentBuffer.toString('base64'),
                    },
                  ],
                }
              : {}),
          }),
        });

        const resendData = (await resendRes.json().catch(() => ({}))) as {
          id?: string;
          message?: string;
        };
        if (!resendRes.ok) {
          res.status(502).json({
            sent: false,
            configured: true,
            recipient: TEACHER_EMAIL,
            error:
              resendData.message ||
              `Email provider returned status ${resendRes.status}.`,
          });
          return;
        }
        messageId = resendData.id || 'resend-ok';
      } else {
        const transporter = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth: {
            user: cfg.user,
            pass: cfg.pass,
          },
        });

        const info = await transporter.sendMail({
          from: cfg.from,
          to: TEACHER_EMAIL,
          subject,
          text: textBody,
          html: htmlBody,
          ...(attachmentBuffer
            ? {
                attachments: [
                  {
                    filename: attachmentFilename,
                    content: attachmentBuffer,
                    contentType: 'application/pdf',
                  },
                ],
              }
            : {}),
        });
        messageId = info.messageId || 'smtp-ok';
      }

      const sentAt = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      if (sentSubmissions.size > 500) {
        sentSubmissions.clear();
      }
      sentSubmissions.set(signature, { sentAt, messageId, provider: cfg.kind });

      res.json({
        sent: true,
        configured: true,
        recipient: TEACHER_EMAIL,
        sentAt,
        provider: cfg.kind,
        messageId,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unexpected email delivery error.';
      res.status(500).json({
        sent: false,
        configured: true,
        recipient: TEACHER_EMAIL,
        error: msg,
      });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
