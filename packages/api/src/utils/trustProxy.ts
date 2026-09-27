import proxyAddr from 'proxy-addr';

/**
 * Fastify `trustProxy` function: believe X-Forwarded-For only through the
 * `hops` peers nearest the server, and only when each of those peers is on a
 * trusted network (`addrs`: proxy-addr names like `uniquelocal`, IPs or CIDRs).
 *
 * A bare hop count is not enough. Fastify >= 5.12.1 treats a numeric
 * `trustProxy` as "trust nothing", because a count alone cannot tell the real
 * proxy from a client that sends enough fake hops — which, under the old
 * `trustProxy: TRUST_PROXY_HOPS`, silently collapsed every rate-limit bucket
 * onto Traefik's address. Pairing the count with a peer check keeps both
 * properties: the peer must BE a proxy, and nothing beyond `hops` is believed.
 */
export function buildTrustProxy(hops: number, addrs: string) {
  const trusted = proxyAddr.compile(
    addrs
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
  );
  return (address: string, hop: number): boolean => hop < hops && trusted(address, hop);
}
