import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    comment: { create: vi.fn(), findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    workspaceMember: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../services/access.js', () => ({ requireTaskAccess: vi.fn() }));
vi.mock('../../services/activityService.js', () => ({
  logActivity: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../services/syncService.js', () => ({
  broadcastCommentCreated: vi.fn(),
  broadcastCommentUpdated: vi.fn(),
  broadcastCommentDeleted: vi.fn(),
}));

type NotifyManyArgs = [
  Array<string | null | undefined>,
  { exclude?: string; type: string; title: string; body: string; data?: unknown },
];

const notifyManyMock = vi.hoisted(() =>
  vi.fn<NotifyManyArgs, Promise<number>>(() => Promise.resolve(0)),
);
vi.mock('../../services/notificationService.js', () => ({
  notifyMany: notifyManyMock,
}));

import { createComment } from '../../services/commentService.js';
import { prisma } from '../../config/database.js';
import { requireTaskAccess } from '../../services/access.js';

const mockPrisma = prisma as unknown as {
  comment: { create: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  project: { findUnique: ReturnType<typeof vi.fn> };
  workspaceMember: { findMany: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};
const mockRequireTaskAccess = vi.mocked(requireTaskAccess);

const AUTHOR = 'u-author';
const CREATOR = 'u-creator';
const ASSIGNEE = 'u-assignee';

/** Wait for the fire-and-forget notification chain to settle. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** The notifyMany call for a given notification type, if any. */
function callFor(type: string) {
  return notifyManyMock.mock.calls.find((call) => call[1]?.type === type);
}

function recipientsFor(type: string): string[] {
  const call = callFor(type);
  if (!call) return [];
  return (call[0] ?? []).filter((id): id is string => !!id);
}

beforeEach(() => {
  vi.clearAllMocks();

  mockRequireTaskAccess.mockResolvedValue({
    id: 'task-1',
    content: 'Ship the thing',
    projectId: 'p1',
    creatorId: CREATOR,
    assigneeId: ASSIGNEE,
  } as never);

  mockPrisma.comment.create.mockImplementation(({ data }: { data: { content: string } }) => ({
    id: 'c1',
    content: data.content,
  }));
  mockPrisma.comment.findUnique.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue({ name: 'Ada Lovelace' });
  mockPrisma.workspaceMember.findMany.mockResolvedValue([]);
  mockPrisma.project.findUnique.mockResolvedValue({
    workspaceId: null,
    owner: { id: CREATOR, name: 'Casey Creator', email: 'casey@example.com' },
    members: [
      { user: { id: ASSIGNEE, name: 'Alex Assignee', email: 'alex@example.com' } },
      { user: { id: AUTHOR, name: 'Ada Lovelace', email: 'ada@example.com' } },
    ],
  });
});

describe('comment notifications', () => {
  it('notifies the task creator and assignee, never the comment author', async () => {
    await createComment('task-1', { content: 'Looks good' } as never, AUTHOR);
    await flush();

    const call = callFor('COMMENT_ON_TASK');
    expect(call).toBeDefined();
    expect(recipientsFor('COMMENT_ON_TASK').sort()).toEqual([ASSIGNEE, CREATOR].sort());
    expect(call![1].exclude).toBe(AUTHOR);
  });

  it('includes the parent comment\'s author on a reply', async () => {
    // Same lookup backs both the parentId validation and the recipient list,
    // so taskId has to be present for the comment to be accepted at all.
    mockPrisma.comment.findUnique.mockResolvedValue({
      id: 'c-parent',
      taskId: 'task-1',
      authorId: 'u-parent',
    });

    await createComment(
      'task-1',
      { content: 'Replying', parentId: 'c-parent' } as never,
      AUTHOR,
    );
    await flush();

    expect(recipientsFor('COMMENT_ON_TASK')).toContain('u-parent');
  });

  it('sends a mention notice to an @mentioned member', async () => {
    await createComment('task-1', { content: 'hey @alex take a look' } as never, AUTHOR);
    await flush();

    expect(recipientsFor('MENTION_IN_COMMENT')).toEqual([ASSIGNEE]);
  });

  it('a mentioned user gets the mention INSTEAD of the generic comment notice', async () => {
    await createComment('task-1', { content: 'hey @alex take a look' } as never, AUTHOR);
    await flush();

    // Alex is the assignee, so without the exclusion they'd be told twice
    // about one comment.
    expect(recipientsFor('MENTION_IN_COMMENT')).toEqual([ASSIGNEE]);
    expect(recipientsFor('COMMENT_ON_TASK')).toEqual([CREATOR]);
  });

  it('does not notify the author for mentioning themselves', async () => {
    await createComment('task-1', { content: 'note to self @ada' } as never, AUTHOR);
    await flush();

    expect(recipientsFor('MENTION_IN_COMMENT')).not.toContain(AUTHOR);
  });

  it('ignores a mention of someone outside the project', async () => {
    await createComment('task-1', { content: 'cc @stranger' } as never, AUTHOR);
    await flush();

    expect(recipientsFor('MENTION_IN_COMMENT')).toEqual([]);
  });

  it('resolves mentions against workspace members for a workspace project', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      workspaceId: 'ws1',
      owner: { id: CREATOR, name: 'Casey Creator', email: 'casey@example.com' },
      members: [],
    });
    mockPrisma.workspaceMember.findMany.mockResolvedValue([
      { user: { id: 'u-ws', name: 'Wendy Workspace', email: 'wendy@example.com' } },
    ]);

    await createComment('task-1', { content: 'ping @wendy' } as never, AUTHOR);
    await flush();

    expect(recipientsFor('MENTION_IN_COMMENT')).toEqual(['u-ws']);
  });

  it('returns the comment even if notification fan-out fails', async () => {
    notifyManyMock.mockRejectedValue(new Error('notify exploded'));

    const comment = await createComment(
      'task-1',
      { content: 'still works' } as never,
      AUTHOR,
    );
    await flush();

    expect(comment).toMatchObject({ id: 'c1' });
  });
});
