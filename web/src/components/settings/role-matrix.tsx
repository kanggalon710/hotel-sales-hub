import { Fragment } from 'react';
import { Check, Minus } from 'lucide-react';
import { TableScroll } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/** Capability rows mirror the matrix in PRD 9.2, grouped the way admins think. */
const CAPABILITIES: { label: string; permission: string; group: string }[] = [
  { group: 'Administration', label: 'Manage organization', permission: 'org.manage' },
  { group: 'Administration', label: 'Manage property config', permission: 'property.manage' },
  { group: 'Administration', label: 'Invite / deactivate users', permission: 'user.manage' },
  { group: 'Administration', label: 'Manage integrations', permission: 'integration.manage' },
  { group: 'Administration', label: 'View audit log', permission: 'audit.read' },

  { group: 'Sales', label: 'See all property leads', permission: 'lead.read.all' },
  { group: 'Sales', label: 'Create / edit leads', permission: 'lead.write' },
  { group: 'Sales', label: 'Reassign leads', permission: 'lead.reassign' },
  { group: 'Sales', label: 'Search availability', permission: 'availability.search' },
  { group: 'Sales', label: 'Create quotations', permission: 'quotation.create' },
  { group: 'Sales', label: 'Approve discounts', permission: 'discount.approve' },

  { group: 'Reservations', label: 'Request hold / reservation', permission: 'reservation.request' },
  { group: 'Reservations', label: 'Confirm hold / reservation', permission: 'reservation.confirm' },
  { group: 'Reservations', label: 'Read the front-office queue', permission: 'reservation.queue.read' },

  { group: 'Data', label: 'See full guest PII', permission: 'guest.pii.full' },
  { group: 'Data', label: 'Merge contacts', permission: 'contact.merge' },
  { group: 'Data', label: 'Export data', permission: 'data.export' },
  { group: 'Data', label: 'Cross-property reporting', permission: 'report.cross_property' },
];

export function RoleMatrix({
  roles,
}: {
  roles: { key: string; name: string; scope: string; permissions: string[] }[];
}) {
  const groups = [...new Set(CAPABILITIES.map((c) => c.group))];

  return (
    <TableScroll>
      <table className="w-full min-w-[820px] border-collapse text-left">
        <caption className="sr-only">Capabilities granted by each predefined role</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 border-b border-border bg-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Capability
            </th>
            {roles.map((r) => (
              <th
                key={r.key}
                scope="col"
                className="border-b border-border bg-surface-2 px-2 py-2 text-center text-[11px] font-semibold text-ink-2"
              >
                <span className="block">{r.name}</span>
                <span className="mt-0.5 block text-[9px] font-normal uppercase tracking-wide text-ink-3">
                  {r.scope}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={roles.length + 1}
                  className="border-b border-border bg-surface-inset px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3"
                >
                  {group}
                </th>
              </tr>
              {CAPABILITIES.filter((c) => c.group === group).map((cap) => (
                <tr key={cap.permission}>
                  <th scope="row" className="sticky left-0 z-10 border-b border-border/70 bg-surface px-4 py-2 text-left text-[12px] font-normal text-ink-2">
                    {cap.label}
                  </th>
                  {roles.map((r) => {
                    const granted = r.permissions.includes(cap.permission);
                    return (
                      <td key={r.key} className="border-b border-border/70 px-2 py-2 text-center">
                        {/* Icon plus screen-reader text: never a colour-only cell. */}
                        <span
                          className={cn(
                            'inline-flex size-5 items-center justify-center rounded',
                            granted ? 'bg-success-soft text-success-ink' : 'text-ink-3',
                          )}
                        >
                          {granted ? <Check aria-hidden className="size-3.5" /> : <Minus aria-hidden className="size-3.5" />}
                          <span className="sr-only">
                            {r.name} {granted ? 'has' : 'does not have'} {cap.label}
                          </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
