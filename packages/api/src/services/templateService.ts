import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';
import type {
  CreateTemplateInput,
  ApplyTemplateInput,
  UpdateTemplateInput,
} from '../schemas/template.js';

interface TemplateSubtask {
  content: string;
  description?: string;
  priority: number;
  labels: string[];
  sortOrder: number;
}

interface TemplateTask {
  content: string;
  description?: string;
  priority: number;
  sectionIndex?: number;
  labels: string[];
  sortOrder: number;
  subtasks: TemplateSubtask[];
}

export interface TemplateData {
  project: { name: string; color: string; viewStyle: string };
  sections: Array<{ name: string; sortOrder: number }>;
  tasks: TemplateTask[];
}

async function verifyWorkspaceMembership(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) {
    throw new ForbiddenError('You are not a member of this workspace');
  }
  return member;
}

export async function getUserTemplates(userId: string) {
  return prisma.template.findMany({
    where: { userId },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getWorkspaceTemplates(workspaceId: string, userId: string) {
  await verifyWorkspaceMembership(workspaceId, userId);

  return prisma.template.findMany({
    where: { workspaceId },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getPublicTemplates() {
  return prisma.template.findMany({
    where: { isPublic: true },
    take: 50,
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTemplateById(id: string, userId: string) {
  const template = await prisma.template.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  if (!template) {
    throw new NotFoundError('Template not found');
  }

  // Access: own template, public template, or workspace template for members
  if (template.userId !== userId && !template.isPublic) {
    if (template.workspaceId) {
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: template.workspaceId, userId },
        },
      });
      if (!member) {
        throw new ForbiddenError('You do not have access to this template');
      }
    } else {
      throw new ForbiddenError('You do not have access to this template');
    }
  }

  return template;
}

export async function createTemplate(data: CreateTemplateInput, userId: string) {
  // Verify access to source project
  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
    include: {
      sections: { orderBy: { sortOrder: 'asc' } },
      tasks: {
        where: { parentId: null },
        orderBy: { sortOrder: 'asc' },
        include: {
          taskLabels: { include: { label: true } },
          subtasks: {
            orderBy: { sortOrder: 'asc' },
            include: { taskLabels: { include: { label: true } } },
          },
        },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Source project not found');
  }
  if (project.ownerId !== userId) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: data.projectId, userId } },
    });
    if (!member) {
      throw new ForbiddenError('You do not have access to this project');
    }
  }

  if (data.workspaceId) {
    await verifyWorkspaceMembership(data.workspaceId, userId);
  }

  // Build index map for sections
  const sectionIndexMap = new Map<string, number>();
  project.sections.forEach((s, i) => sectionIndexMap.set(s.id, i));

  const templateData: TemplateData = {
    project: {
      name: project.name,
      color: project.color,
      viewStyle: project.viewStyle,
    },
    sections: project.sections.map((s) => ({
      name: s.name,
      sortOrder: s.sortOrder,
    })),
    tasks: project.tasks.map((t) => ({
      content: t.content,
      description: t.description ?? undefined,
      priority: t.priority,
      sectionIndex: t.sectionId != null ? sectionIndexMap.get(t.sectionId) : undefined,
      labels: t.taskLabels.map((tl) => tl.label.name),
      sortOrder: t.sortOrder,
      subtasks: t.subtasks.map((st) => ({
        content: st.content,
        description: st.description ?? undefined,
        priority: st.priority,
        labels: st.taskLabels.map((tl) => tl.label.name),
        sortOrder: st.sortOrder,
      })),
    })),
  };

  return prisma.template.create({
    data: {
      name: data.name,
      description: data.description,
      data: templateData as object,
      userId,
      workspaceId: data.workspaceId,
      isPublic: false,
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });
}

export async function applyTemplate(
  templateId: string,
  data: ApplyTemplateInput,
  userId: string,
) {
  const template = await getTemplateById(templateId, userId);
  const templateData = template.data as unknown as TemplateData;

  if (data.workspaceId) {
    await verifyWorkspaceMembership(data.workspaceId, userId);
  }

  // Compute sort order for new project
  const maxSort = await prisma.project.aggregate({
    where: { ownerId: userId, parentId: null },
    _max: { sortOrder: true },
  });

  // Resolve/create labels BEFORE the transaction: the per-task find-or-create
  // loop inside the transaction held row locks on the user's labels for the
  // whole apply and blew Prisma's 5s default timeout on large templates.
  const labelNames = new Set<string>();
  for (const t of templateData.tasks) {
    for (const name of t.labels) labelNames.add(name);
    for (const st of t.subtasks) for (const name of st.labels) labelNames.add(name);
  }
  const labelIdByName = new Map<string, string>();
  if (labelNames.size > 0) {
    const existing = await prisma.label.findMany({
      where: { userId, name: { in: [...labelNames] } },
      select: { id: true, name: true },
    });
    for (const l of existing) labelIdByName.set(l.name, l.id);
    const maxLabelSort = await prisma.label.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    let nextSort = (maxLabelSort._max.sortOrder ?? 0) + 1;
    for (const name of labelNames) {
      if (labelIdByName.has(name)) continue;
      const label = await prisma.label.create({
        data: { name, userId, sortOrder: nextSort++ },
      });
      labelIdByName.set(name, label.id);
    }
  }

  return prisma.$transaction(async (tx) => {
    // Create the new project
    const project = await tx.project.create({
      data: {
        name: data.name,
        color: templateData.project.color,
        viewStyle: templateData.project.viewStyle as 'LIST' | 'BOARD' | 'CALENDAR',
        ownerId: userId,
        workspaceId: data.workspaceId,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });

    // Create sections
    const createdSections: Array<{ id: string }> = [];
    for (const s of templateData.sections) {
      const section = await tx.section.create({
        data: {
          name: s.name,
          projectId: project.id,
          sortOrder: s.sortOrder,
        },
      });
      createdSections.push(section);
    }

    // Create tasks
    for (const t of templateData.tasks) {
      const sectionId =
        t.sectionIndex != null ? createdSections[t.sectionIndex]?.id : undefined;

      const task = await tx.task.create({
        data: {
          content: t.content,
          description: t.description,
          projectId: project.id,
          sectionId,
          creatorId: userId,
          priority: t.priority,
          sortOrder: t.sortOrder,
        },
      });

      // Attach labels (pre-resolved above)
      if (t.labels.length > 0) {
        await tx.taskLabel.createMany({
          data: t.labels
            .map((name) => labelIdByName.get(name))
            .filter((id): id is string => !!id)
            .map((labelId) => ({ taskId: task.id, labelId })),
        });
      }

      // Create subtasks
      for (const st of t.subtasks) {
        const subtask = await tx.task.create({
          data: {
            content: st.content,
            description: st.description,
            projectId: project.id,
            sectionId,
            parentId: task.id,
            creatorId: userId,
            priority: st.priority,
            sortOrder: st.sortOrder,
          },
        });

        if (st.labels.length > 0) {
          await tx.taskLabel.createMany({
            data: st.labels
              .map((name) => labelIdByName.get(name))
              .filter((id): id is string => !!id)
              .map((labelId) => ({ taskId: subtask.id, labelId })),
          });
        }
      }
    }

    return tx.project.findUnique({
      where: { id: project.id },
      include: {
        sections: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { tasks: { where: { isCompleted: false } } } },
        children: { select: { id: true } },
      },
    });
    // Large templates legitimately exceed Prisma's 5s default.
  }, { timeout: 30_000 });
}

export async function updateTemplate(
  id: string,
  data: UpdateTemplateInput,
  userId: string,
) {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw new NotFoundError('Template not found');
  if (template.userId !== userId) throw new ForbiddenError('You do not own this template');

  return prisma.template.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });
}

export async function deleteTemplate(id: string, userId: string) {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw new NotFoundError('Template not found');
  if (template.userId !== userId) throw new ForbiddenError('You do not own this template');

  await prisma.template.delete({ where: { id } });
  return { message: 'Template deleted successfully' };
}
