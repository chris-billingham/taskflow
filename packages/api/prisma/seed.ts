import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultTemplates = [
  {
    name: 'Weekly Planner',
    description: 'Plan your week with daily sections for tasks and priorities.',
    data: {
      project: { name: 'Weekly Planner', color: '#3B82F6', viewStyle: 'LIST' },
      sections: [
        { name: 'Monday', sortOrder: 0 },
        { name: 'Tuesday', sortOrder: 1 },
        { name: 'Wednesday', sortOrder: 2 },
        { name: 'Thursday', sortOrder: 3 },
        { name: 'Friday', sortOrder: 4 },
        { name: 'Weekend', sortOrder: 5 },
      ],
      tasks: [
        { content: 'Review weekly goals', priority: 2, sectionIndex: 0, labels: [], sortOrder: 0, subtasks: [] },
        { content: 'Check emails and respond', priority: 4, sectionIndex: 0, labels: [], sortOrder: 1, subtasks: [] },
        { content: 'Weekly team standup', priority: 2, sectionIndex: 0, labels: [], sortOrder: 2, subtasks: [] },
        { content: 'Work on top priority project', priority: 1, sectionIndex: 1, labels: [], sortOrder: 0, subtasks: [] },
        { content: 'Mid-week check-in', priority: 3, sectionIndex: 2, labels: [], sortOrder: 0, subtasks: [] },
        { content: 'Wrap up open tasks', priority: 2, sectionIndex: 3, labels: [], sortOrder: 0, subtasks: [] },
        { content: 'Weekly review and planning', priority: 1, sectionIndex: 4, labels: [], sortOrder: 0, subtasks: [
          { content: 'Review what was accomplished', priority: 3, labels: [], sortOrder: 0 },
          { content: 'List blockers and issues', priority: 3, labels: [], sortOrder: 1 },
          { content: 'Plan next week', priority: 2, labels: [], sortOrder: 2 },
        ] },
      ],
    },
  },
  {
    name: 'Project Tracker',
    description: 'Track a project from kickoff through delivery with clear phases.',
    data: {
      project: { name: 'Project Tracker', color: '#10B981', viewStyle: 'BOARD' },
      sections: [
        { name: 'Backlog', sortOrder: 0 },
        { name: 'In Progress', sortOrder: 1 },
        { name: 'Review', sortOrder: 2 },
        { name: 'Done', sortOrder: 3 },
      ],
      tasks: [
        { content: 'Define project scope and objectives', priority: 1, sectionIndex: 0, labels: ['planning'], sortOrder: 0, subtasks: [
          { content: 'Gather stakeholder requirements', priority: 2, labels: [], sortOrder: 0 },
          { content: 'Write project brief', priority: 2, labels: [], sortOrder: 1 },
        ] },
        { content: 'Create project timeline', priority: 2, sectionIndex: 0, labels: ['planning'], sortOrder: 1, subtasks: [] },
        { content: 'Identify risks and dependencies', priority: 2, sectionIndex: 0, labels: ['planning'], sortOrder: 2, subtasks: [] },
        { content: 'Kickoff meeting', priority: 1, sectionIndex: 0, labels: [], sortOrder: 3, subtasks: [] },
        { content: 'Design phase', priority: 1, sectionIndex: 0, labels: ['design'], sortOrder: 4, subtasks: [
          { content: 'Create wireframes', priority: 2, labels: [], sortOrder: 0 },
          { content: 'Get design approval', priority: 2, labels: [], sortOrder: 1 },
        ] },
        { content: 'Development phase', priority: 1, sectionIndex: 0, labels: ['dev'], sortOrder: 5, subtasks: [] },
        { content: 'Testing and QA', priority: 2, sectionIndex: 0, labels: ['qa'], sortOrder: 6, subtasks: [] },
        { content: 'Project retrospective', priority: 3, sectionIndex: 0, labels: [], sortOrder: 7, subtasks: [] },
      ],
    },
  },
  {
    name: 'Meeting Agenda',
    description: 'Structure meeting preparation, action items, and follow-ups.',
    data: {
      project: { name: 'Meeting Agenda', color: '#F59E0B', viewStyle: 'LIST' },
      sections: [
        { name: 'Pre-Meeting Prep', sortOrder: 0 },
        { name: 'Agenda Items', sortOrder: 1 },
        { name: 'Action Items', sortOrder: 2 },
        { name: 'Follow-ups', sortOrder: 3 },
      ],
      tasks: [
        { content: 'Define meeting objectives', priority: 1, sectionIndex: 0, labels: [], sortOrder: 0, subtasks: [] },
        { content: 'Send calendar invites', priority: 2, sectionIndex: 0, labels: [], sortOrder: 1, subtasks: [] },
        { content: 'Share pre-read materials', priority: 3, sectionIndex: 0, labels: [], sortOrder: 2, subtasks: [] },
        { content: 'Welcome and introductions', priority: 4, sectionIndex: 1, labels: [], sortOrder: 0, subtasks: [] },
        { content: 'Review previous action items', priority: 2, sectionIndex: 1, labels: [], sortOrder: 1, subtasks: [] },
        { content: 'Main discussion topic', priority: 1, sectionIndex: 1, labels: [], sortOrder: 2, subtasks: [] },
        { content: 'Open questions and discussion', priority: 3, sectionIndex: 1, labels: [], sortOrder: 3, subtasks: [] },
        { content: 'Next steps and owner assignments', priority: 1, sectionIndex: 2, labels: [], sortOrder: 0, subtasks: [] },
        { content: 'Schedule next meeting', priority: 3, sectionIndex: 3, labels: [], sortOrder: 0, subtasks: [] },
        { content: 'Send meeting notes', priority: 2, sectionIndex: 3, labels: [], sortOrder: 1, subtasks: [] },
      ],
    },
  },
  {
    name: 'Sprint Planning',
    description: 'Organize a 2-week sprint with stories, bugs, and blockers.',
    data: {
      project: { name: 'Sprint Planning', color: '#8B5CF6', viewStyle: 'BOARD' },
      sections: [
        { name: 'Sprint Backlog', sortOrder: 0 },
        { name: 'In Progress', sortOrder: 1 },
        { name: 'In Review', sortOrder: 2 },
        { name: 'Done', sortOrder: 3 },
        { name: 'Blocked', sortOrder: 4 },
      ],
      tasks: [
        { content: 'Sprint planning meeting', priority: 1, sectionIndex: 0, labels: ['ceremony'], sortOrder: 0, subtasks: [
          { content: 'Review and groom backlog', priority: 2, labels: [], sortOrder: 0 },
          { content: 'Estimate story points', priority: 2, labels: [], sortOrder: 1 },
          { content: 'Commit to sprint goal', priority: 1, labels: [], sortOrder: 2 },
        ] },
        { content: 'Daily standups', priority: 2, sectionIndex: 0, labels: ['ceremony'], sortOrder: 1, subtasks: [] },
        { content: 'Sprint review demo', priority: 1, sectionIndex: 0, labels: ['ceremony'], sortOrder: 2, subtasks: [] },
        { content: 'Sprint retrospective', priority: 1, sectionIndex: 0, labels: ['ceremony'], sortOrder: 3, subtasks: [] },
        { content: 'User story: [Feature name]', priority: 2, sectionIndex: 0, labels: ['story'], sortOrder: 4, subtasks: [] },
        { content: 'Bug fix: [Bug description]', priority: 1, sectionIndex: 0, labels: ['bug'], sortOrder: 5, subtasks: [] },
        { content: 'Tech debt: [Description]', priority: 3, sectionIndex: 0, labels: ['tech-debt'], sortOrder: 6, subtasks: [] },
      ],
    },
  },
  {
    name: 'Personal Goals',
    description: 'Set and track personal goals across health, learning, and life.',
    data: {
      project: { name: 'Personal Goals', color: '#EF4444', viewStyle: 'LIST' },
      sections: [
        { name: 'Health & Fitness', sortOrder: 0 },
        { name: 'Learning & Growth', sortOrder: 1 },
        { name: 'Work & Career', sortOrder: 2 },
        { name: 'Personal & Life', sortOrder: 3 },
      ],
      tasks: [
        { content: 'Exercise 3x per week', priority: 2, sectionIndex: 0, labels: ['health'], sortOrder: 0, subtasks: [
          { content: 'Monday workout', priority: 4, labels: [], sortOrder: 0 },
          { content: 'Wednesday workout', priority: 4, labels: [], sortOrder: 1 },
          { content: 'Friday workout', priority: 4, labels: [], sortOrder: 2 },
        ] },
        { content: 'Improve diet and nutrition', priority: 2, sectionIndex: 0, labels: ['health'], sortOrder: 1, subtasks: [] },
        { content: 'Read one book per month', priority: 2, sectionIndex: 1, labels: ['learning'], sortOrder: 0, subtasks: [] },
        { content: 'Complete online course', priority: 2, sectionIndex: 1, labels: ['learning'], sortOrder: 1, subtasks: [] },
        { content: 'Learn a new skill', priority: 3, sectionIndex: 1, labels: ['learning'], sortOrder: 2, subtasks: [] },
        { content: 'Career development goal', priority: 1, sectionIndex: 2, labels: ['career'], sortOrder: 0, subtasks: [] },
        { content: 'Network and connect with peers', priority: 3, sectionIndex: 2, labels: ['career'], sortOrder: 1, subtasks: [] },
        { content: 'Spend quality time with family', priority: 1, sectionIndex: 3, labels: [], sortOrder: 0, subtasks: [] },
        { content: 'Work on personal project', priority: 2, sectionIndex: 3, labels: [], sortOrder: 1, subtasks: [] },
        { content: 'Practice mindfulness or meditation', priority: 3, sectionIndex: 3, labels: [], sortOrder: 2, subtasks: [] },
      ],
    },
  },
];

async function main() {
  console.log('Seeding default templates...');

  for (const template of defaultTemplates) {
    const existing = await prisma.template.findFirst({
      where: { name: template.name, userId: null, isPublic: true },
    });

    if (!existing) {
      await prisma.template.create({
        data: {
          name: template.name,
          description: template.description,
          data: template.data as object,
          userId: null,
          workspaceId: null,
          isPublic: true,
        },
      });
      console.log(`  Created template: ${template.name}`);
    } else {
      console.log(`  Skipped (exists): ${template.name}`);
    }
  }

  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
