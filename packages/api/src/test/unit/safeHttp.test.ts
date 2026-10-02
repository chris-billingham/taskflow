import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isPrivateAddress, safePost, BlockedAddressError } from '../../utils/safeHttp.js';

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'])(
    'refuses %s',
    (address) => expect(isPrivateAddress(address)).toBe(true),
  );
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (address) =>
    expect(isPrivateAddress(address)).toBe(false),
  );
});

describe('safePost', () => {
  it('refuses a private IP literal and a hostname that resolves to one', async () => {
    await expect(safePost('http://127.0.0.1:9/hook', '{}', {}, { allowPrivate: false, timeoutMs: 1000 })).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(safePost('http://localhost:9/hook', '{}', {}, { allowPrivate: false, timeoutMs: 1000 })).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it('posts when private addresses are allowed, and doesn’t follow redirects', async () => {
    const received: string[] = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push(body);
        res.writeHead(req.url === '/moved' ? 302 : 204, req.url === '/moved' ? { location: '/elsewhere' } : {});
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://localhost:${(server.address() as AddressInfo).port}`;
    try {
      expect(await safePost(`${base}/hook`, '{"a":1}', { 'content-type': 'application/json' }, { allowPrivate: true, timeoutMs: 2000 })).toEqual({ status: 204 });
      expect(await safePost(`${base}/moved`, '{}', {}, { allowPrivate: true, timeoutMs: 2000 })).toEqual({ status: 302 });
      expect(received).toEqual(['{"a":1}', '{}']);
    } finally {
      server.close();
    }
  });
});
