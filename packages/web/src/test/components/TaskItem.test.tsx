import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock sub-components that have complex dependencies
vi.mock('@/components/task/DueDatePicker', () => ({
  DueDateBadge: ({ dueDate }: { dueDate: string | null }) =>
    dueDate ? <span data-testid="due-date-badge">{dueDate}</span> : null,
  DueDatePicker: () => null,
}));

vi.mock('@/components/task/PriorityPicker', () => ({
  PriorityPicker: () => null,
}));

vi.mock('@/components/task/LabelPicker', () => ({
  LabelBadges: () => null,
}));

import { TaskItem } from '@/components/task/TaskItem';
import type { Task } from '@/stores/taskStore';

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    content: 'Buy groceries',
    description: null,
    projectId: 'proj-1',
    sectionId: null,
    parentId: null,
    creatorId: 'user-1',
    assigneeId: null,
    dueDate: null,
    dueTime: null,
    deadline: null,
    duration: null,
    isRecurring: false,
    recurrenceRule: null,
    priority: 4,
    isCompleted: false,
    completedAt: null,
    sortOrder: 1,
    taskLabels: [],
    subtasks: [],
    assignee: null,
    _count: { subtasks: 0, comments: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const defaultProps = {
  onComplete: vi.fn(),
  onUncomplete: vi.fn(),
  onClick: vi.fn(),
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
};

describe('TaskItem', () => {
  it('renders the task content', () => {
    render(<TaskItem task={buildTask()} {...defaultProps} />);
    expect(screen.getByText('Buy groceries')).toBeInTheDocument();
  });

  it('applies completed opacity when task is completed', () => {
    const task = buildTask({ isCompleted: true });
    const { container } = render(<TaskItem task={task} {...defaultProps} />);
    const wrapper = container.firstElementChild?.firstElementChild;
    expect(wrapper?.className).toContain('opacity-60');
  });

  it('does not apply completed opacity for incomplete task', () => {
    const { container } = render(<TaskItem task={buildTask()} {...defaultProps} />);
    const wrapper = container.firstElementChild?.firstElementChild;
    expect(wrapper?.className).not.toContain('opacity-60');
  });

  it('calls onComplete when checkbox is clicked for incomplete task', () => {
    const onComplete = vi.fn();
    render(<TaskItem task={buildTask()} {...defaultProps} onComplete={onComplete} />);

    // TaskCheckbox renders as the first button (no accessible name since it's icon-only)
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);

    expect(onComplete).toHaveBeenCalledWith('task-1');
  });

  it('calls onUncomplete when checkbox is clicked for completed task', () => {
    const onUncomplete = vi.fn();
    const task = buildTask({ isCompleted: true });
    render(<TaskItem task={task} {...defaultProps} onUncomplete={onUncomplete} />);

    const buttons = screen.getAllByRole('button');
    // First button is the checkbox (TaskCheckbox)
    fireEvent.click(buttons[0]);

    expect(onUncomplete).toHaveBeenCalledWith('task-1');
  });

  it('calls onClick when content area is clicked', () => {
    const onClick = vi.fn();
    render(<TaskItem task={buildTask()} {...defaultProps} onClick={onClick} />);

    fireEvent.click(screen.getByText('Buy groceries'));
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));
  });

  it('applies priority border color class for p1', () => {
    const task = buildTask({ priority: 1 });
    const { container } = render(<TaskItem task={task} {...defaultProps} />);
    const wrapper = container.firstElementChild?.firstElementChild;
    expect(wrapper?.className).toContain('border-l-red-500');
  });

  it('applies priority border color class for p2', () => {
    const task = buildTask({ priority: 2 });
    const { container } = render(<TaskItem task={task} {...defaultProps} />);
    const wrapper = container.firstElementChild?.firstElementChild;
    expect(wrapper?.className).toContain('border-l-orange-500');
  });

  it('renders due date badge when task has a due date', () => {
    const task = buildTask({ dueDate: '2024-01-15' });
    render(<TaskItem task={task} {...defaultProps} />);
    expect(screen.getByTestId('due-date-badge')).toBeInTheDocument();
  });

  it('does not render due date badge when task has no due date', () => {
    render(<TaskItem task={buildTask()} {...defaultProps} />);
    expect(screen.queryByTestId('due-date-badge')).not.toBeInTheDocument();
  });

  it('updates editContent when task.content prop changes', () => {
    const { rerender } = render(<TaskItem task={buildTask()} {...defaultProps} />);
    const updatedTask = buildTask({ content: 'Updated content' });
    rerender(<TaskItem task={updatedTask} {...defaultProps} />);
    expect(screen.getByText('Updated content')).toBeInTheDocument();
  });
});
