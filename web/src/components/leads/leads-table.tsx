import { StatusBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/bits';
import { LiveStayStrip } from '@/components/live-stay-strip';
import { RowLink, Table, TableScroll, Td, Th, Tr } from '@/components/ui/table';
import type { LeadRow } from '@/server/queries/leads';
import { formatMoney, formatStayDate, nightsBetween } from '@/lib/utils';

/**
 * Leads as a table, matching every other list in the product (quotations,
 * reservations, guests, audit). A shared column grid is what makes rows
 * scannable: each value sits under its own header, text is left aligned,
 * money is right aligned, and no column is left holding empty space.
 */
export function LeadsTable({
  leads,
  locale,
  showProperty,
  showOwner,
  now,
}: {
  leads: LeadRow[];
  locale: string;
  showProperty: boolean;
  showOwner: boolean;
  now: number;
}) {
  /*
   * Designed proportions, not content-driven ones. Guest carries a name plus a
   * reference so it gets the most room; Progress reads as a bar and needs the
   * least. Two shapes because the Progress column only exists from 1280px.
   */
  const columns = showOwner
    ? ['24%', '15%', '18%', '10%', '13%', '11%', '9%']
    : ['30%', '20%', '12%', '15%', '13%', '10%'];

  return (
    <TableScroll>
      <Table className="min-w-[860px]" columns={columns}>
        <thead>
          <tr>
            <Th>Guest</Th>
            {showOwner ? <Th>Owner</Th> : null}
            <Th>Stay</Th>
            <Th>Guests</Th>
            <Th>Progress</Th>
            <Th numeric>Value</Th>
            <Th>Stage</Th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const overdue = lead.status === 'open' && lead.nextFollowUpAt != null && lead.nextFollowUpAt < now;
            const slaBreach =
              lead.status === 'open' && !lead.firstRespondedAt && lead.slaDueAt != null && lead.slaDueAt < now;
            const nights = lead.checkIn && lead.checkOut ? nightsBetween(lead.checkIn, lead.checkOut) : 0;

            return (
              <Tr key={lead.id} interactive>
                <Td>
                  <span className="flex items-center gap-2.5">
                    <Avatar name={lead.guestName} size="sm" />
                    <span className="min-w-0">
                      <RowLink href={`/leads/${lead.id}`} className="block truncate text-[13.5px]">
                        {lead.guestName}
                      </RowLink>
                      <span className="t-meta block truncate">
                        <span className="font-mono">{lead.code}</span>
                        {showProperty ? ` · ${lead.propertyCode}` : ''}
                        {lead.guestTier !== 'none' ? (
                          <span className="text-accent-ink"> · {lead.guestTier}</span>
                        ) : null}
                      </span>
                    </span>
                  </span>
                </Td>

                {showOwner ? (
                  <Td>
                    {lead.ownerName ? (
                      <span className="block truncate text-ink-2">{lead.ownerName}</span>
                    ) : (
                      <span className="text-warning-ink">Unassigned</span>
                    )}
                  </Td>
                ) : null}

                <Td>
                  {lead.checkIn && lead.checkOut ? (
                    <>
                      <span className="block whitespace-nowrap text-ink">
                        {formatStayDate(lead.checkIn, locale)} → {formatStayDate(lead.checkOut, locale)}
                      </span>
                      <span className="t-meta block">{nights} night{nights === 1 ? '' : 's'}</span>
                    </>
                  ) : (
                    <span className="text-ink-3">Dates not set</span>
                  )}
                </Td>

                <Td className="truncate whitespace-nowrap">
                  {lead.rooms ?? '–'} rm · {lead.adults ?? 0}A
                  {lead.children ? ` ${lead.children}C` : ''}
                </Td>

                <Td>
                  <LiveStayStrip steps={lead.steps} compact />
                </Td>

                <Td numeric className="whitespace-nowrap font-mono text-ink">
                  {lead.estimatedValue > 0 ? formatMoney(lead.estimatedValue, lead.currency, locale, { compact: true }) : '–'}
                </Td>

                <Td>
                  {slaBreach ? (
                    <span className="t-meta text-danger-ink">Reply overdue</span>
                  ) : overdue ? (
                    <span className="t-meta text-warning-ink">Follow-up overdue</span>
                  ) : (
                    <StatusBadge status={lead.stage} variant="dot" />
                  )}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </TableScroll>
  );
}
