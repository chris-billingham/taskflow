import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';
import {
  canRegister,
  getRegistrationMode,
  isRegistrationOpen,
  setRegistrationMode,
} from '../../services/instanceSettingsService.js';
import { register } from '../../services/authService.js';
import { ForbiddenError } from '../../errors/index.js';

// Real Postgres: the invite lookup is a case-insensitive match with an expiry
// cut-off, which a mocked Prisma can't meaningfully check.

const RUN = randomUUID().slice(0, 8);
const SUFFIX = `-${RUN}@policy.test`;
const BOOTSTRAP_EMAIL = 'bootstrap-admin@admin.test'; // ADMIN_EMAILS in vitest.db.config
let ownerId: string;
let workspaceId: string;

async function invite(email: string, expiresInMs: number) {
  return prisma.workspaceInvite.create({
    data: {
      workspaceId,
      email,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + expiresInMs),
    },
  });
}

beforeAll(async () => {
  const owner = await prisma.user.create({
    data: { email: `owner${SUFFIX}`, name: 'Owner', passwordHash: 'x', emailVerified: true },
  });
  ownerId = owner.id;
  const ws = await prisma.workspace.create({
    data: { name: 'Policy WS', slug: `policy-${RUN}`, ownerId },
  });
  workspaceId = ws.id;
  await setRegistrationMode('invite', ownerId);
});

afterEach(async () => {
  await prisma.workspaceInvite.deleteMany({ where: { workspaceId } });
});

afterAll(async () => {
  // Leave the env default (open) in force for the suites that follow.
  await prisma.instanceSetting.deleteMany({ where: { key: 'registration_mode' } });
  const users = await prisma.user.findMany({
    where: { email: { endsWith: SUFFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.workspace.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('registration policy (invite-only)', () => {
  it('uses the stored setting over the environment default', async () => {
    expect(await getRegistrationMode()).toBe('invite');
    expect(await isRegistrationOpen()).toBe(false); // users exist
  });

  it('turns away an address with no invitation', async () => {
    expect(await canRegister(`stranger${SUFFIX}`)).toBe(false);
  });

  it('admits an address with a pending invite, whatever its case', async () => {
    await invite(`invitee${SUFFIX}`, 60_000);
    expect(await canRegister(`INVITEE${SUFFIX.toUpperCase()}`)).toBe(true);
  });

  it('treats "_" in an address literally (no ILIKE wildcard)', async () => {
    await invite(`bob${SUFFIX}`, 60_000);
    expect(await canRegister(`b_b${SUFFIX}`)).toBe(false);
  });

  it('does not honour an expired invite', async () => {
    await invite(`late${SUFFIX}`, -60_000);
    expect(await canRegister(`late${SUFFIX}`)).toBe(false);
  });

  it('admits an ADMIN_EMAILS address so the operator can bootstrap', async () => {
    expect(await canRegister(BOOTSTRAP_EMAIL)).toBe(true);
  });

  it('register() refuses with REGISTRATION_CLOSED and creates nothing', async () => {
    const email = `refused${SUFFIX}`;
    const err = await register({ email, password: 'longenough1', name: 'Refused' }).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.code).toBe('REGISTRATION_CLOSED');
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('register() lets an invited person sign up', async () => {
    const email = `welcome${SUFFIX}`;
    await invite(email, 60_000);
    const result = await register({ email, password: 'longenough1', name: 'Welcome' });
    expect(result.user.email).toBe(email);
  });

  it('opens to everyone when an admin switches to open', async () => {
    await setRegistrationMode('open', ownerId);
    expect(await isRegistrationOpen()).toBe(true);
    expect(await canRegister(`anyone${SUFFIX}`)).toBe(true);
    await setRegistrationMode('invite', ownerId);
  });
});
