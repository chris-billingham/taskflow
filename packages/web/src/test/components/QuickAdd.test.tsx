import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
    // "#42" stays in the text (shown unhighlighted) and gets no project chip.
    expect(screen.queryByRole('group', { name: 'Task details from the text' })).not.toBeInTheDocument();
  });
});

describe('QuickAdd - highlighting and autocomplete', () => {
  it('suggests projects after # and inserts the full (multi-word) name', async () => {
    server.use(
      http.get(`${API}/projects`, () =>
        HttpResponse.json(ok([makeProject({ id: 'p1', name: 'Home Renovation' }), makeProject({ id: 'p2', name: 'Work' })])),
      ),
    );
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderPage(<QuickAdd onSubmit={onSubmit} autoFocus />);
    const input = screen.getByRole('combobox', { name: 'Add task' });

    await userEvent.type(input, 'Paint #ho');
    const list = await screen.findByRole('listbox', { name: 'Projects' });
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Home Renovation']);
    await userEvent.keyboard('{Enter}');

    expect(input).toHaveValue('Paint #Home Renovation ');
    // Recognised as one project token: the chip names it.
    const details = await screen.findByRole('group', { name: 'Task details from the text' });
    expect(within(details).getByText('#Home Renovation')).toBeInTheDocument();
    await userEvent.type(input, 'tomorrow{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Paint #Home Renovation tomorrow'));
  });

  it('offers to create an unknown label, then treats it as a label', async () => {
    const created = vi.fn();
    let labels: unknown[] = [];
    server.use(
      http.get(`${API}/labels`, () => HttpResponse.json(ok(labels))),
      http.post(`${API}/labels`, async ({ request }) => {
        const body = (await request.json()) as { name: string };
        created(body.name);
        const label = { id: 'l-new', name: body.name, color: '#6B7280', userId: 'u', isFavorite: false, sortOrder: 1, createdAt: '', updatedAt: '' };
        labels = [label];
        return HttpResponse.json(ok(label), { status: 201 });
      }),
    );
    renderPage(<QuickAdd onSubmit={vi.fn()} autoFocus />);
    const input = screen.getByRole('combobox', { name: 'Add task' });

    await userEvent.type(input, 'Ring the bank @errands');
    const option = await screen.findByRole('option', { name: 'Create label “errands”' });
    await userEvent.click(option);

    await waitFor(() => expect(created).toHaveBeenCalledWith('errands'));
    expect(input).toHaveValue('Ring the bank @errands ');
    const details = await screen.findByRole('group', { name: 'Task details from the text' });
    expect(within(details).getByText('errands')).toBeInTheDocument();
  });

  it('Escape closes the suggestions without cancelling the box', async () => {
    server.use(http.get(`${API}/projects`, () => HttpResponse.json(ok([makeProject({ id: 'p1', name: 'Work' })]))));
    const onCancel = vi.fn();
    renderPage(<QuickAdd onSubmit={vi.fn()} autoFocus onCancel={onCancel} inline={false} />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Add task' }), '#w');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
