import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { buildTrustProxy } from '../../utils/trustProxy.js';

// request.ip is the key for EVERY rate-limit bucket (login 5/15min,
// registration 5/hour, password reset 3/hour). With Fastify's
// `trustProxy: true` the whole X-Forwarded-For chain is trusted and request.ip
// becomes its leftmost entry — a value the client supplies, so rotating the
// header gave an attacker unlimited attempts at each limit. A hop COUNT trusts
// only the addresses nearest the server, which is what these tests pin down.
//
// Fastify >= 5.12.1 turned a numeric trustProxy into "trust nothing", so the
// server pairs the count with a check that the peer is on a trusted network.
// These tests run the exact function server.ts installs.

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({
    logger: false,
    trustProxy: buildTrustProxy(env.TRUST_PROXY_HOPS, env.TRUST_PROXY_ADDRS),
  });
  app.get('/whoami', async (request) => ({ ip: request.ip }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// inject() connects from 127.0.0.1 unless told otherwise — a trusted peer,
// like Traefik on the Docker network or Vite's dev proxy.
async function ipFor(
  headers: Record<string, string>,
  remoteAddress = '127.0.0.1',
): Promise<string> {
  const response = await app.inject({ method: 'GET', url: '/whoami', headers, remoteAddress });
  return response.json().ip;
}

describe('proxy trust', () => {
  it('defaults to exactly one hop', () => {
    // The shipped topology is client → Traefik → API (and Vite's proxy in dev).
    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });

  it('ignores a client-supplied X-Forwarded-For entry', async () => {
    // What the proxy appends is the real client; anything to the left of it was
    // sent by the client itself and must not be believed.
    const ip = await ipFor({
      'x-forwarded-for': '203.0.113.9, 198.51.100.7',
    });
    expect(ip).toBe('198.51.100.7');
    expect(ip).not.toBe('203.0.113.9');
  });

  it('gives every spoofed header the same rate-limit key', async () => {
    // The bug: each distinct spoofed value produced a distinct request.ip, so
    // each got its own fresh bucket.
    const first = await ipFor({ 'x-forwarded-for': '1.1.1.1, 198.51.100.7' });
    const second = await ipFor({ 'x-forwarded-for': '2.2.2.2, 198.51.100.7' });
    expect(first).toBe(second);
  });

  it('uses the single forwarded address when the proxy adds the only entry', async () => {
    expect(await ipFor({ 'x-forwarded-for': '198.51.100.7' })).toBe('198.51.100.7');
  });

  it('ignores forwarded headers from a peer outside the trusted networks', async () => {
    // A client reaching the API directly (not via the proxy) cannot pick its
    // own rate-limit key by sending X-Forwarded-For.
    expect(await ipFor({ 'x-forwarded-for': '1.1.1.1' }, '203.0.113.50')).toBe('203.0.113.50');
  });

  it('trusts a Docker bridge-network peer by default', async () => {
    expect(await ipFor({ 'x-forwarded-for': '198.51.100.7' }, '172.18.0.3')).toBe('198.51.100.7');
  });

  it('falls back to the socket address with no forwarded header', async () => {
    expect(await ipFor({})).toBeTruthy();
  });
});
