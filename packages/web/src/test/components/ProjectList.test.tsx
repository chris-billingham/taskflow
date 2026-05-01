import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: vi.fn(),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: vi.fn(() => '') } },
}));

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) => {
    const state = {
      reorderProjects: vi.fn(),
      archiveProject: vi.fn(),
      duplicateProject: vi.fn(),
      toggleFavorite: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/components/project/ProjectItem', () => ({
  ProjectItem: ({ project, onEdit, onDelete }: {
    project: { id: string; name: string };
    onEdit: (p: { id: string; name: string }) => void;
    onDelete: (p: { id: string; name: string }) => void;
  }) => (
    <div data-testid={`project-item-${project.id}`}>
      <span>{project.name}</span>
      <button onClick={() => onEdit(project)}>Edit</button>
      <button onClick={() => onDelete(project)}>Delete</button>
    </div>
  ),
}));

import React from 'react';
import { ProjectList } from '@/components/project/ProjectList';
import type { ProjectTreeNode } from '@/stores/projectStore';

function buildProjectNode(overrides: Partial<ProjectTreeNode> = {}): ProjectTreeNode {
  return {
    id: 'proj-1',
    name: 'Work',
    description: null,
    color: '#6366f1',
    icon: null,
    ownerId: 'user-1',
    workspaceId: null,
    parentId: null,
    isInbox: false,
    isArchived: false,
    isFavorite: false,
    viewStyle: 'LIST',
    sortOrder: 1,
    children: [],
    members: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as unknown as ProjectTreeNode;
}

describe('ProjectList', () => {
  const defaultProps = {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };

  it('renders a list of projects', () => {
    const projects = [
      buildProjectNode({ id: 'proj-1', name: 'Work' }),
      buildProjectNode({ id: 'proj-2', name: 'Personal' }),
    ];

    render(<ProjectList projects={projects} {...defaultProps} />);

    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('renders empty list without errors', () => {
    const { container } = render(<ProjectList projects={[]} {...defaultProps} />);
    expect(container).toBeTruthy();
    expect(screen.queryByTestId(/project-item/)).not.toBeInTheDocument();
  });

  it('calls onEdit when edit is triggered', () => {
    const onEdit = vi.fn();
    const projects = [buildProjectNode({ id: 'proj-1', name: 'Work' })];

    render(<ProjectList projects={projects} onEdit={onEdit} onDelete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj-1' }));
  });

  it('calls onDelete when delete is triggered', () => {
    const onDelete = vi.fn();
    const projects = [buildProjectNode({ id: 'proj-1', name: 'Work' })];

    render(<ProjectList projects={projects} onEdit={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj-1' }));
  });

  it('renders each project with a unique test id', () => {
    const projects = [
      buildProjectNode({ id: 'proj-1', name: 'Work' }),
      buildProjectNode({ id: 'proj-2', name: 'Home' }),
    ];

    render(<ProjectList projects={projects} {...defaultProps} />);

    expect(screen.getByTestId('project-item-proj-1')).toBeInTheDocument();
    expect(screen.getByTestId('project-item-proj-2')).toBeInTheDocument();
  });
});
