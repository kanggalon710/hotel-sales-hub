'use client';

import { useState } from 'react';
import { Search, TriangleAlert } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/badge';
import { InlineError, ListState } from '@/components/ui/states';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table';
import { searchAvailabilityAction } from '@/server/actions/commercial';
import { cn, formatMoney, nightsBetween, relativeTime } from '@/lib/utils';
import type { AvailabilityOutcome } from '@/server/services/availability';

export function AvailabilitySearchPanel({
  properties,
  defaultPropertyId,
  defaults,
}: {
  properties: { id: string; name: string; code: string }[];
  defaultPropertyId: string;
  defaults: { checkIn: string; checkOut: string; locale: string };
}) {
  const [form, setForm] = useState({
    propertyId: defaultPropertyId,
    checkIn: defaults.checkIn,
    checkOut: defaults.checkOut,
    rooms: 1,
    adults: 2,
    children: 0,
    simulate: 'ok' as 'ok' | 'timeout' | 'sold_out' | 'error',
  });
  const [result, setResult] = useState<AvailabilityOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nights = nightsBetween(form.checkIn, form.checkOut);
  const locale = defaults.locale;

  async function run() {
    setLoading(true);
    setError(null);
    const res = await searchAvailabilityAction({
      propertyId: form.propertyId,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      rooms: form.rooms,
      adults: form.adults,
      children: form.children,
      simulate: form.simulate,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      setResult(null);
      return;
    }
    setResult(res.data);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Search criteria" subtitle={nights > 0 ? `${nights} night${nights === 1 ? '' : 's'}` : 'Pick a valid date range'} />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Property" htmlFor="a-prop" required>
              <Select id="a-prop" value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Check-in" htmlFor="a-in" required>
              <Input id="a-in" type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
            </Field>
            <Field label="Check-out" htmlFor="a-out" required>
              <Input id="a-out" type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
            </Field>
            <Field label="Rooms" htmlFor="a-rooms" required>
              <Input id="a-rooms" type="number" min={1} value={form.rooms} onChange={(e) => setForm({ ...form, rooms: Number(e.target.value) })} />
            </Field>
            <Field label="Adults" htmlFor="a-adults" required>
              <Input id="a-adults" type="number" min={1} value={form.adults} onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })} />
            </Field>
            <Field label="Children" htmlFor="a-children">
              <Input id="a-children" type="number" min={0} value={form.children} onChange={(e) => setForm({ ...form, children: Number(e.target.value) })} />
            </Field>
            <Field label="Sandbox response" htmlFor="a-sim" hint="Sandbox adapter only.">
              <Select id="a-sim" value={form.simulate} onChange={(e) => setForm({ ...form, simulate: e.target.value as typeof form.simulate })}>
                <option value="ok">Normal response</option>
                <option value="timeout">PMS timeout</option>
                <option value="sold_out">Sold out</option>
                <option value="error">PMS error</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button variant="primary" onClick={run} loading={loading} className="w-full" icon={<Search aria-hidden className="size-4" />}>
                Search
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {error ? <InlineError message={error} /> : null}

      {result && !result.ok ? (
        <div className="space-y-4">
          <Card className="border-danger-ink/35">
            <CardBody>
              <p className="flex items-center gap-2 text-[13px] font-medium text-danger-ink">
                <TriangleAlert aria-hidden className="size-4" />
                {result.kind === 'unavailable' ? 'No sellable inventory' : 'The PMS could not answer'}
              </p>
              <p className="mt-1.5 text-[13px] leading-5 text-ink-2">{result.message}</p>
              <p className="mt-1 text-[13px] leading-5 text-ink">{result.recovery}</p>
              <p className="mt-2 font-mono text-[10px] text-ink-3">
                {result.sourceLabel} · attempted {relativeTime(result.checkedAt.getTime())}
              </p>
              <div className="mt-3">
                <Button variant="secondary" onClick={run} loading={loading}>Retry search</Button>
              </div>
            </CardBody>
          </Card>

          {result.lastKnown ? (
            <Card className="border-warning-ink/35">
              <CardHeader
                title="Last known result"
                subtitle={`Checked ${relativeTime(result.lastKnown.checkedAt.getTime())} via ${result.lastKnown.sourceLabel}. Do not quote from this without a fresh check.`}
                action={<StatusBadge status="stale" />}
              />
              <OfferTable rows={result.lastKnown.rows} locale={locale} nights={nights} />
            </Card>
          ) : null}
        </div>
      ) : null}

      {result?.ok ? (
        <Card>
          <CardHeader
            title="Results"
            subtitle={`${result.sourceLabel} · checked ${relativeTime(result.checkedAt.getTime())} · ${result.latencyMs}ms`}
            action={<StatusBadge status={result.stale ? 'stale' : 'live'} />}
          />
          <OfferTable rows={result.rows} locale={locale} nights={nights} />
        </Card>
      ) : null}

      {!result && !error ? (
        <Card>
          <ListState
            title="No search yet"
            description="Choose a property and stay dates, then search. Results show sellable quantity, rate plan restrictions, and the exact time the PMS answered."
          />
        </Card>
      ) : null}
    </div>
  );
}

function OfferTable({
  rows,
  locale,
  nights,
}: {
  rows: { roomTypeName: string; ratePlanName: string; sellableQty: number; ratePerNight: number; totalForStay: number; currency: string; restrictions: string[]; inclusions: string[]; state: string }[];
  locale: string;
  nights: number;
}) {
  if (rows.length === 0) {
    return <ListState title="No rooms returned" description="The connector answered but returned no room types for this occupancy." />;
  }
  return (
    <TableScroll>
      <Table>
        <thead>
          <tr>
            <Th>Room type</Th>
            <Th>Rate plan</Th>
            <Th numeric>Available</Th>
            <Th numeric>Per night</Th>
            <Th numeric>{nights}N total</Th>
            <Th>Inclusions</Th>
            <Th>State</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <Tr key={`${r.roomTypeName}-${r.ratePlanName}-${i}`}>
              <Td className="text-ink">{r.roomTypeName}</Td>
              <Td>
                {r.ratePlanName}
                {r.restrictions.length ? (
                  <span className="mt-0.5 block text-[11px] text-warning-ink">{r.restrictions.join(' · ')}</span>
                ) : null}
              </Td>
              <Td numeric className={cn(r.sellableQty === 0 && 'text-danger-ink')}>{r.sellableQty}</Td>
              <Td numeric className="font-mono text-ink">{formatMoney(r.ratePerNight, r.currency, locale)}</Td>
              <Td numeric className="font-mono">{formatMoney(r.totalForStay, r.currency, locale)}</Td>
              <Td className="text-[11px]">{r.inclusions.join(', ') || '–'}</Td>
              <Td><StatusBadge status={r.state} short /></Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableScroll>
  );
}
