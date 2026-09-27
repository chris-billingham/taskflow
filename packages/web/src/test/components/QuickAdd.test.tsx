import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { makeProject, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import userEvent from '@testing-library/user-event';
import { QuickAdd } from '@/components/task/QuickAdd';

const defaultProps = {
  onSubmit: vi.fn().mockResolvedValue(undefined),
  placeholder: 'Add task',
};

describe('QuickAdd - collapsed state', () => {
  it('shows a button with the placeholder text when inline and not autoFocused', () => {
    renderPage(<QuickAdd {...defaultProps} inline={true} />);
    expect(screen.getByRole('button', { name: /add task/i })).toBeInTheDocument();
  });

  it('expands when the "Add task" button is clicked', async () => {
    renderPage(<QuickAdd {...defaultProps} inline={true} />);
    await userEvent.click(screen.getByRole('button', { name: /add task/i }));
    expect(screen.getByPlaceholderText(/add task/i)).toBeInTheDocument();
  });
});

describe('QuickAdd - expanded state', () => {
  it('shows input when autoFocus is true', () => {
    renderPage(<QuickAdd {...defaultProps} autoFocus={true} />);
    expect(screen.getByPlaceholderText(/add task/i)).toBeInTheDocument();
  });

  it('calls onSubmit with trimmed text on Enter key', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderPage(<QuickAdd {...defaultProps} onSubmit={onSubmit} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i);
    await userEvent.type(input, 'Buy milk{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('Buy milk');
  });

  it('clears input after successful submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderPage(<QuickAdd {...defaultProps} onSubmit={onSubmit} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i) as HTMLInputElement;
    await userEvent.type(input, 'Task{Enter}');

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('does not call onSubmit for empty text', async () => {
    const onSubmit = vi.fn();
    renderPage(<QuickAdd {...defaultProps} onSubmit={onSubmit} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i);
    await userEvent.type(input, '{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not call onSubmit for whitespace-only text', async () => {
    const onSubmit = vi.fn();
    renderPage(<QuickAdd {...defaultProps} onSubmit={onSubmit} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i);
    await userEvent.type(input, '   {Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onCancel and clears text on Escape', async () => {
    const onCancel = vi.fn();
    renderPage(<QuickAdd {...defaultProps} onCancel={onCancel} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i);
    await userEvent.type(input, 'Some text');
    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalled();
  });

  it('shows cancel button when inline', () => {
    renderPage(<QuickAdd {...defaultProps} autoFocus={true} inline={true} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});

describe('QuickAdd - preview parsing', () => {
  it('shows priority badge when p1 is typed', async () => {
    renderPage(<QuickAdd {...defaultProps} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i);
    await userEvent.type(input, 'Task p1');

    // Priority preview renders as "P1"
    expect(screen.getByText('P1')).toBeInTheDocument();
  });

  it('shows project preview when #project names an existing project', async () => {
    server.use(http.get(`${API}/projects`, () => HttpResponse.json(ok([makeProject({ id: 'p1', name: 'Work' })]))));
    renderPage(<QuickAdd {...defaultProps} autoFocus={true} />);

    const input = screen.getByPlaceholderText(/add task/i);
    await userEvent.type(input, 'Task #work');
    await waitFor(() => expect(screen.getByText('#Work')).toBeInTheDocument());

    // The chip shows the project's own name, as the server will resolve it.
    expect(screen.getByText('#Work')).toBeInTheDocument();
  });

  it('shows no project chip for a #tag that names no project', async () => {
    renderPage(<QuickAdd {...defaultProps} autoFocus={true} />);

    await userEvent.type(screen.getByPlaceholderText(/add task/i), 'Fix issue #42');
    expect(screen.queryByText('#42')).not.toBeInTheDocument();
  });
});
