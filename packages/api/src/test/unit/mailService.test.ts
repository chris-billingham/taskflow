import { describe, it, expect, vi, beforeEach } from 'vitest';

const envState = vi.hoisted(() => ({
  SMTP_HOST: undefined as string | undefined,
  SMTP_PORT: 587,
  SMTP_USER: undefined as string | undefined,
  SMTP_PASS: undefined as string | undefined,
  SMTP_FROM: 'noreply@taskflow.test',
  APP_URL: 'https://tasks.example.com' as string | undefined,
  CORS_ORIGIN: 'https://cors-origin.example.com',
}));

vi.mock('../../config/env.js', () => ({ env: envState }));

const sendMailMock = vi.hoisted(() => vi.fn());
const verifyMock = vi.hoisted(() => vi.fn());
const createTransportMock = vi.hoisted(() => vi.fn());

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

import {
  initMailer,
  isMailerReady,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWorkspaceInviteEmail,
  _resetMailerForTests,
} from '../../services/mailService.js';

const silentLogger = { info: vi.fn(), error: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  _resetMailerForTests();
  envState.SMTP_HOST = undefined;
  envState.SMTP_PORT = 587;
  envState.APP_URL = 'https://tasks.example.com';
  createTransportMock.mockReturnValue({ verify: verifyMock, sendMail: sendMailMock });
  verifyMock.mockResolvedValue(true);
  sendMailMock.mockResolvedValue({});
});

describe('initMailer', () => {
  it('stays disabled without SMTP_HOST', async () => {
    await initMailer(silentLogger);
    expect(isMailerReady()).toBe(false);
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('becomes ready only after the transport verifies', async () => {
    envState.SMTP_HOST = 'smtp.example.com';
    await initMailer(silentLogger);
    expect(verifyMock).toHaveBeenCalledOnce();
    expect(isMailerReady()).toBe(true);
  });

  it('stays disabled (without throwing) when SMTP is unreachable', async () => {
    envState.SMTP_HOST = 'smtp.example.com';
    verifyMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(initMailer(silentLogger)).resolves.toBeUndefined();
    expect(isMailerReady()).toBe(false);
    // The operator must be told loudly — this is the config that used to
    // silently lock every new registration out of logging in.
    expect(silentLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('auto-verified'),
    );
  });

  it('uses implicit TLS for port 465', async () => {
    envState.SMTP_HOST = 'smtp.example.com';
    envState.SMTP_PORT = 465;
    await initMailer(silentLogger);
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true }),
    );
  });
});

describe('sending', () => {
  beforeEach(async () => {
    envState.SMTP_HOST = 'smtp.example.com';
    await initMailer(silentLogger);
  });

  it('throws when the mailer is not ready', async () => {
    _resetMailerForTests();
    await expect(
      sendVerificationEmail('user@example.com', 'User', 'tok'),
    ).rejects.toThrow(/not ready/);
  });

  it('sends the verification link built from APP_URL', async () => {
    await sendVerificationEmail('user@example.com', 'User', 'raw-token-1');
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.to).toBe('user@example.com');
    expect(msg.from).toBe('noreply@taskflow.test');
    expect(msg.text).toContain(
      'https://tasks.example.com/verify-email?token=raw-token-1',
    );
  });

  it('falls back to CORS_ORIGIN when APP_URL is unset', async () => {
    envState.APP_URL = undefined;
    await sendPasswordResetEmail('user@example.com', 'User', 'raw-token-2');
    expect(sendMailMock.mock.calls[0][0].text).toContain(
      'https://cors-origin.example.com/reset-password?token=raw-token-2',
    );
  });

  it('escapes HTML in user-controlled fields', async () => {
    await sendWorkspaceInviteEmail(
      'user@example.com',
      '<script>alert(1)</script>',
      'Acme & Co',
      'tok',
    );
    const html = sendMailMock.mock.calls[0][0].html as string;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('/join?token=tok');
  });
});
