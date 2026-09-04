'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { InlineError } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { decideApprovalAction } from '@/server/actions/commercial';

export function ApprovalRow({
  id, discount, requesterLimit, impact, total, guestName, propertyName,
  quotationCode, requestedBy, requestedAgo, reason, leadId, approverLimit,
}: {
  id: string;
  discount: number;
  requesterLimit: number;
  impact: string;
  total: string;
  guestName: string;
  propertyName: string;
  quotationCode: string;
  requestedBy: string;
  requestedAgo: string;
  reason: string | null;
  leadId: string | null;
  approverLimit: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Beyond your own authority the buttons stay visible but explain themselves.
  const beyondAuthority = discount > approverLimit;

  function decide(decision: 'approved' | 'rejected') {
    setError(null);
    start(async () => {
      const result = await decideApprovalAction(id, decision, note || null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.push({
        tone: decision === 'approved' ? 'success' : 'info',
        title: `${discount}% ${decision}`,
        body: `${quotationCode} · ${guestName}`,
      });
      router.refresh();
    });
  }

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-warning-soft px-2 py-0.5 font-mono text-[13px] font-medium text-warning-ink">
              {discount}%
            </span>
            <span className="text-[13px] font-semibold text-ink">{guestName}</span>
            {leadId ? (
              <Link href={`/leads/${leadId}`} className="focus-ring tap rounded font-mono text-[11px] text-primary-ink hover:underline">
                {quotationCode}
              </Link>
            ) : (
              <span className="font-mono text-[11px] text-ink-3">{quotationCode}</span>
            )}
          </p>
          <p className="mt-1 text-[12px] text-ink-2">
            {propertyName} · requested by {requestedBy} ({requesterLimit}% limit) · {requestedAgo}
          </p>
          {reason ? (
            <p className="mt-1.5 rounded-md bg-surface-inset px-2.5 py-1.5 text-[12px] leading-5 text-ink-2">
              “{reason}”
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="tnum font-mono text-[13px] text-ink">{total}</p>
          <p className="tnum mt-0.5 font-mono text-[11px] text-danger-ink">−{impact}</p>
        </div>
      </div>

      {error ? <InlineError message={error} /> : null}

      {beyondAuthority ? (
        <p className="flex items-start gap-1.5 rounded-md bg-danger-soft px-2.5 py-2 text-[11px] leading-4 text-danger-ink">
          <ShieldAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          This exceeds your {approverLimit}% approval limit. Escalate it to an administrator. Approving will be
          refused by the server.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Decision note (optional)"
          aria-label={`Decision note for ${quotationCode}`}
          className="min-w-[12rem] flex-1"
        />
        <Button
          variant="primary"
          loading={pending}
          disabled={beyondAuthority}
          onClick={() => decide('approved')}
          icon={<Check aria-hidden className="size-4" />}
        >
          Approve
        </Button>
        <Button variant="ghost" loading={pending} onClick={() => decide('rejected')} className="text-danger-ink" icon={<X aria-hidden className="size-4" />}>
          Reject
        </Button>
      </div>
    </li>
  );
}
