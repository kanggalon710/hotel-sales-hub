import { headers } from 'next/headers';

/**
 * The public origin of this deployment, used to build the webhook URL an
 * operator pastes into Chatwoot.
 *
 * Order matters. An explicit APP_URL wins, because an operator may terminate
 * TLS somewhere the request headers do not describe. Otherwise the origin is
 * read from the proxy headers, so a fresh deployment behind nginx shows the
 * right URL with no configuration at all. The old localhost fallback was a
 * trap: it produced a URL that looked valid, was copied into Chatwoot, and
 * then silently never delivered.
 */
export async function requestOrigin(): Promise<string> {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return 'http://localhost:3000';

  // A proxy may send a comma-separated list; the first entry is the client-facing one.
  const proto = (h.get('x-forwarded-proto') ?? '').split(',')[0].trim()
    || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');

  return `${proto}://${host}`.replace(/\/$/, '');
}
