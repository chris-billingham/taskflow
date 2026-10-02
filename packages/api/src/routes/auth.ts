import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  loginResponse,
  signedInResponse,
  twoFactorLoginSchema,
  ssoStatusSchema,
  registerResponse,
  refreshResponse,
  registrationStatusSchema,
  messageResponse,
  ok,
} from '@taskflow/contract';
import * as authService from '../services/authService.js';
import * as instanceSettings from '../services/instanceSettingsService.js';
import { UnauthorizedError } from '../errors/index.js';
import { z } from 'zod';
import { env, isOidcConfigured } from '../config/env.js';
import * as oidc from '../services/oidc.js';
import { generateChallengeToken } from '../utils/jwt.js';
import { rateLimitMax } from '../config/rateLimits.js';

// Refresh token cookie is httpOnly + SameSite=Strict.
// SameSite=Strict prevents cross-origin requests from carrying the cookie,
// which eliminates CSRF for these endpoints without a separate CSRF token.
// All other API endpoints use Authorization: Bearer (not cookies), so they
// are not CSRF-vulnerable regardless.
const REFRESH_COOKIE = 'refreshToken';
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
};

// The sign-in in progress at the provider. Lax, not Strict: the provider
// sends the browser back with a cross-site navigation.
const OIDC_COOKIE = 'oidcLogin';
const oidcCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1/auth/oidc',
  maxAge: oidc.PENDING_TTL_S,
};

/** Only paths on this site, never another origin. */
const safeRedirect = (value: string | undefined) =>
  value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/today';

type SignedIn = Awaited<ReturnType<typeof authService.completeTwoFactorLogin>>;

/** Browsers keep the refresh token in an httpOnly cookie; apps keep it themselves (e.g. the iOS keychain). */
function sendSignedIn(reply: FastifyReply, client: 'web' | 'app', { user, accessToken, refreshToken }: SignedIn) {
  if (client === 'app') return { success: true as const, data: { user, accessToken, refreshToken } };
  reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
  return { success: true as const, data: { user, accessToken } };
}

// Everything here is reachable without a token.
const tags = ['Auth'];
const security: [] = [];

export async function authRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/register',
    {
      config: { rateLimit: { max: rateLimitMax(5), timeWindow: '1 hour' } },
      schema: {
        tags,
        security,
        summary: 'Create an account (subject to the sign-up policy)',
        body: registerSchema,
        response: { 201: registerResponse },
      },
    },
    async (request, reply) => {
      const { client, deviceName } = request.body;
      const registered = await authService.register(request.body, {
        client,
        deviceName,
        userAgent: request.headers['user-agent'],
      });
      if (registered.verificationRequired) {
        // Account created, verification email sent; no session until verified.
        return reply
          .status(201)
          .send({ success: true, data: { user: registered.user, verificationRequired: true } });
      }
      if (client === 'web') reply.setCookie(REFRESH_COOKIE, registered.refreshToken, refreshCookieOptions);
      return reply.status(201).send({
        success: true,
        data: {
          user: registered.user,
          accessToken: registered.accessToken,
          ...(client === 'app' && { refreshToken: registered.refreshToken }),
          verificationRequired: false,
        },
      });
    },
  );

  app.post(
    '/login',
    {
      config: { rateLimit: { max: rateLimitMax(5), timeWindow: '15 minutes' } },
      schema: {
        tags,
        security,
        summary:
          'Sign in: returns an access token and sets the refresh cookie, or a challenge when the account uses two-factor sign-in',
        body: loginSchema,
        response: { 200: loginResponse },
      },
    },
    async (request, reply) => {
      const { email, password, client, deviceName } = request.body;
      const result = await authService.login(email, password, {
        client,
        deviceName,
        userAgent: request.headers['user-agent'],
      });
      if ('twoFactorRequired' in result) return { success: true as const, data: result };
      return sendSignedIn(reply, client, result);
    },
  );

  app.post(
    '/login/two-factor',
    {
      config: { rateLimit: { max: rateLimitMax(10), timeWindow: '15 minutes' } },
      schema: {
        tags,
        security,
        summary: 'Sign in, step two: the challenge from /auth/login and a code from the authenticator app (or a recovery code)',
        body: twoFactorLoginSchema,
        response: { 200: signedInResponse },
      },
    },
    async (request, reply) => {
      const { challengeToken, code, recoveryCode, client, deviceName } = request.body;
      const result = await authService.completeTwoFactorLogin(
        challengeToken,
        { code, recoveryCode },
        { client, deviceName, userAgent: request.headers['user-agent'] },
      );
      return sendSignedIn(reply, client, result);
    },
  );

  app.get(
    '/sso',
    {
      schema: {
        tags,
        security,
        summary: 'Whether single sign-on is available, and its name',
        response: { 200: ok(ssoStatusSchema) },
      },
    },
    async () => {
      const enabled = isOidcConfigured();
      return { success: true as const, data: { enabled, name: enabled ? env.OIDC_NAME : null } };
    },
  );

  // Single sign-on happens in the browser by redirects, so these two aren't
  // in the API document. The login page links to /oidc/start.
  app.get(
    '/oidc/start',
    { schema: { hide: true, querystring: z.object({ redirect: z.string().max(2000).optional() }) } },
    async (request, reply) => {
      try {
        const { url, pending } = await oidc.startLogin(safeRedirect(request.query.redirect));
        reply.setCookie(OIDC_COOKIE, pending, oidcCookieOptions);
        return reply.redirect(url);
      } catch (err) {
        if (err instanceof oidc.SsoError) return reply.redirect(`/login?sso_error=${err.reason}`);
        request.log.error({ err }, 'single sign-on: could not reach the provider');
        return reply.redirect('/login?sso_error=failed');
      }
    },
  );

  app.get('/oidc/callback', { schema: { hide: true } }, async (request, reply) => {
    const pending = oidc.readPending(request.cookies[OIDC_COOKIE]);
    reply.clearCookie(OIDC_COOKIE, { path: oidcCookieOptions.path });
    const back = pending ? `&redirect=${encodeURIComponent(pending.redirect)}` : '';
    const fail = (reason: oidc.SsoFailure) => reply.redirect(`/login?sso_error=${reason}${back}`);
    if (!pending) return fail('expired');

    try {
      const claims = await oidc.finishLogin(new URL(request.url, oidc.redirectUri()), pending);
      const user = await oidc.resolveUser(claims);
      if (!user.isActive) return fail('suspended');
      // Taskflow's own two-factor sign-in still applies. The challenge goes in
      // the fragment, which browsers never send to a server or log.
      if (user.twoFactorEnabledAt) {
        return reply.redirect(
          `/login?redirect=${encodeURIComponent(pending.redirect)}#two-factor=${generateChallengeToken(user.id)}`,
        );
      }
      const session = await authService.signIn(user, { client: 'web', userAgent: request.headers['user-agent'] });
      reply.setCookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions);
      return reply.redirect(pending.redirect);
    } catch (err) {
      if (err instanceof oidc.SsoError) return fail(err.reason);
      request.log.error({ err }, 'single sign-on failed');
      return fail('failed');
    }
  });

  app.post(
    '/logout',
    {
      schema: {
        tags,
        security,
        summary: 'Sign out: revokes the refresh token (the cookie, or an app\'s token in the body)',
        body: refreshSchema,
        response: { 200: messageResponse },
      },
    },
    async (request, reply) => {
      const refreshToken = request.body?.refreshToken ?? request.cookies[REFRESH_COOKIE];
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      return { success: true as const, message: 'Logged out successfully' };
    },
  );

  app.post(
    '/refresh',
    {
      schema: {
        tags,
        security,
        summary: 'Exchange a refresh token for a new pair: the cookie for the web app, or an app\'s token sent in the body',
        body: refreshSchema,
        response: { 200: refreshResponse },
      },
    },
    async (request, reply) => {
      // An app sends its token in the body and gets the new one back there.
      const fromBody = request.body?.refreshToken;
      const refreshToken = fromBody ?? request.cookies[REFRESH_COOKIE];
      if (!refreshToken) {
        throw new UnauthorizedError('No refresh token');
      }
      const { accessToken, refreshToken: newRefreshToken } = await authService.refreshTokens(refreshToken, {
        client: fromBody ? 'app' : 'web',
        userAgent: request.headers['user-agent'],
      });
      if (fromBody) return { success: true as const, data: { accessToken, refreshToken: newRefreshToken } };
      reply.setCookie(REFRESH_COOKIE, newRefreshToken, refreshCookieOptions);
      return { success: true as const, data: { accessToken } };
    },
  );

  app.get(
    '/registration',
    {
      schema: {
        tags,
        security,
        summary: 'Whether anyone may sign up right now',
        response: { 200: ok(registrationStatusSchema) },
      },
    },
    async () => {
      const [mode, open] = await Promise.all([
        instanceSettings.getRegistrationMode(),
        instanceSettings.isRegistrationOpen(),
      ]);
      return { success: true as const, data: { mode, open } };
    },
  );

  app.post(
    '/forgot-password',
    {
      config: { rateLimit: { max: rateLimitMax(3), timeWindow: '1 hour' } },
      schema: {
        tags,
        security,
        summary: 'Email a password-reset link (the reply never reveals whether the address exists)',
        body: forgotPasswordSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await authService.forgotPassword(request.body.email)),
    }),
  );

  app.post(
    '/reset-password',
    {
      config: { rateLimit: { max: rateLimitMax(5), timeWindow: '1 hour' } },
      schema: {
        tags,
        security,
        summary: 'Set a new password with a reset token',
        body: resetPasswordSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await authService.resetPassword(request.body.token, request.body.password)),
    }),
  );

  // POST with the token in the body: as a GET query string it was written to
  // every access log between the browser and the API.
  app.post(
    '/verify-email',
    {
      // Tokens must not be brute-forceable and the lookup shouldn't be a free
      // DoS lever.
      config: { rateLimit: { max: rateLimitMax(10), timeWindow: '15 minutes' } },
      schema: {
        tags,
        security,
        summary: 'Confirm an email address with the emailed token',
        body: verifyEmailSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await authService.verifyEmail(request.body.token)),
    }),
  );

  app.post(
    '/resend-verification',
    {
      config: { rateLimit: { max: rateLimitMax(3), timeWindow: '1 hour' } },
      schema: {
        tags,
        security,
        summary: 'Send a fresh verification link (neutral reply)',
        body: forgotPasswordSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => ({
      success: true as const,
      ...(await authService.resendVerificationEmail(request.body.email)),
    }),
  );
}
