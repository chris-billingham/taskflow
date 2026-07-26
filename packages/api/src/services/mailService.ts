import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

// Email delivery is optional for self-hosted deployments. The critical
// contract: registration must never gate on email verification unless the
// mailer is PROVEN working (transport verified at boot) — a configured-but-
// broken SMTP host would otherwise permanently lock every new user out of the
// account they just created.

let transporter: Transporter | null = null;
let ready = false;

export function isMailerReady(): boolean {
  return ready;
}

type MinimalLogger = {
  info: (msg: string) => void;
  error: (msg: string) => void;
};

export async function initMailer(
  logger: MinimalLogger = { info: console.info, error: console.error },
): Promise<void> {
  if (!env.SMTP_HOST) {
    ready = false;
    logger.info(
      'SMTP not configured — email features disabled; new accounts are auto-verified',
    );
    return;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
  });

  try {
    await transporter.verify();
    ready = true;
    logger.info(`SMTP transport verified (${env.SMTP_HOST}:${env.SMTP_PORT}) — email enabled`);
  } catch (err) {
    ready = false;
    transporter = null;
    logger.error(
      `SMTP is configured (${env.SMTP_HOST}:${env.SMTP_PORT}) but unreachable: ${
        err instanceof Error ? err.message : String(err)
      }. Email features are DISABLED and new accounts will be auto-verified so registrations are not locked out. Fix the SMTP settings and restart to enable email.`,
    );
  }
}

/** Test hook: reset module state between unit tests. */
export function _resetMailerForTests(): void {
  transporter = null;
  ready = false;
}

function appUrl(): string {
  return (env.APP_URL ?? env.CORS_ORIGIN).replace(/\/+$/, '');
}

async function send(to: string, subject: string, text: string, html: string) {
  if (!ready || !transporter) {
    throw new Error('Mailer is not ready');
  }
  await transporter.sendMail({ from: env.SMTP_FROM, to, subject, text, html });
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, bodyHtml: string): string {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">
  <h2 style="color:#111827;margin:0 0 16px">${escapeHtml(title)}</h2>
  ${bodyHtml}
  <p style="color:#6b7280;font-size:12px;margin-top:32px">Sent by Taskflow. If you didn't expect this email you can ignore it.</p>
</div>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;display:inline-block">${escapeHtml(label)}</a></p>
<p style="color:#6b7280;font-size:13px">Or paste this link into your browser:<br>${href}</p>`;
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
): Promise<void> {
  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  await send(
    to,
    'Verify your Taskflow email address',
    `Hi ${name},\n\nConfirm your email address to finish setting up your Taskflow account:\n${link}\n\nThe link expires in 24 hours.`,
    layout(
      'Verify your email',
      `<p>Hi ${escapeHtml(name)},</p><p>Confirm your email address to finish setting up your Taskflow account. The link expires in 24 hours.</p>${button(link, 'Verify email')}`,
    ),
  );
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
): Promise<void> {
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await send(
    to,
    'Reset your Taskflow password',
    `Hi ${name},\n\nSomeone requested a password reset for your Taskflow account. If this was you, reset it here:\n${link}\n\nThe link expires in 1 hour. If it wasn't you, ignore this email.`,
    layout(
      'Reset your password',
      `<p>Hi ${escapeHtml(name)},</p><p>Someone requested a password reset for your Taskflow account. If this was you, reset it below — the link expires in 1 hour. If it wasn't you, ignore this email.</p>${button(link, 'Reset password')}`,
    ),
  );
}

export async function sendWorkspaceInviteEmail(
  to: string,
  inviterName: string,
  workspaceName: string,
  token: string,
): Promise<void> {
  const link = `${appUrl()}/join?token=${encodeURIComponent(token)}`;
  await send(
    to,
    `${inviterName} invited you to "${workspaceName}" on Taskflow`,
    `${inviterName} invited you to join the workspace "${workspaceName}" on Taskflow:\n${link}\n\nThe invite expires in 7 days.`,
    layout(
      'Workspace invitation',
      `<p>${escapeHtml(inviterName)} invited you to join the workspace <strong>${escapeHtml(workspaceName)}</strong> on Taskflow. The invite expires in 7 days.</p>${button(link, 'Accept invite')}`,
    ),
  );
}

export async function sendNotificationEmail(
  to: string,
  name: string,
  subject: string,
  bodyText: string,
): Promise<void> {
  await send(
    to,
    subject,
    `Hi ${name},\n\n${bodyText}`,
    layout(
      subject,
      `<p>Hi ${escapeHtml(name)},</p><p style="white-space:pre-line">${escapeHtml(bodyText)}</p>`,
    ),
  );
}
