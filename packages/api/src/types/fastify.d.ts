import 'fastify';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Refuse personal access tokens: account security needs a real sign-in. */
    sessionOnly?: boolean;
  }
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      name: string;
      /** The session (signed-in device), when signed in with a password. */
      sid?: string;
    };
    /** How the request authenticated: a session's access token, or a personal access token. */
    auth?: { kind: 'session' } | { kind: 'token'; scope: 'READ' | 'WRITE'; tokenId: string };
  }
}
