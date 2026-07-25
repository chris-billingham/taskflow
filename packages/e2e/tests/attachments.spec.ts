import { test, expect, request as pwRequest } from '@playwright/test';
import { TEST_USER } from '../global-setup';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

// Exercises the real chain (API → MinIO → API streaming) that presigned URLs
// used to break: in the shipped topology the S3 endpoint is internal-only, so
// downloads must round-trip through the API.
test.describe('Attachments', () => {
  let headers: { Authorization: string };
  let api: Awaited<ReturnType<typeof pwRequest.newContext>>;
  let taskId: string;

  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL: API_URL });
    const login = await api.post('/api/v1/auth/login', {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    expect(login.ok()).toBeTruthy();
    headers = {
      Authorization: `Bearer ${(await login.json()).data.accessToken}`,
    };

    const projects = await api.get('/api/v1/projects', { headers });
    const inbox = (await projects.json()).data.find(
      (p: { isInbox: boolean }) => p.isInbox,
    );
    const task = await api.post('/api/v1/tasks', {
      data: { content: `Attachment host ${Date.now()}`, projectId: inbox.id },
      headers,
    });
    taskId = (await task.json()).data.id;
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('upload → list → download round-trip preserves content', async () => {
    const fileContent = `attachment round-trip ${Date.now()}`;

    const upload = await api.post(`/api/v1/tasks/${taskId}/attachments`, {
      headers,
      multipart: {
        file: {
          name: 'notes.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from(fileContent),
        },
      },
    });
    expect(upload.status()).toBe(201);
    const attachment = (await upload.json()).data;
    expect(attachment.filename).toBe('notes.txt');

    const list = await api.get(`/api/v1/tasks/${taskId}/attachments`, { headers });
    const listed = (await list.json()).data;
    expect(listed.some((a: { id: string }) => a.id === attachment.id)).toBe(true);

    const download = await api.get(`/api/v1/attachments/${attachment.id}/download`, {
      headers,
    });
    expect(download.status()).toBe(200);
    expect(await download.text()).toBe(fileContent);

    // Untrusted content must never render in-browser by default.
    const h = download.headers();
    expect(h['content-disposition']).toContain('attachment');
    expect(h['content-disposition']).toContain('notes.txt');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['content-type']).toContain('text/plain');
  });

  test('inline rendering is only honoured for images', async () => {
    const upload = await api.post(`/api/v1/tasks/${taskId}/attachments`, {
      headers,
      multipart: {
        file: {
          name: 'inline-check.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('should never render inline'),
        },
      },
    });
    const attachment = (await upload.json()).data;

    const download = await api.get(
      `/api/v1/attachments/${attachment.id}/download?inline=1`,
      { headers },
    );
    expect(download.headers()['content-disposition']).toContain('attachment');
  });

  test('downloads require authentication', async () => {
    const anon = await pwRequest.newContext({ baseURL: API_URL });
    const res = await anon.get('/api/v1/attachments/whatever/download');
    expect(res.status()).toBe(401);
    await anon.dispose();
  });

  test('rejects binary content smuggled under a text label', async () => {
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    const upload = await api.post(`/api/v1/tasks/${taskId}/attachments`, {
      headers,
      multipart: {
        file: { name: 'innocent.txt', mimeType: 'text/plain', buffer: pngBytes },
      },
    });
    expect(upload.status()).toBe(400);
  });

  test('accepts a genuine PNG and serves it inline on request', async () => {
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    const upload = await api.post(`/api/v1/tasks/${taskId}/attachments`, {
      headers,
      multipart: {
        file: { name: 'pixel.png', mimeType: 'image/png', buffer: pngBytes },
      },
    });
    expect(upload.status()).toBe(201);
    const attachment = (await upload.json()).data;

    const download = await api.get(
      `/api/v1/attachments/${attachment.id}/download?inline=1`,
      { headers },
    );
    expect(download.status()).toBe(200);
    expect(download.headers()['content-disposition']).toContain('inline');
    expect(Buffer.from(await download.body()).equals(pngBytes)).toBe(true);
  });
});
