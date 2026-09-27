import { prisma } from '../config/database.js';
import { env, isBootstrapAdminEmail } from '../config/env.js';

export type RegistrationMode = 'invite' | 'open';

const REGISTRATION_MODE_KEY = 'registration_mode';

/** The admin's choice if one has been saved, else REGISTRATION_MODE. */
export async function getRegistrationMode(): Promise<RegistrationMode> {
  const row = await prisma.instanceSetting.findUnique({
    where: { key: REGISTRATION_MODE_KEY },
  });
  return row?.value === 'open' || row?.value === 'invite' ? row.value : env.REGISTRATION_MODE;
}

export async function setRegistrationMode(
  mode: RegistrationMode,
  adminId: string,
): Promise<RegistrationMode> {
  await prisma.instanceSetting.upsert({
    where: { key: REGISTRATION_MODE_KEY },
    create: { key: REGISTRATION_MODE_KEY, value: mode, updatedById: adminId },
    update: { value: mode, updatedById: adminId },
  });
  return mode;
}

/**
 * Whether sign-up is open to anyone right now, as the login page should show
 * it. Invite-only installs still accept their very first account, so a fresh
 * install is never locked.
 */
export async function isRegistrationOpen(): Promise<boolean> {
  if ((await getRegistrationMode()) === 'open') return true;
  return (await prisma.user.count()) === 0;
}

/**
 * Whether this address may create an account. On an invite-only install that
 * is: the first account, an ADMIN_EMAILS address (the operator bootstrapping
 * the instance), or someone with an unexpired workspace invite. Admins can
 * always create accounts from the console, which doesn't go through here.
 */
export async function canRegister(email: string): Promise<boolean> {
  if (await isRegistrationOpen()) return true;
  if (isBootstrapAdminEmail(email)) return true;

  const invite = await prisma.workspaceInvite.findFirst({
    where: {
      email: { equals: email.trim(), mode: 'insensitive' },
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return invite !== null;
}
