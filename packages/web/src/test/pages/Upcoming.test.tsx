import '../mocks/socket';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { API } from '../msw/handlers';
import { apiDate, localDateString, makeTask, ok } from '../msw/fixtures';
import { renderPage } from '../helpers/renderPage';
import type { Task } from '@/types/task';
import Upcoming from '@/pages/app/Upcoming';

function upcomingView(byDate: Record<string, Task[]> = {}, noDate: Task[] = [], overdue: Task[] = []) {
  const dated = Object.values(byDate).flat().length;
  const total = dated + noDate.length + overdue.length;
  return { overdue, byDate, noDate, counts: { overdue: overdue.length, total, returned: total } };
}

function serveUpcoming(view: ReturnType<typeof upcomingView>, seen: URL[] = []) {
  server.use(
    http.get(`${API}/views/upcoming`, ({ request }) => {
      seen.push(new URL(request.url));
      return HttpResponse.json(ok(view));
    }),
  );
  return seen;
}

const tomorrow = localDateString(1);

describe('Upcoming page', () => {
  it('asks for the next 14 days, including undated tasks', async () => {
    const seen = serveUpcoming(upcomingView());

    renderPage(<Upcoming />, { route: '/upcoming', path: '/upcoming' });

    await screen.findByText('Nothing upcoming');
    expect(seen[0].searchParams.get('days')).toBe('14');
    expect(seen[0].searchParams.get('includeNoDate')).toBe('true');
  });

  it("files each task under its due date's section", async () => {
    serveUpcoming(
      upcomingView({
        [tomorrow]: [makeTask({ content: 'Book the venue', dueDate: apiDate(tomorrow) })],
      }),
    );

    const { container } = renderPage(<Upcoming />, { route: '/upcoming', path: '/upcoming' });

    await screen.findByText('Book the venue');
    const section = container.querySelector(`#date-section-${tomorrow}`) as HTMLElement;
    expect(section).not.toBeNull();
    expect(within(section).getByText('Book the venue')).toBeInTheDocument();
  });

  it('lists undated tasks under "No date", which can be collapsed', async () => {
    serveUpcoming(upcomingView({}, [makeTask({ content: 'Someday: learn Rust' })]));

    const { user } = renderPage(<Upcoming />, { route: '/upcoming', path: '/upcoming' });

    expect(await screen.findByText('Someday: learn Rust')).toBeInTheDocument();
    // The section toggle's name includes its count; task rows have their own
    // "No date" date-picker buttons.
    await user.click(screen.getByRole('button', { name: /^No date\s*1$/ }));
    expect(screen.queryByText('Someday: learn Rust')).not.toBeInTheDocument();
  });

  it("adds a task under a day with that day's exact date", async () => {
    serveUpcoming(upcomingView());
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/tasks/quick-add`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ok(makeTask({ content: 'Call the printer' })), { status: 201 });
      }),
    );

    const { container, user } = renderPage(<Upcoming />, { route: '/upcoming', path: '/upcoming' });
    await screen.findByText('Nothing upcoming');
    const section = container.querySelector(`#date-section-${tomorrow}`) as HTMLElement;
    await user.click(within(section).getByRole('button', { name: /Add task/ }));
    await user.type(within(section).getByRole('textbox'), 'Call the printer{Enter}');

    await waitFor(() => expect(body).toEqual({ text: 'Call the printer', dueDate: tomorrow }));
  });
});
