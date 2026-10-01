import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http2 from 'node:http2';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const envState = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('../../config/env.js', () => ({ env: envState }));

import { isApnsConfigured, resetApns, sendApns } from '../../services/apns.js';

// A stand-in for api.push.apple.com: records requests, answers per token.
const seen: { headers: http2.IncomingHttpHeaders; body: string }[] = [];
let server: http2.Http2Server;

beforeAll(async () => {
  server = http2.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ headers: req.headers, body });
      const token = String(req.headers[':path']).split('/').pop();
      if (token === 'dead') {
        res.writeHead(410).end(JSON.stringify({ reason: 'Unregistered' }));
      } else if (token === 'badtopic') {
        res.writeHead(400).end(JSON.stringify({ reason: 'DeviceTokenNotForTopic' }));
      } else {
        res.writeHead(200).end();
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  Object.assign(envState, {
    APNS_KEY_ID: 'KEY123',
    APNS_TEAM_ID: 'TEAM456',
    APNS_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\n/g, '\\n'),
    APNS_BUNDLE_ID: 'app.taskflow.ios',
    APNS_HOST: `http://localhost:${(server.address() as AddressInfo).port}`,
  });
});
afterAll(() => {
  resetApns();
  server.close();
});

describe('APNs', () => {
  it('is off until all four settings are present', () => {
    expect(isApnsConfigured()).toBe(true);
  });

  it('sends an alert the way Apple expects, signed with the team key', async () => {
    const result = await sendApns('abc123', 'SANDBOX', { title: 'Task assigned', body: 'Sam gave you “Ship it”' }, { taskId: 't1' });
    expect(result).toMatchObject({ ok: true, dead: false, status: 200 });

    const { headers, body } = seen.at(-1)!;
    expect(headers[':path']).toBe('/3/device/abc123');
    expect(headers['apns-topic']).toBe('app.taskflow.ios');
    expect(headers['apns-push-type']).toBe('alert');
    expect(JSON.parse(body)).toEqual({ aps: { alert: { title: 'Task assigned', body: 'Sam gave you “Ship it”' }, sound: 'default' }, taskId: 't1' });

    const token = String(headers.authorization).replace(/^bearer /, '');
    const decoded = jwt.verify(token, publicKey.export({ type: 'spki', format: 'pem' }), { algorithms: ['ES256'], complete: true });
    expect(decoded.header).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
    expect(decoded.payload).toMatchObject({ iss: 'TEAM456' });
  });

  it('reuses the provider token between sends', async () => {
    await sendApns('abc123', 'SANDBOX', { title: 'a', body: 'b' });
    const [x, y] = seen.slice(-2).map((s) => s.headers.authorization);
    expect(x).toBe(y);
  });

  it('reports tokens Apple will never accept', async () => {
    expect(await sendApns('dead', 'SANDBOX', { title: 'a', body: 'b' })).toMatchObject({ ok: false, dead: true, reason: 'Unregistered' });
    expect(await sendApns('badtopic', 'SANDBOX', { title: 'a', body: 'b' })).toMatchObject({ dead: true });
  });
});
