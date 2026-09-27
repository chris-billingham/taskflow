import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

// Favourites, sidebar order and collapsed sections are each person's own
// (project_user_settings, section_user_settings). Responses still carry them
// as isFavorite / sortOrder / isCollapsed, resolved for the requesting user.

/**
 * Where a project sits for someone who has never placed it: after everything
 * they have arranged themselves, in the project's own (creation) order.
 */
const UNPLACED = 1_000_000;

export function projectSettingsInclude(userId: string) {
  return {
    userSettings: { where: { userId }, select: { isFavorite: true, sortOrder: true } },
  } satisfies Prisma.ProjectInclude;
}

export function sectionSettingsInclude(userId: string) {
  return {
    userSettings: { where: { userId }, select: { isCollapsed: true } },
  } satisfies Prisma.SectionInclude;
}

type SectionRow = { id: string; userSettings?: { isCollapsed: boolean }[] };
type ProjectRow = {
  id: string;
  sortOrder: number;
  userSettings?: { isFavorite: boolean; sortOrder: number | null }[];
  sections?: SectionRow[];
};

/** A section as one person sees it. */
export function withSectionSettings<T extends SectionRow>(section: T) {
  const { userSettings, ...rest } = section;
  return { ...rest, isCollapsed: userSettings?.[0]?.isCollapsed ?? false };
}

/** A project (and its sections, if loaded) as one person sees it. */
export function withProjectSettings<T extends ProjectRow>(project: T) {
  const { userSettings, sections, ...rest } = project;
  const own = userSettings?.[0];
  return {
    ...rest,
    isFavorite: own?.isFavorite ?? false,
    sortOrder: own?.sortOrder ?? UNPLACED + project.sortOrder,
    ...(sections && { sections: sections.map(withSectionSettings) }),
  } as Omit<T, 'userSettings' | 'sections'> & {
    isFavorite: boolean;
    sortOrder: number;
  } & (T extends { sections: (infer S extends SectionRow)[] }
      ? { sections: (Omit<S, 'userSettings'> & { isCollapsed: boolean })[] }
      : unknown);
}

export async function saveProjectSettings(
  userId: string,
  projectId: string,
  settings: { isFavorite?: boolean; sortOrder?: number },
) {
  await prisma.projectUserSetting.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: { userId, projectId, ...settings },
    update: settings,
  });
}

export async function saveSectionSettings(
  userId: string,
  sectionId: string,
  settings: { isCollapsed: boolean },
) {
  await prisma.sectionUserSetting.upsert({
    where: { userId_sectionId: { userId, sectionId } },
    create: { userId, sectionId, ...settings },
    update: settings,
  });
}
