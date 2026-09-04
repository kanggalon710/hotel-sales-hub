'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, MessageSquareReply, XCircle } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { InlineError } from '@/components/ui/states';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { decideReservationAction } from '@/server/actions/commercial';

type Mode = 'none' | 'confirm' | 'hold' | 'reject' | 'alternative';

/**
 * The four front-office outcomes from PRD 11.4. Confirming is treated as a
 * high-consequence action: it always asks first, and it states exactly what
 * evidence will be recorded.
 */
export function ReservationDecision({
  requestId,
  status,
  code,
  guestName,
  hasPmsConnector,
}: {
  requestId: string;
  status: string;
  code: string;
  guestName: string;
  hasPmsConnector: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('none');
  const [note, setNote] = useState('');
  const [manualReference, setManualReference] = useState('');
  const [holdHours, setHoldHours] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const decided = ['confirmed', 'rejected', 'expired', 'cancelled'].includes(status);

  function run(decision: Parameters<typeof decideReservationAction>[1], successMessage: string) {
    setError(null);
    start(async () => {
      const result = await decideReservationAction(requestId, decision);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode('none');
      setNote('');
      setManualReference('');
      toast.push({
        tone: 'success',
        title: successMessage,
        body: result.data.reference ? `Reference ${result.data.reference}` : undefined,
      });
      router.refresh();
    });
  }

  if (decided) {
    return (
      <Card>
        <CardHeader title="Decision" subtitle={`This request is ${status.replace(/_/g, ' ')}.`} />
        <CardBody>
          <p className="text-[13px] text-ink-2">
            No further action is available. Reopening requires a new request from sales.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Your decision"
          subtitle="Confirm, hold, offer an alternative, or reject with a reason sales can act on."
        />
        <CardBody className="space-y-3">
          {error ? <InlineError message={error} /> : null}

          {status === 'submitted' ? (
            <Button
              variant="secondary"
              onClick={() => run({ action: 'start_review' }, `${code} picked up`)}
              loading={pending}
              icon={<Clock aria-hidden className="size-4" />}
            >
              Start review
            </Button>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setMode('confirm')} icon={<Check aria-hidden className="size-4" />}>
              Confirm reservation
            </Button>
            <Button variant="secondary" onClick={() => setMode('hold')} icon={<Clock aria-hidden className="size-4" />}>
              Place on hold
            </Button>
            <Button variant="secondary" onClick={() => setMode('alternative')} icon={<MessageSquareReply aria-hidden className="size-4" />}>
              Offer alternative
            </Button>
            {/* Rejection sits apart from the constructive options. */}
            <Button variant="ghost" onClick={() => setMode('reject')} className="text-danger-ink" icon={<XCircle aria-hidden className="size-4" />}>
              Reject
            </Button>
          </div>

          <p className="text-[11px] leading-4 text-ink-3">
            Confirming writes a reservation reference and moves the lead to Confirmed. Without a PMS reference you
            must record an authorized manual one.
          </p>
        </CardBody>
      </Card>

      <Modal
        open={mode === 'confirm'}
        onClose={() => setMode('none')}
        title={`Confirm ${code}`}
        description={`This creates a reservation for ${guestName} and moves the lead to Confirmed.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode('none')}>Cancel</Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() => run({ action: 'confirm', manualReference: manualReference || null, note: note || null }, `${code} confirmed`)}
            >
              Confirm reservation
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <InlineError message={error} /> : null}
          <Field
            label="Manual reference"
            htmlFor="manual-ref"
            hint={
              hasPmsConnector
                ? 'Leave empty to create the reservation in the PMS. Fill it only when you already booked it there yourself.'
                : 'No PMS connector, so a manual reference is required.'
            }
          >
            <Input
              id="manual-ref"
              value={manualReference}
              onChange={(e) => setManualReference(e.target.value)}
              placeholder="e.g. OPERA-884120"
            />
          </Field>
          <Field label="Note for sales" htmlFor="confirm-note">
            <Textarea id="confirm-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={mode === 'hold'}
        onClose={() => setMode('none')}
        title={`Place ${code} on hold`}
        description="Inventory is held temporarily. Sales sees the countdown on the lead."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode('none')}>Cancel</Button>
            <Button variant="primary" loading={pending} onClick={() => run({ action: 'hold', note: note || null, hours: holdHours }, `${code} on hold`)}>
              Place on hold
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <InlineError message={error} /> : null}
          <Field label="Hold for (hours)" htmlFor="hold-hours" required>
            <Input id="hold-hours" type="number" min={1} max={168} value={holdHours} onChange={(e) => setHoldHours(Number(e.target.value))} />
          </Field>
          <Field label="Note for sales" htmlFor="hold-note">
            <Textarea id="hold-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={mode === 'alternative'}
        onClose={() => setMode('none')}
        title={`Offer an alternative for ${code}`}
        description="Sales sees this on the lead without reading any logs."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode('none')}>Cancel</Button>
            <Button variant="primary" loading={pending} onClick={() => run({ action: 'alternative', note }, 'Alternative sent to sales')}>
              Send alternative
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <InlineError message={error} /> : null}
          <Field
            label="What can you offer instead?"
            htmlFor="alt-note"
            required
            hint="Be specific: dates, room type, rate. The guest hears this next."
          >
            <Textarea
              id="alt-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Deluxe King is sold out on the 15th, but Premier Twin is open at the same rate, or Deluxe King from the 16th."
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={mode === 'reject'}
        onClose={() => setMode('none')}
        title={`Reject ${code}`}
        description="The lead stays open so sales can recover it. A reason is required."
        tone="danger"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode('none')}>Cancel</Button>
            <Button variant="danger" loading={pending} onClick={() => run({ action: 'reject', note }, `${code} rejected`)}>
              Reject request
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <InlineError message={error} /> : null}
          <Field label="Reason" htmlFor="reject-note" required hint="Sales will relay this, so write it for a person.">
            <Textarea id="reject-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
