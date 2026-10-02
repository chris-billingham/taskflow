import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockApi } from '../mocks/api';
import DataExport from '@/pages/settings/DataExport';

beforeEach(() => mockApi.post.mockReset());

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DataExport />
    </QueryClientProvider>,
  );

describe('Data & Privacy import', () => {
  it('uploads the chosen file and reports what was created, with warnings', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        success: true,
        data: { projects: 2, sections: 1, tasks: 14, comments: 3, attachments: 0, labels: 1, filters: 0, warnings: ['Couldn\'t read the date "someday" on "Paint"'] },
      },
    });
    const user = userEvent.setup();
    renderPage();
    const file = new File(['TYPE,CONTENT\ntask,Paint'], 'Home.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('File to import'), file);
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/settings/import', expect.any(FormData)));
    const sent = mockApi.post.mock.calls[0][1] as FormData;
    expect((sent.get('file') as File).name).toBe('Home.csv');
    expect(await screen.findByText(/Imported 2 projects, 14 tasks, 3 comments and 1 new label\./)).toBeInTheDocument();
    expect(screen.getByText(/Couldn't read the date "someday"/)).toBeInTheDocument();
  });

  it('shows why an import was refused', async () => {
    mockApi.post.mockRejectedValueOnce(
      Object.assign(new Error('refused'), { response: { data: { message: 'That isn’t a Taskflow export, or it’s from a newer version.' } } }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('File to import'), new File(['{}'], 'x.json', { type: 'application/json' }));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText(/isn’t a Taskflow export/)).toBeInTheDocument();
  });
});
