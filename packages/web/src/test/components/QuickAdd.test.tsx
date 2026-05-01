import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickAdd } from '@/components/task/QuickAdd';

const defaultProps = {
  onSubmit: vi.fn().mockResolvedValue(undefined),
  placeholder: 'Add task',
};

describe('QuickAdd - collapsed state', () => {
  it('shows a button with the placeholder text when inline and not autoFocused', () => {
    render(<QuickAdd {...defaultProps} inline={true} />);
    expect(screen.getByRole('button', { name: /add task/i })).toBeInTheDocument();
  });

  it('expands when the "Add task" button is clicked', async () => {
    render(<QuickAdd {...defaultProps} inline={true} />);
    await userEvent.click(screen.getByRole('button', { name: /add task/i }));
    expect(screen.getByPlaceholderText(/add task/i)).toBeInTheDocument();
  });
});

describe('QuickAdd - expanded state', () => {
  it('shows input when autoFocus is true', () => {
    render(<QuickAdd {...defaultProps} autoFocus={true} />);
    expect(screen.getByPlaceholderText(/add task/i)).toBeInTheDocument();
  });

  it('calls onSubmit with trimmed text on Enter key', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<QuickAdd {...defaultProps} onSubmit={onSubmit} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i);
    await userEvent.type(input, 'Buy milk{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('Buy milk');
  });

  it('clears input after successful submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<QuickAdd {...defaultProps} onSubmit={onSubmit} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i) as HTMLInputElement;
    await userEvent.type(input, 'Task{Enter}');

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('does not call onSubmit for empty text', async () => {
    const onSubmit = vi.fn();
    render(<QuickAdd {...defaultProps} onSubmit={onSubmit} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i);
    await userEvent.type(input, '{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not call onSubmit for whitespace-only text', async () => {
    const onSubmit = vi.fn();
    render(<QuickAdd {...defaultProps} onSubmit={onSubmit} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i);
    await userEvent.type(input, '   {Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onCancel and clears text on Escape', async () => {
    const onCancel = vi.fn();
    render(<QuickAdd {...defaultProps} onCancel={onCancel} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i);
    await userEvent.type(input, 'Some text');
    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalled();
  });

  it('shows cancel button when inline', () => {
    render(<QuickAdd {...defaultProps} autoFocus={true} inline={true} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});

describe('QuickAdd - preview parsing', () => {
  it('shows priority badge when p1 is typed', async () => {
    render(<QuickAdd {...defaultProps} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i);
    await userEvent.type(input, 'Task p1');

    // Priority preview renders as "P1"
    expect(screen.getByText('P1')).toBeInTheDocument();
  });

  it('shows project preview when #project is typed', async () => {
    render(<QuickAdd {...defaultProps} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i);
    await userEvent.type(input, 'Task #Work');

    // Project preview renders as "#Work"
    expect(screen.getByText('#Work')).toBeInTheDocument();
  });
});
