import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, integrationConnections } from '@/db';
import { decryptSecret, newId, secretsMatch } from '@/server/crypto';
import { processWebhookEvent, recordWebhookEvent, type ChatwootPayload } from '@/server/services/chatwoot-ingest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Chatwoot webhook receiver (PRD 10.3).
 *
 * The endpoint always accepts and records; business failures are handled by the
 * retry/dead-letter pipeline rather than by returning an error to Chatwoot,
 * which would only produce uncontrolled redelivery.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  const correlationId = newId('cor');

  const connection = db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.id, connectionId))
    .get();

  if (!connection || connection.provider !== 'chatwoot') {
    return NextResponse.json({ ok: false, error: 'Unknown webhook endpoint.' }, { status: 404 });
  }
  if (!connection.active) {
    return NextResponse.json({ ok: false, error: 'This connection is disabled.' }, { status: 409 });
  }

  // Shared-secret check. Chatwoot's own signing varies by deployment, so the
  // token is issued by us and carried in a header or query string.
  //
  // This fails closed. The previous version only checked the token when the
  // secret decrypted, so a connection whose ciphertext could not be read - the
  // ordinary case when CRM_SECRET_KEY differs from the key that wrote the row -
  // silently accepted every unauthenticated request. A public write endpoint
  // that cannot verify its caller must refuse, not wave them through.
  if (!connection.webhookSecretCiphertext) {
    return NextResponse.json(
      { ok: false, error: 'This endpoint has no webhook secret configured.' },
      { status: 401 },
    );
  }

  const expected = decryptSecret(connection.webhookSecretCiphertext);
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'The webhook secret for this connection cannot be read. Check CRM_SECRET_KEY, then rotate the secret.' },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const provided =
    request.headers.get('x-webhook-token') ??
    request.headers.get('x-chatwoot-signature') ??
    url.searchParams.get('token');
  if (!secretsMatch(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'Invalid webhook token.' }, { status: 401 });
  }

  const rawBody = await request.text();
  let payload: ChatwootPayload;
  try {
    payload = JSON.parse(rawBody) as ChatwootPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'Body is not valid JSON.' }, { status: 400 });
  }

  const { event, duplicate } = recordWebhookEvent({
    connectionId: connection.id,
    organizationId: connection.organizationId,
    payload,
    rawBody,
    correlationId,
  });

  if (duplicate) {
    return NextResponse.json(
      { ok: true, status: 'duplicate', eventId: event.id, correlationId },
      { status: 202 },
    );
  }

  const outcome = processWebhookEvent(event.id);

  return NextResponse.json(
    {
      ok: outcome.status !== 'failed' && outcome.status !== 'dead_letter',
      status: outcome.status,
      summary: outcome.summary,
      eventId: event.id,
      leadId: outcome.leadId ?? null,
      correlationId,
    },
    { status: 202 },
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: true, message: 'Chatwoot webhook endpoint. Send events with POST.' },
    { status: 200 },
  );
}
