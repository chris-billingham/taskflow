import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/**
 * Outgoing requests to addresses users choose (webhooks), which must not be
 * turned against the server's own network: loopback, private ranges, link
 * local (cloud metadata at 169.254.169.254) and the like are refused unless
 * allowPrivate is set. The check runs on the address actually connected to,
 * after DNS, so a hostname that resolves inward is caught too.
 */

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

export function isPrivateAddress(address: string): boolean {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return blocked.check(mapped[1], 'ipv4');
  const family = isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) return blocked.check(address, 'ipv6');
  return true;
}

export class BlockedAddressError extends Error {
  constructor(address: string) {
    super(`${address} is a private or local address`);
  }
}

function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const list = addresses as LookupAddress[];
      const bad = !allowPrivate && list.find((a) => isPrivateAddress(a.address));
      if (bad) return callback(new BlockedAddressError(bad.address), '', 0);
      if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

export interface SafeResponse {
  status: number;
}

/** POST a body, without following redirects; resolves with the status whatever it is. */
export function safePost(
  url: string,
  body: string,
  headers: Record<string, string>,
  options: { allowPrivate: boolean; timeoutMs: number },
): Promise<SafeResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const host = target.hostname.replace(/^\[|\]$/g, '');
    // IP literals skip DNS, so check them directly.
    if (isIP(host) && !options.allowPrivate && isPrivateAddress(host)) {
      return reject(new BlockedAddressError(host));
    }
    const transport = target.protocol === 'https:' ? https : http;
    const req = transport.request(
      target,
      {
        method: 'POST',
        headers: { ...headers, 'content-length': Buffer.byteLength(body).toString() },
        lookup: guardedLookup(options.allowPrivate),
        timeout: options.timeoutMs,
      },
      (res) => {
        // Nothing in the reply is used; drain it so the socket is released.
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`No response within ${options.timeoutMs / 1000} seconds`)));
    req.on('error', reject);
    req.end(body);
  });
}
