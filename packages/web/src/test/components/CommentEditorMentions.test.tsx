import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/api', () => ({
  default: { get: getMock, post: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

vi.mock('@/hooks/useFileUpload', () => ({
  useUploadLimits: () => ({ maxFileSizeMb: 25, allowedMimeTypes: new Set<string>() }),
  formatFileSize: (n: number) => `${n} B`,
}));

import { CommentEditor } from '@/components/comment/CommentEditor';

const MEMBERS = [
  { id: 'u-ada', name: 'Ada Lovelace', email: 'ada@example.com' },
  { id: 'u-alan', name: 'Alan Turing', email: 'alan@example.com' },
  { id: 'u-grace', name: 'Grace Hopper', email: 'grace@example.com' },
];

const onSubmit = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockResolvedValue({ data: { data: MEMBERS } });
});

const editor = () => screen.getByPlaceholderText('Write a comment...');

/** Render with mentions enabled and wait for the member list to arrive. */
async function renderWithMembers() {
  render(<CommentEditor onSubmit={onSubmit} projectId="p1" />);
  await waitFor(() => expect(getMock).toHaveBeenCalledWith('/projects/p1/members'));
}

describe('CommentEditor — mention autocomplete', () => {
  it('does not fetch members without a projectId', () => {
    render(<CommentEditor onSubmit={onSubmit} />);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('opens the picker on "@"', async () => {
    await renderWithMembers();
    await userEvent.type(editor(), 'hey @');

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('filters as the term is typed', async () => {
    await renderWithMembers();
    await userEvent.type(editor(), 'hey @ala');

    await waitFor(() => {
      expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    });
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('does not open on an email address', async () => {
    await renderWithMembers();
    await userEvent.type(editor(), 'mail ada@exa');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('inserts the handle on click', async () => {
    await renderWithMembers();
    await userEvent.type(editor(), 'hey @ad');
    await userEvent.click(await screen.findByText('Ada Lovelace'));

    expect(editor()).toHaveValue('hey @ada ');
  });

  it('inserts the highlighted handle on Enter', async () => {
    await renderWithMembers();
    await userEvent.type(editor(), 'hey @gra');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Enter}');

    expect(editor()).toHaveValue('hey @grace ');
  });

  it('Enter picks a mention instead of submitting the comment', async () => {
    await renderWithMembers();
    await userEvent.type(editor(), '@ada');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('moves the highlight with the arrow keys', async () => {
    await renderWithMembers();
    await userEvent.type(editor(), '@');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    // Second entry in the list.
    expect(editor()).toHaveValue('@alan ');
  });

  it('wraps the highlight past the end of the list', async () => {
    await renderWithMembers();
    await userEvent.type(editor(), '@');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{ArrowUp}{Enter}');

    // Wraps to the last entry.
    expect(editor()).toHaveValue('@grace ');
  });

  it('Tab also commits the mention', async () => {
    await renderWithMembers();
    await userEvent.type(editor(), '@al');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Tab}');

    expect(editor()).toHaveValue('@alan ');
  });

  it('Escape closes the picker without cancelling the draft', async () => {
    const onCancel = vi.fn();
    render(<CommentEditor onSubmit={onSubmit} projectId="p1" onCancel={onCancel} />);
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    await userEvent.type(editor(), 'draft @ad');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(editor()).toHaveValue('draft @ad');
  });

  it('keeps text after the caret when mentioning mid-sentence', async () => {
    await renderWithMembers();
    const el = editor();
    await userEvent.type(el, 'please review');
    // Move the caret to just after "please " and start a mention there.
    await userEvent.type(el, '{ArrowLeft>6/}@ad');
    await userEvent.click(await screen.findByText('Ada Lovelace'));

    expect(el).toHaveValue('please @ada review');
  });

  it('closes the picker once a mention is committed', async () => {
    await renderWithMembers();
    await userEvent.type(editor(), '@ad');
    await userEvent.click(await screen.findByText('Ada Lovelace'));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('still lets a comment be submitted normally', async () => {
    await renderWithMembers();
    await userEvent.type(editor(), 'no mentions here');
    await userEvent.click(screen.getByRole('button', { name: /comment/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('no mentions here', []));
  });

  it('degrades to plain typing when the member fetch fails', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    render(<CommentEditor onSubmit={onSubmit} projectId="p1" />);
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    await userEvent.type(editor(), 'hey @ada');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(editor()).toHaveValue('hey @ada');
  });
});
