import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import { saveProjectSettings, saveSectionSettings } from '../../services/userSettings.js';
import { updateNotificationPreferences, savePushSubscription, registerAppleDevice } from '../../services/notificationService.js';
import { reorderProjects } from '../../services/projectService.js';
import { reorderLabels } from '../../services/labelService.js';
import { setRegistrationMode } from '../../services/instanceSettingsService.js';
import { dbFixtures } from './fixtures.js';

// "Get or create" writes must survive two requests at once (a double click,
// two tabs, React running an effect twice). Prisma only makes an upsert one
// atomic INSERT … ON CONFLICT when it has no nested reads or writes; these
// check each one in the app does.
const fx = dbFixtures('upserts');
let userId = '';
let projectId = '';
let sectionId = '';
let labelId = '';

beforeAll(async () => {
  userId = (await fx.user('racer')).id;
  projectId = (await prisma.project.create({ data: { name: 'Race', ownerId: userId } })).id;
  sectionId = (await prisma.section.create({ data: { name: 'S', projectId } })).id;
  labelId = (await prisma.label.create({ data: { name: `race-${fx.run}`, userId } })).id;
});
afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: projectId } });
  await fx.cleanup();
  await prisma.$disconnect();
});

const together = <T>(fn: (i: number) => Promise<T>) => Promise.all(Array.from({ length: 8 }, (_, i) => fn(i)));

describe('concurrent upserts', () => {
  it('per-user project and section settings', async () => {
    await together((i) => saveProjectSettings(userId, projectId, { sortOrder: i }));
    await together(() => saveSectionSettings(userId, sectionId, { isCollapsed: true }));
    await together(() => reorderProjects([projectId], userId));
    await together(() => reorderLabels([labelId], userId));
    expect(await prisma.projectUserSetting.count({ where: { userId, projectId } })).toBe(1);
  });

  it('notification preferences, push subscriptions and Apple devices', async () => {
    await together(() => updateNotificationPreferences(userId, { emailEnabled: true }));
    await together(() => savePushSubscription(userId, `https://push.example/${fx.run}`, 'p256dh', 'auth'));
    await together(() => registerAppleDevice(userId, undefined, { token: `${fx.run}abc`, environment: 'SANDBOX' }));
    expect(await prisma.pushSubscription.count({ where: { userId } })).toBe(1);
  });

  it('instance settings', async () => {
    await together(() => setRegistrationMode('open', userId));
  });
});

describe('labels made by name', () => {
  it('two requests making the same new label both get it', async () => {
    const { labelIdsByName } = await import('../../services/labelScope.js');
    const results = await together(() => labelIdsByName({ userId }, [{ name: `fresh-${fx.run}` }], { create: true }));
    const ids = new Set(results.map((m) => m.get(`fresh-${fx.run}`)));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toEqual(expect.any(String));
  });
});
