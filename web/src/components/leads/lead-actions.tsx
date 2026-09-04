'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  BedDouble, CalendarCheck, FileText, MoreHorizontal, Plus, Search,
  Send, ShieldAlert, Trash2, TriangleAlert, UserPlus, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, Modal } from '@/components/ui/overlay';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { InlineError } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { LOST_REASONS } from '@/lib/constants';
import { priceQuotation } from '@/lib/pricing';
import { cn, formatMoney, nightsBetween, relativeTime } from '@/lib/utils';
import {
  createQuotationAction, requestReservationAction, searchAvailabilityAction, sendQuotationAction,
} from '@/server/actions/commercial';
import { assignLeadAction, changeStageAction } from '@/server/actions/leads';
import type { AvailabilityOutcome, AvailabilityRow } from '@/server/services/availability';

type Lead = {
  id: string; code: string; stage: string; status: string;
  propertyId: string; propertyName: string;
  checkIn: string | null; checkOut: string | null;
  rooms: number; adults: number; children: number;
  currency: string; ownerUserId: string | null;
  specialRequest: string | null; firstRespondedAt: number | null;
};

type QuoteLine = {
  key: string;
  roomTypeId: string | null; roomTypeName: string;
  ratePlanId: string | null; ratePlanName: string;
  rooms: number; ratePerNight: number; inclusions: string[];
};

type Panel = 'none' | 'availability' | 'quote' | 'reservation';

/**
 * All lead workflows in a single client island. Only one drawer is ever mounted,
 * which keeps the PRD's "no nested modal" rule structurally true rather than a
 * convention someone has to remember.
 */
export function LeadActions({
  lead, roomTypes, ratePlans, latestQuote, defaults, latestSearch,
  canWrite, canQuote, canSearch, canRequestReservation,
  discountLimitPercent, currentUserId,
}: {
  lead: Lead;
  roomTypes: { id: string; code: string; name: string }[];
  ratePlans: { id: string; code: string; name: string; inclusions: string[]; policies: string | null }[];
  latestQuote: {
    versionId: string; code: string; version: number; status: string;
    total: number; currency: string; roomTypeName: string | null; ratePlanName: string | null;
  } | null;
  defaults: { servicePercent: number; taxPercent: number; validityHours: number; locale: string };
  latestSearch: { id: string; checkedAt: number; sourceLabel: string; stale: boolean } | null;
  canWrite: boolean; canQuote: boolean; canSearch: boolean;
  canRequestReservation: boolean;
  discountLimitPercent: number; currentUserId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [panel, setPanel] = useState<Panel>('none');
  const [closing, setClosing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Deep links from the Chatwoot panel (#availability, #quote, #reserve) open the
  // matching drawer. Deferred to a macrotask so it never fights hydration and
  // still fires when the tab is in the background (rAF would not).
  useEffect(() => {
    const target = ({ '#availability': 'availability', '#quote': 'quote', '#reserve': 'reservation' } as Record<string, Panel>)[window.location.hash];
    if (!target) return;
    const timer = window.setTimeout(() => setPanel(target), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [pending, startTransition] = useTransition();
  const locale = defaults.locale;

  /* ------------------------------ availability ------------------------------ */

  const [availForm, setAvailForm] = useState({
    checkIn: lead.checkIn ?? '',
    checkOut: lead.checkOut ?? '',
    rooms: lead.rooms,
    adults: lead.adults,
    children: lead.children,
    simulate: 'ok' as 'ok' | 'timeout' | 'sold_out' | 'error',
  });
  const [availResult, setAvailResult] = useState<AvailabilityOutcome | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function runSearch() {
    setSearching(true);
    setAvailError(null);
    const result = await searchAvailabilityAction({
      propertyId: lead.propertyId,
      leadId: lead.id,
      checkIn: availForm.checkIn,
      checkOut: availForm.checkOut,
      rooms: availForm.rooms,
      adults: availForm.adults,
      children: availForm.children,
      simulate: availForm.simulate,
    });
    setSearching(false);
    if (!result.ok) {
      setAvailError(result.error);
      setAvailResult(null);
      return;
    }
    setAvailResult(result.data);
    if (result.data.ok) {
      toast.push({
        tone: 'success',
        title: `${result.data.rows.filter((r) => r.sellableQty > 0).length} sellable options`,
        body: `${result.data.sourceLabel} · ${result.data.latencyMs}ms`,
      });
      router.refresh();
    }
  }

  /* -------------------------------- quotation -------------------------------- */

  const nights = lead.checkIn && lead.checkOut ? nightsBetween(lead.checkIn, lead.checkOut) : 1;
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountValue, setDiscountValue] = useState(0);
  const [validityHours, setValidityHours] = useState(defaults.validityHours);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quotePolicies, setQuotePolicies] = useState(ratePlans[0]?.policies ?? '');
  // Policies track the chosen rate plan until the user types their own.
  const [policiesEdited, setPoliciesEdited] = useState(false);

  function adoptPolicies(ratePlanId: string | null) {
    if (policiesEdited) return;
    const plan = ratePlans.find((r) => r.id === ratePlanId);
    if (plan?.policies) setQuotePolicies(plan.policies);
  }
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const pricing = useMemo(
    () =>
      priceQuotation({
        lines: lines.map((l) => ({ rooms: l.rooms, ratePerNight: l.ratePerNight })),
        nights,
        discountType,
        discountValue,
        servicePercent: defaults.servicePercent,
        taxPercent: defaults.taxPercent,
      }),
    [lines, nights, discountType, discountValue, defaults.servicePercent, defaults.taxPercent],
  );

  const overLimit = pricing.discountPercentEffective > discountLimitPercent + 0.001;

  function addLineFromOffer(row: AvailabilityRow) {
    setLines((prev) => [
      ...prev,
      {
        key: `${row.roomTypeCode}-${row.ratePlanCode}-${prev.length}`,
        roomTypeId: row.roomTypeId,
        roomTypeName: row.roomTypeName,
        ratePlanId: row.ratePlanId,
        ratePlanName: row.ratePlanName,
        rooms: Math.min(availForm.rooms, row.sellableQty || availForm.rooms),
        ratePerNight: row.ratePerNight,
        inclusions: row.inclusions,
      },
    ]);
    adoptPolicies(row.ratePlanId);
    setPanel('quote');
  }

  function addBlankLine() {
    const room = roomTypes[0];
    const plan = ratePlans[0];
    setLines((prev) => [
      ...prev,
      {
        key: `manual-${prev.length}-${Date.now()}`,
        roomTypeId: room?.id ?? null,
        roomTypeName: room?.name ?? 'Room',
        ratePlanId: plan?.id ?? null,
        ratePlanName: plan?.name ?? 'Rate',
        rooms: lead.rooms,
        ratePerNight: 0,
        inclusions: plan?.inclusions ?? [],
      },
    ]);
    adoptPolicies(plan?.id ?? null);
  }

  async function saveQuote(send: boolean) {
    setQuoteError(null);
    if (lines.length === 0) {
      setQuoteError('Add at least one room line before saving.');
      return;
    }
    if (lines.some((l) => l.ratePerNight <= 0)) {
      setQuoteError('Every line needs a nightly rate above zero.');
      return;
    }
    startTransition(async () => {
      const created = await createQuotationAction({
        leadId: lead.id,
        lines: lines.map((l) => ({
          roomTypeId: l.roomTypeId, roomTypeName: l.roomTypeName,
          ratePlanId: l.ratePlanId, ratePlanName: l.ratePlanName,
          rooms: l.rooms, ratePerNight: l.ratePerNight, inclusions: l.inclusions,
        })),
        discountType, discountValue, validityHours,
        policies: quotePolicies || null,
        notes: quoteNotes || null,
        inclusions: [...new Set(lines.flatMap((l) => l.inclusions))],
        availabilitySearchId: availResult?.ok ? availResult.searchId : (latestSearch?.id ?? null),
        snapshotSource: availResult?.ok ? availResult.sourceLabel : (latestSearch?.sourceLabel ?? null),
        snapshotCheckedAtMs: availResult?.ok ? availResult.checkedAt.getTime() : (latestSearch?.checkedAt ?? null),
        supersedesVersionId: latestQuote && ['draft', 'approved', 'sent'].includes(latestQuote.status) ? latestQuote.versionId : null,
      });

      if (!created.ok) {
        setQuoteError(created.error);
        return;
      }

      if (created.data.needsApproval) {
        toast.push({
          tone: 'warning',
          title: `${created.data.code} sent for approval`,
          body: `${pricing.discountPercentEffective}% is above your ${discountLimitPercent}% limit, so it cannot be sent yet.`,
        });
        setPanel('none');
        setLines([]);
        router.refresh();
        return;
      }

      if (!send) {
        toast.push({ tone: 'success', title: `${created.data.code} saved as draft` });
        setPanel('none');
        setLines([]);
        router.refresh();
        return;
      }

      const sent = await sendQuotationAction(created.data.versionId);
      if (!sent.ok) {
        setQuoteError(sent.error);
        return;
      }
      toast.push({
        tone: 'success',
        title: `${sent.data.code} sent via Chatwoot`,
        body: formatMoney(created.data.total, lead.currency, locale),
      });
      setPanel('none');
      setLines([]);
      router.refresh();
    });
  }

  /* ------------------------------- reservation ------------------------------- */

  const [resForm, setResForm] = useState({
    kind: 'reservation' as 'hold' | 'reservation',
    roomTypeId: roomTypes[0]?.id ?? '',
    ratePlanId: ratePlans[0]?.id ?? '',
    totalAmount: latestQuote?.total ?? 0,
    specialRequest: lead.specialRequest ?? '',
    internalNote: '',
  });
  const [resError, setResError] = useState<string | null>(null);

  function submitReservation() {
    setResError(null);
    const room = roomTypes.find((r) => r.id === resForm.roomTypeId);
    const plan = ratePlans.find((r) => r.id === resForm.ratePlanId);
    startTransition(async () => {
      const result = await requestReservationAction({
        leadId: lead.id,
        kind: resForm.kind,
        roomTypeId: room?.id ?? null,
        roomTypeName: room?.name ?? null,
        ratePlanId: plan?.id ?? null,
        ratePlanName: plan?.name ?? null,
        totalAmount: Number(resForm.totalAmount) || 0,
        specialRequest: resForm.specialRequest || null,
        internalNote: resForm.internalNote || null,
      });
      if (!result.ok) {
        setResError(result.error);
        return;
      }
      toast.push({
        tone: 'success',
        title: `${result.data.code} submitted to the front office`,
        body: 'You will see their decision on this lead.',
      });
      setPanel('none');
      router.refresh();
    });
  }

  /* --------------------------------- stage --------------------------------- */

  const [lostReason, setLostReason] = useState<string>(LOST_REASONS[0]);
  const [lostCompetitor, setLostCompetitor] = useState('');
  const [lostNotes, setLostNotes] = useState('');
  const [stageError, setStageError] = useState<string | null>(null);

  function closeAsLost() {
    setStageError(null);
    startTransition(async () => {
      const result = await changeStageAction(lead.id, 'lost', {
        lostReason,
        lostCompetitor: lostCompetitor || undefined,
        lostNotes: lostNotes || undefined,
      });
      if (!result.ok) {
        setStageError(result.error);
        return;
      }
      setClosing(false);
      toast.push({ tone: 'info', title: 'Lead closed as lost', body: lostReason });
      router.refresh();
    });
  }

  function assign(userId: string) {
    startTransition(async () => {
      const result = await assignLeadAction(lead.id, userId || null);
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not assign', body: result.error });
        return;
      }
      toast.push({ tone: 'success', title: 'Owner updated' });
      router.refresh();
    });
  }

  /* --------------------------------- actions --------------------------------- */

  const primary = primaryActionFor(lead.stage, lead.status);
  const isClosed = lead.status !== 'open';

  /*
   * Actions live in the page header, one primary and a short row of secondary
   * ones, with the destructive action tucked into an overflow menu. Owner and
   * stage are properties of the lead, not actions, so they live in the details
   * panel instead of competing with buttons here.
   */
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {!isClosed && primary === 'availability' && canSearch ? (
          <Button variant="primary" onClick={() => setPanel('availability')} icon={<BedDouble aria-hidden className="size-4" />}>
            Check availability
          </Button>
        ) : null}
        {!isClosed && primary === 'quote' && canQuote ? (
          <Button variant="primary" onClick={() => setPanel('quote')} icon={<FileText aria-hidden className="size-4" />}>
            Build quotation
          </Button>
        ) : null}
        {!isClosed && primary === 'reserve' && canRequestReservation ? (
          <Button variant="primary" onClick={() => setPanel('reservation')} icon={<CalendarCheck aria-hidden className="size-4" />}>
            Request reservation
          </Button>
        ) : null}
        {!isClosed && primary === 'assign' && canWrite ? (
          <Button variant="primary" onClick={() => assign(currentUserId)} loading={pending} icon={<UserPlus aria-hidden className="size-4" />}>
            Claim this lead
          </Button>
        ) : null}

        {canSearch && primary !== 'availability' && !isClosed ? (
          <Button variant="secondary" onClick={() => setPanel('availability')} icon={<BedDouble aria-hidden className="size-4" />}>
            <span className="max-sm:sr-only">Availability</span>
          </Button>
        ) : null}
        {canQuote && primary !== 'quote' && !isClosed ? (
          <Button variant="secondary" onClick={() => setPanel('quote')} icon={<FileText aria-hidden className="size-4" />}>
            <span className="max-sm:sr-only">Quotation</span>
          </Button>
        ) : null}
        {canRequestReservation && primary !== 'reserve' && !isClosed ? (
          <Button variant="secondary" onClick={() => setPanel('reservation')} icon={<CalendarCheck aria-hidden className="size-4" />}>
            <span className="max-sm:sr-only">Handoff</span>
          </Button>
        ) : null}

        {canWrite && !isClosed ? (
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="More lead actions"
            >
              <MoreHorizontal aria-hidden className="size-4" />
            </Button>
            {menuOpen ? (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                <div role="menu" className="rise-in absolute right-0 top-[calc(100%+6px)] z-50 w-56 overflow-hidden rounded-xl border border-border bg-surface-3 p-1.5 shadow-e3">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setClosing(true);
                    }}
                    className="focus-ring flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-danger-ink hover:bg-danger-soft"
                  >
                    <XCircle aria-hidden className="size-4" />
                    Close as lost
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {stageError ? <InlineError message={stageError} /> : null}

      {/* ------------------------------- availability ------------------------------- */}
      <Drawer
        open={panel === 'availability'}
        onClose={() => setPanel('none')}
        title="Availability search"
        description={`${lead.propertyName} · results always show their source and check time.`}
        width="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPanel('none')}>Close</Button>
            <Button variant="primary" onClick={runSearch} loading={searching} icon={<Search aria-hidden className="size-4" />}>
              Search PMS
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Check-in" htmlFor="av-in" required>
              <Input id="av-in" type="date" value={availForm.checkIn} onChange={(e) => setAvailForm({ ...availForm, checkIn: e.target.value })} />
            </Field>
            <Field label="Check-out" htmlFor="av-out" required>
              <Input id="av-out" type="date" value={availForm.checkOut} onChange={(e) => setAvailForm({ ...availForm, checkOut: e.target.value })} />
            </Field>
            <Field label="Rooms" htmlFor="av-rooms" required>
              <Input id="av-rooms" type="number" min={1} value={availForm.rooms} onChange={(e) => setAvailForm({ ...availForm, rooms: Number(e.target.value) })} />
            </Field>
            <Field label="Adults" htmlFor="av-adults" required>
              <Input id="av-adults" type="number" min={1} value={availForm.adults} onChange={(e) => setAvailForm({ ...availForm, adults: Number(e.target.value) })} />
            </Field>
            <Field label="Children" htmlFor="av-children">
              <Input id="av-children" type="number" min={0} value={availForm.children} onChange={(e) => setAvailForm({ ...availForm, children: Number(e.target.value) })} />
            </Field>
            <Field
              label="Sandbox response"
              htmlFor="av-sim"
              hint="Sandbox adapter only, for exercising the failure paths the PRD requires."
            >
              <Select id="av-sim" value={availForm.simulate} onChange={(e) => setAvailForm({ ...availForm, simulate: e.target.value as typeof availForm.simulate })}>
                <option value="ok">Normal response</option>
                <option value="timeout">PMS timeout</option>
                <option value="sold_out">Sold out</option>
                <option value="error">PMS error</option>
              </Select>
            </Field>
          </div>

          {availError ? <InlineError message={availError} /> : null}

          {availResult && !availResult.ok ? (
            <div className="space-y-3">
              <div role="alert" className="rounded-md border border-danger-ink/35 bg-danger-soft p-3">
                <p className="flex items-center gap-2 text-[13px] font-medium text-danger-ink">
                  <TriangleAlert aria-hidden className="size-4" />
                  {availResult.kind === 'unavailable' ? 'No inventory for these dates' : 'The PMS could not answer'}
                </p>
                <p className="mt-1 text-[12px] leading-5 text-danger-ink/90">{availResult.message}</p>
                <p className="mt-1.5 text-[12px] leading-5 text-ink-2">{availResult.recovery}</p>
                <p className="mt-2 font-mono text-[10px] text-ink-3">
                  {availResult.sourceLabel} · attempted {relativeTime(availResult.checkedAt.getTime())}
                </p>
              </div>

              {availResult.lastKnown ? (
                <div className="rounded-md border border-warning-ink/35 bg-surface-inset p-3">
                  <p className="flex items-center gap-2 text-[12px] font-medium text-warning-ink">
                    <StatusBadge status="stale" />
                  </p>
                  <p className="mt-1.5 text-[12px] leading-5 text-ink-2">
                    Last successful check {relativeTime(availResult.lastKnown.checkedAt.getTime())} via{' '}
                    {availResult.lastKnown.sourceLabel}. Do not quote from this without a fresh check.
                  </p>
                  <OfferTable
                    rows={availResult.lastKnown.rows}
                    locale={locale}
                    nights={nights}
                    onUse={null}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {availResult?.ok ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[11px] text-ink-3">
                  {availResult.sourceLabel} · checked {relativeTime(availResult.checkedAt.getTime())} · {availResult.latencyMs}ms
                </p>
                <StatusBadge status={availResult.stale ? 'stale' : 'live'} />
              </div>
              <OfferTable
                rows={availResult.rows}
                locale={locale}
                nights={nights}
                onUse={canQuote ? addLineFromOffer : null}
              />
            </div>
          ) : null}

          {!availResult && !availError ? (
            <p className="rounded-md bg-surface-inset px-3 py-6 text-center text-[12px] text-ink-3">
              Run a search to see sellable rooms, live rates, and restrictions for this stay.
            </p>
          ) : null}
        </div>
      </Drawer>

      {/* --------------------------------- quotation --------------------------------- */}
      <Drawer
        open={panel === 'quote'}
        onClose={() => setPanel('none')}
        title="Quotation builder"
        description={`${nights} night${nights === 1 ? '' : 's'} · service ${defaults.servicePercent}% · tax ${defaults.taxPercent}%`}
        width="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPanel('none')}>Cancel</Button>
            <Button variant="secondary" onClick={() => saveQuote(false)} loading={pending}>
              Save draft
            </Button>
            <Button
              variant="primary"
              onClick={() => saveQuote(true)}
              loading={pending}
              disabled={overLimit}
              title={overLimit ? 'Above your discount limit, so it must be approved first' : undefined}
              icon={<Send aria-hidden className="size-4" />}
            >
              {overLimit ? 'Submit for approval' : 'Save and send'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {quoteError ? <InlineError message={quoteError} /> : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-ink">Room lines</h3>
              <Button variant="ghost" size="sm" onClick={addBlankLine} icon={<Plus aria-hidden className="size-3.5" />}>
                Add line
              </Button>
            </div>

            {lines.length === 0 ? (
              <p className="rounded-md bg-surface-inset px-3 py-5 text-center text-[12px] text-ink-3">
                No lines yet. Add one manually, or pick a rate from an availability result so the quote carries its
                source and check time.
              </p>
            ) : (
              <ul className="space-y-2">
                {lines.map((line, index) => (
                  <li key={line.key} className="rounded-md border border-border bg-surface-inset p-3">
                    <div className="grid gap-3 sm:grid-cols-[1.4fr_1.4fr_0.6fr_1fr_auto]">
                      <Field label="Room type" htmlFor={`line-room-${index}`}>
                        <Select
                          id={`line-room-${index}`}
                          value={line.roomTypeId ?? ''}
                          onChange={(e) => {
                            const room = roomTypes.find((r) => r.id === e.target.value);
                            setLines((prev) => prev.map((l, i) => (i === index ? { ...l, roomTypeId: room?.id ?? null, roomTypeName: room?.name ?? l.roomTypeName } : l)));
                          }}
                        >
                          {roomTypes.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Rate plan" htmlFor={`line-plan-${index}`}>
                        <Select
                          id={`line-plan-${index}`}
                          value={line.ratePlanId ?? ''}
                          onChange={(e) => {
                            const plan = ratePlans.find((r) => r.id === e.target.value);
                            setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ratePlanId: plan?.id ?? null, ratePlanName: plan?.name ?? l.ratePlanName, inclusions: plan?.inclusions ?? l.inclusions } : l)));
                            if (index === 0) adoptPolicies(plan?.id ?? null);
                          }}
                        >
                          {ratePlans.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Rooms" htmlFor={`line-rooms-${index}`}>
                        <Input
                          id={`line-rooms-${index}`} type="number" min={1} value={line.rooms}
                          onChange={(e) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, rooms: Number(e.target.value) } : l)))}
                        />
                      </Field>
                      <Field
                        label="Rate / night"
                        htmlFor={`line-rate-${index}`}
                        hint={formatMoney(line.ratePerNight, lead.currency, locale)}
                      >
                        <Input
                          id={`line-rate-${index}`} type="number" min={0} step={50000} value={line.ratePerNight}
                          onChange={(e) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ratePerNight: Number(e.target.value) } : l)))}
                        />
                      </Field>
                      <div className="flex items-end">
                        <Button
                          variant="ghost" size="icon"
                          aria-label={`Remove ${line.roomTypeName} line`}
                          onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="mt-2 tnum font-mono text-[11px] text-ink-3">
                      {line.rooms} × {nights} nights ={' '}
                      {formatMoney(line.rooms * line.ratePerNight * nights, lead.currency, locale)}
                      {line.inclusions.length ? ` · ${line.inclusions.join(', ')}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Discount type" htmlFor="q-dtype">
              <Select id="q-dtype" value={discountType} onChange={(e) => setDiscountType(e.target.value as typeof discountType)}>
                <option value="none">No discount</option>
                <option value="percent">Percentage</option>
                <option value="amount">Fixed amount</option>
              </Select>
            </Field>
            <Field
              label={discountType === 'amount' ? 'Discount amount' : 'Discount %'}
              htmlFor="q-dval"
              hint={`Your limit is ${discountLimitPercent}%`}
              error={overLimit ? `${pricing.discountPercentEffective}% needs manager approval before it can be sent.` : undefined}
            >
              <Input
                id="q-dval" type="number" min={0} value={discountValue}
                disabled={discountType === 'none'}
                onChange={(e) => setDiscountValue(Number(e.target.value))}
                aria-invalid={overLimit}
              />
            </Field>
            <Field label="Valid for (hours)" htmlFor="q-validity" hint="Expiry is enforced server-side.">
              <Input id="q-validity" type="number" min={1} max={720} value={validityHours} onChange={(e) => setValidityHours(Number(e.target.value))} />
            </Field>
          </div>

          {/* Pricing preview uses the same function the server uses to price it. */}
          <div className="rounded-md border border-border bg-surface-inset p-3">
            <h3 className="text-[12px] font-semibold text-ink">Pricing</h3>
            <dl className="mt-2 space-y-1.5">
              {[
                ['Subtotal', pricing.subtotal],
                ['Discount', -pricing.discountAmount],
                ['Net', pricing.netAmount],
                [`Service ${defaults.servicePercent}%`, pricing.serviceAmount],
                [`Tax ${defaults.taxPercent}%`, pricing.taxAmount],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between text-[12px]">
                  <dt className="text-ink-3">{label}</dt>
                  <dd className="tnum font-mono text-ink-2">{formatMoney(Number(value), lead.currency, locale)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1.5 text-[13px] font-medium">
                <dt className="text-ink">Total</dt>
                <dd className="tnum font-mono text-ink">{formatMoney(pricing.total, lead.currency, locale)}</dd>
              </div>
            </dl>
            {overLimit ? (
              <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning-soft px-2 py-1.5 text-[11px] leading-4 text-warning-ink">
                <ShieldAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                Saving this creates an approval request. It cannot be sent to the guest until a manager approves it.
              </p>
            ) : null}
          </div>

          <Field label="Policies shown to the guest" htmlFor="q-policies">
            <Textarea
              id="q-policies"
              value={quotePolicies}
              onChange={(e) => {
                setPoliciesEdited(true);
                setQuotePolicies(e.target.value);
              }}
              rows={2}
            />
          </Field>
          <Field label="Internal notes" htmlFor="q-notes" hint="Stored on the version; not sent to the guest.">
            <Textarea id="q-notes" value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} rows={2} />
          </Field>
        </div>
      </Drawer>

      {/* ------------------------------- reservation ------------------------------- */}
      <Drawer
        open={panel === 'reservation'}
        onClose={() => setPanel('none')}
        title="Reservation handoff"
        description="The front office receives a structured request, not a chat transcript."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPanel('none')}>Cancel</Button>
            <Button variant="primary" onClick={submitReservation} loading={pending} icon={<Send aria-hidden className="size-4" />}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {resError ? <InlineError message={resError} /> : null}

          <Field label="Request type" htmlFor="r-kind" hint="A hold reserves inventory temporarily; a reservation asks for confirmation.">
            <Select id="r-kind" value={resForm.kind} onChange={(e) => setResForm({ ...resForm, kind: e.target.value as 'hold' | 'reservation' })}>
              <option value="reservation">Reservation</option>
              <option value="hold">Hold (24 hours)</option>
            </Select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Room type" htmlFor="r-room" required>
              <Select id="r-room" value={resForm.roomTypeId} onChange={(e) => setResForm({ ...resForm, roomTypeId: e.target.value })}>
                {roomTypes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Rate plan" htmlFor="r-plan" required>
              <Select id="r-plan" value={resForm.ratePlanId} onChange={(e) => setResForm({ ...resForm, ratePlanId: e.target.value })}>
                {ratePlans.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Total amount"
            htmlFor="r-total"
            required
            hint={latestQuote ? `Prefilled from ${latestQuote.code} v${latestQuote.version}.` : 'No quotation yet, so enter the agreed total.'}
          >
            <Input
              id="r-total" type="number" min={0} value={resForm.totalAmount}
              onChange={(e) => setResForm({ ...resForm, totalAmount: Number(e.target.value) })}
            />
          </Field>

          <Field label="Special request" htmlFor="r-special" hint="Anything the front office must honour on arrival.">
            <Textarea id="r-special" rows={2} value={resForm.specialRequest} onChange={(e) => setResForm({ ...resForm, specialRequest: e.target.value })} />
          </Field>

          <Field label="Internal note to the front office" htmlFor="r-note">
            <Textarea id="r-note" rows={2} value={resForm.internalNote} onChange={(e) => setResForm({ ...resForm, internalNote: e.target.value })} />
          </Field>

          <p className="rounded-md bg-surface-inset px-3 py-2 text-[11px] leading-4 text-ink-3">
            Guest name, stay dates, occupancy, and contact details are taken from the lead. If any are missing the
            request will be rejected with the exact list, rather than reaching the queue incomplete.
          </p>
        </div>
      </Drawer>

      {/* Destructive/closing action gets an explicit confirmation with a reason. */}
      <Modal
        open={closing}
        onClose={() => setClosing(false)}
        title="Close this lead as lost"
        description="A lost reason is mandatory. This closes open tasks and stops follow-up reminders."
        tone="danger"
        footer={
          <>
            <Button variant="ghost" onClick={() => setClosing(false)}>Keep working it</Button>
            <Button variant="danger" onClick={closeAsLost} loading={pending}>
              Close as lost
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {stageError ? <InlineError message={stageError} /> : null}
          <Field label="Reason" htmlFor="lost-reason" required>
            <Select id="lost-reason" value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Competitor" htmlFor="lost-competitor" hint="Optional, helps rate benchmarking.">
            <Input id="lost-competitor" value={lostCompetitor} onChange={(e) => setLostCompetitor(e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="lost-notes">
            <Textarea id="lost-notes" rows={2} value={lostNotes} onChange={(e) => setLostNotes(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

function primaryActionFor(stage: string, status: string) {
  if (status !== 'open') return 'none';
  switch (stage) {
    case 'new_inquiry': return 'assign';
    case 'assigned':
    case 'qualified': return 'availability';
    case 'availability_checked': return 'quote';
    case 'quotation_sent':
    case 'follow_up': return 'reserve';
    default: return 'none';
  }
}

function OfferTable({
  rows, locale, nights, onUse,
}: {
  rows: AvailabilityRow[];
  locale: string;
  nights: number;
  onUse: ((row: AvailabilityRow) => void) | null;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] text-left text-[12px]">
        <caption className="sr-only">Available rooms and rates</caption>
        <thead>
          <tr className="bg-surface-2">
            <th scope="col" className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-3">Room type</th>
            <th scope="col" className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-3">Rate plan</th>
            <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-3">Left</th>
            <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-3">Per night</th>
            <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-3">{nights}N total</th>
            <th scope="col" className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-3">State</th>
            {onUse ? <th scope="col" className="px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.roomTypeName}-${row.ratePlanName}-${i}`} className="border-t border-border/70">
              <td className="px-3 py-2 text-ink">{row.roomTypeName}</td>
              <td className="px-3 py-2 text-ink-2">
                {row.ratePlanName}
                {row.restrictions.length ? (
                  <span className="mt-0.5 block text-[10px] text-warning-ink">{row.restrictions.join(' · ')}</span>
                ) : null}
              </td>
              <td className={cn('tnum px-3 py-2 text-right', row.sellableQty === 0 ? 'text-danger-ink' : 'text-ink-2')}>
                {row.sellableQty}
              </td>
              <td className="tnum px-3 py-2 text-right font-mono text-ink">
                {formatMoney(row.ratePerNight, row.currency, locale)}
              </td>
              <td className="tnum px-3 py-2 text-right font-mono text-ink-2">
                {formatMoney(row.totalForStay, row.currency, locale)}
              </td>
              <td className="px-3 py-2"><StatusBadge status={row.state} short /></td>
              {onUse ? (
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={row.sellableQty === 0 || row.state === 'stale'}
                    onClick={() => onUse(row)}
                    title={row.state === 'stale' ? 'Recheck before quoting from this rate' : undefined}
                  >
                    Use in quote
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
