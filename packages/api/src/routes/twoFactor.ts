import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  twoFactorStatusSchema,
  twoFactorSetupSchema,
  recoveryCodesSchema,
  enableTwoFactorSchema,
  disableTwoFactorSchema,
  passwordConfirmationSchema,
  messageResponse,
  ok,
} from '@taskflow/contract';
import { authenticate } from '../middleware/authenticate.js';
import * as twoFactor from '../services/twoFactor.js';
import { confirmPassword } from '../services/userService.js';
import { ForbiddenError } from '../errors/index.js';
import { rateLimitMax } from '../config/rateLimits.js';

// Your own two-factor sign-in. Account security: a real sign-in only, never
// a personal access token, and changes ask for the password again.
const tags = ['Two-factor'];
const config = { sessionOnly: true };
const codeLimit = { rateLimit: { max: rateLimitMax(10), timeWindow: '15 minutes' } };

export async function twoFactorRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    { config, schema: { tags, summary: 'Whether two-factor sign-in is on', response: { 200: ok(twoFactorStatusSchema) } } },
    async (request) => ({ success: true as const, data: await twoFactor.getStatus(request.user.id) }),
  );

  app.post(
    '/setup',
    {
      config,
      schema: {
        tags,
        summary: 'Start setting up: a new secret for an authenticator app',
        body: passwordConfirmationSchema,
        response: { 200: ok(twoFactorSetupSchema) },
      },
    },
    async (request) => {
      await confirmPassword(request.user.id, request.body.password);
      return { success: true as const, data: await twoFactor.beginSetup(request.user.id) };
    },
  );

  app.post(
    '/enable',
    {
      config: { ...config, ...codeLimit },
      schema: {
        tags,
        summary: 'Turn on with a code from the app; returns recovery codes, shown once',
        body: enableTwoFactorSchema,
        response: { 200: ok(recoveryCodesSchema) },
      },
    },
    async (request) => {
      const data = await twoFactor.enable(request.user.id, request.body.code);
      request.log.info({ userId: request.user.id }, 'two-factor sign-in turned on');
      return { success: true as const, data };
    },
  );

  app.post(
    '/recovery-codes',
    {
      config,
      schema: {
        tags,
        summary: 'Replace the recovery codes; the old ones stop working',
        body: passwordConfirmationSchema,
        response: { 200: ok(recoveryCodesSchema) },
      },
    },
    async (request) => {
      await confirmPassword(request.user.id, request.body.password);
      return { success: true as const, data: await twoFactor.regenerateRecoveryCodes(request.user.id) };
    },
  );

  app.post(
    '/disable',
    {
      config: { ...config, ...codeLimit },
      schema: {
        tags,
        summary: 'Turn off: needs the password and a current code or recovery code',
        body: disableTwoFactorSchema,
        response: { 200: messageResponse },
      },
    },
    async (request) => {
      const { password, code, recoveryCode } = request.body;
      await confirmPassword(request.user.id, password);
      if (!(await twoFactor.verifySecondFactor(request.user.id, { code, recoveryCode }))) {
        // 403 like a wrong password: the session itself is fine.
        throw new ForbiddenError("That code isn't right.");
      }
      await twoFactor.disable(request.user.id);
      request.log.info({ userId: request.user.id }, 'two-factor sign-in turned off');
      return { success: true as const, message: 'Two-factor sign-in is off' };
    },
  );
}
