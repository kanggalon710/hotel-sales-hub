import {
  BedDouble, CalendarCheck, Check, FileText, MessageSquare, Pencil, ShieldAlert,
  StickyNote, UserPlus, Wallet, Zap,
} from 'lucide-react';
import { cn, formatDateTime, relativeTime } from '@/lib/utils';

export type TimelineItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  actorName: string | null;
  actorType: string;
  source: string;
  createdAt: number;
};

const ICONS: Record<string, React.ReactNode> = {
  lead_created: <Zap aria-hidden className="size-3" />,
  note: <StickyNote aria-hidden className="size-3" />,
  stage_changed: <Check aria-hidden className="size-3" />,
  lead_assigned: <UserPlus aria-hidden className="size-3" />,
  qualification_updated: <Pencil aria-hidden className="size-3" />,
  availability_searched: <BedDouble aria-hidden className="size-3" />,
  quotation_created: <FileText aria-hidden className="size-3" />,
  quotation_submitted: <ShieldAlert aria-hidden className="size-3" />,
  quotation_sent: <FileText aria-hidden className="size-3" />,
  reservation_requested: <CalendarCheck aria-hidden className="size-3" />,
  reservation_confirmed: <CalendarCheck aria-hidden className="size-3" />,
  deposit_updated: <Wallet aria-hidden className="size-3" />,
  first_response: <MessageSquare aria-hidden className="size-3" />,
};

const SOURCE_TONE: Record<string, string> = {
  chatwoot: 'bg-accent-soft text-accent-ink',
  pms: 'bg-success-soft text-success-ink',
  system: 'bg-neutral-soft text-ink-3',
  crm: 'bg-primary-soft text-primary-ink',
};

export function ActivityTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-[12px] text-ink-3">No activity recorded yet.</p>;
  }
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span
            aria-hidden
            className={cn(
              'absolute -left-[27px] flex size-4 items-center justify-center rounded-full ring-2 ring-[var(--surface)]',
              SOURCE_TONE[item.source] ?? SOURCE_TONE.crm,
            )}
          >
            {ICONS[item.type] ?? <Check aria-hidden className="size-3" />}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">{item.title}</p>
            {item.body ? <p className="mt-0.5 text-[12px] leading-5 text-ink-2">{item.body}</p> : null}
            <p className="mt-1 font-mono text-[10px] text-ink-3">
              <time dateTime={new Date(item.createdAt).toISOString()} title={formatDateTime(item.createdAt)}>
                {relativeTime(item.createdAt)}
              </time>
              {' · '}
              {item.actorName ?? (item.actorType === 'system' ? 'system' : 'unknown')}
              {' · via '}
              {item.source}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
