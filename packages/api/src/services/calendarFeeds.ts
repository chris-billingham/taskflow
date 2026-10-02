import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { publicAppUrl } from '../config/env.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/index.js';
import { parseFilterQuery } from '../utils/filterParser.js';
import { zonedWallClockToUTC } from '../utils/dates.js';
import { renderCalendar, type CalendarEvent } from '../utils/ical.js';
import { hasProjectAccess, requireProjectAccess, taskAccessWhere } from './access.js';

/**
 * Private calendar feeds: a secret URL per project or filter that calendar
 * apps subscribe to, listing the open tasks that have a due date or a
 * deadline. Read-only, and limited to what the feed's owner can see.
 */

const DAY_MS = 86_400_000;
/** Tasks due within this window are in the feed. */
const PAST_DAYS = 30;
const FUTURE_DAYS = 365;
const MAX_EVENTS = 2000;
/** A timed task with no duration is shown as this long. */
const DEFAULT_MINUTES = 30;

const feedInclude = {
  project: { select: { name: true } },
  filter: { select: { name: true } },
} satisfies Prisma.CalendarFeedInclude;
type FeedRow = Prisma.CalendarFeedGetPayload<{ include: typeof feedInclude }>;

export const feedUrl = (token: string) => `${publicAppUrl()}/api/v1/calendar/${token}.ics`;
const newToken = () => randomBytes(24).toString('base64url');

function present(feed: FeedRow) {
  return {
    id: feed.id,
    url: feedUrl(feed.token),
    name: feed.project?.name ?? feed.filter?.name ?? 'Tasks',
    projectId: feed.projectId,
    filterId: feed.filterId,
    createdAt: feed.createdAt,
    lastFetchedAt: feed.lastFetchedAt,
  };
}

export async function listFeeds(userId: string) {
  const feeds = await prisma.calendarFeed.findMany({ where: { userId }, include: feedInclude, orderBy: { createdAt: 'asc' } });
  return feeds.map(present);
}

/** The feed for a project or filter, made on first request. */
export async function getOrCreateFeed(userId: string, target: { projectId?: string; filterId?: string }) {
  if (target.projectId) {
    await requireProjectAccess(target.projectId, userId, 'VIEW');
  } else if (target.filterId) {
    const filter = await prisma.filter.findUnique({ where: { id: target.filterId }, select: { userId: true } });
    if (!filter) throw new NotFoundError('Filter not found');
    if (filter.userId !== userId) throw new ForbiddenError('You do not own this filter');
  } else {
    throw new ValidationError('Choose a project or a filter');
  }
  const where = target.projectId
    ? { userId_projectId: { userId, projectId: target.projectId } }
    : { userId_filterId: { userId, filterId: target.filterId! } };
  try {
    const feed = await prisma.calendarFeed.upsert({
      where,
      create: { userId, token: newToken(), projectId: target.projectId ?? null, filterId: target.filterId ?? null },
      update: {},
      include: feedInclude,
    });
    return present(feed);
  } catch (err) {
    // Two requests at once (a double click, or React running an effect
    // twice in development): upsert isn't atomic, so the slower one hits the
    // unique constraint. The other just made the feed; return it.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    return present(await prisma.calendarFeed.findUniqueOrThrow({ where, include: feedInclude }));
  }
}

async function ownFeed(userId: string, id: string) {
  const feed = await prisma.calendarFeed.findUnique({ where: { id } });
  if (!feed || feed.userId !== userId) throw new NotFoundError('Calendar feed not found');
  return feed;
}

/** A new URL; the old one stops working. */
export async function resetFeed(userId: string, id: string) {
  await ownFeed(userId, id);
  return present(await prisma.calendarFeed.update({ where: { id }, data: { token: newToken() }, include: feedInclude }));
}

export async function deleteFeed(userId: string, id: string) {
  await ownFeed(userId, id);
  await prisma.calendarFeed.delete({ where: { id } });
  return { message: 'Calendar feed removed' };
}

/** The .ics for a feed token, or null if there's no such feed any more. */
export async function renderFeed(token: string, now = new Date()): Promise<string | null> {
  const feed = await prisma.calendarFeed.findUnique({
    where: { token },
    include: { ...feedInclude, user: { select: { id: true, isActive: true, timezone: true } }, filter: true },
  });
  if (!feed || !feed.user.isActive) return null;
  const userId = feed.user.id;

  let scope: Prisma.TaskWhereInput;
  if (feed.projectId) {
    // Access can be lost after the feed was made.
    if (!(await hasProjectAccess(feed.projectId, userId, 'VIEW'))) return null;
    scope = { projectId: feed.projectId };
  } else if (feed.filter) {
    scope = { AND: [taskAccessWhere(userId), await parseFilterQuery(feed.filter.query, userId)] };
  } else {
    return null;
  }

  const from = new Date(now.getTime() - PAST_DAYS * DAY_MS);
  const to = new Date(now.getTime() + FUTURE_DAYS * DAY_MS);
  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        scope,
        { isCompleted: false },
        { OR: [{ dueDate: { gte: from, lte: to } }, { deadline: { gte: from, lte: to } }] },
      ],
    },
    select: {
      id: true,
      content: true,
      description: true,
      projectId: true,
      dueDate: true,
      dueTime: true,
      duration: true,
      deadline: true,
      priority: true,
      updatedAt: true,
    },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    take: MAX_EVENTS,
  });

  const events: CalendarEvent[] = [];
  for (const task of tasks) {
    const url = `${publicAppUrl()}/projects/${task.projectId}?task=${task.id}`;
    const description = [task.description?.trim(), url].filter(Boolean).join('\n\n');
    // Taskflow's p1 is the highest; iCalendar's 1 is too (p4 means none).
    const priority = { 1: 1, 2: 3, 3: 5 }[task.priority];
    if (task.dueDate && task.dueDate >= from && task.dueDate <= to) {
      if (task.dueTime) {
        const start = zonedWallClockToUTC(task.dueDate, task.dueTime, feed.user.timezone);
        const end = new Date(start.getTime() + (task.duration ?? DEFAULT_MINUTES) * 60_000);
        events.push({ uid: `${task.id}@taskflow`, stamp: task.updatedAt, summary: task.content, description, url, priority, start: { at: start }, end: { at: end } });
      } else {
        const end = new Date(task.dueDate.getTime() + DAY_MS);
        events.push({ uid: `${task.id}@taskflow`, stamp: task.updatedAt, summary: task.content, description, url, priority, start: { date: task.dueDate }, end: { date: end } });
      }
    }
    if (task.deadline && task.deadline >= from && task.deadline <= to) {
      events.push({
        uid: `${task.id}-deadline@taskflow`,
        stamp: task.updatedAt,
        summary: `Deadline: ${task.content}`,
        description,
        url,
        priority,
        start: { date: task.deadline },
        end: { date: new Date(task.deadline.getTime() + DAY_MS) },
      });
    }
  }

  // Recorded at most every few minutes; calendar apps poll.
  if (!feed.lastFetchedAt || now.getTime() - feed.lastFetchedAt.getTime() > 5 * 60_000) {
    await prisma.calendarFeed.update({ where: { id: feed.id }, data: { lastFetchedAt: now } });
  }

  return renderCalendar(`Taskflow: ${present(feed).name}`, events);
}
