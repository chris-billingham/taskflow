import { http, HttpResponse } from 'msw';
import { ok } from './fixtures';

export const API = '/api/v1';

// Ambient requests that shells and panels make on their own (sidebar data,
// the task panel's side fetches). Each page test states the data it is about
// with server.use(); anything neither here nor there fails the test, so a page
// that starts calling a new endpoint is noticed.
export const defaultHandlers = [
  http.get(`${API}/labels`, () => HttpResponse.json(ok([]))),
  http.get(`${API}/filters`, () => HttpResponse.json(ok([]))),
  http.get(`${API}/workspaces`, () => HttpResponse.json(ok([]))),
  http.get(`${API}/projects`, () => HttpResponse.json(ok([]))),
  http.get(`${API}/projects/:id/members`, () => HttpResponse.json(ok([]))),
  http.get(`${API}/tasks/:id/comments`, () => HttpResponse.json(ok([]))),
  http.get(`${API}/tasks/:id/attachments`, () => HttpResponse.json(ok([]))),
  http.get(`${API}/tasks/:id/reminders`, () => HttpResponse.json(ok([]))),
  http.get(`${API}/tasks/:id/activity`, () => HttpResponse.json(ok([]))),
  http.get(`${API}/attachments/limits`, () =>
    HttpResponse.json(ok({ maxFileSizeMb: 25, allowedTypes: [] })),
  ),
  http.get(`${API}/notifications/vapid-public-key`, () =>
    HttpResponse.json(ok({ publicKey: null })),
  ),
];
