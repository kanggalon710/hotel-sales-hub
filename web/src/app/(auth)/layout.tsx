import Link from 'next/link';
import { BedDouble, MessagesSquare, ShieldCheck, Zap } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const PILLARS = [
  { icon: MessagesSquare, title: 'Conversation in context', body: 'Chatwoot keeps the conversation. The CRM keeps the deal, and shows both in one place.' },
  { icon: Zap, title: 'Next action first', body: 'Every lead states what to do next, with the SLA clock running in the open.' },
  { icon: ShieldCheck, title: 'Traceable by default', body: 'Rates, holds, and confirmations carry an actor, a source, and a timestamp.' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.05fr_minmax(420px,0.95fr)]">
      {/* Brand panel, hidden on small screens where the form is the whole job. */}
      <aside className="relative hidden overflow-hidden border-r border-border bg-bg-elevated lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(900px 480px at 12% -8%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 62%),' +
              'radial-gradient(700px 420px at 92% 108%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%)',
          }}
        />
        <div className="relative">
          <Link href="/" className="focus-ring inline-flex items-center gap-2.5 rounded-md">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-on-primary shadow-e2">
              <BedDouble aria-hidden className="size-5" />
            </span>
            <span className="t-heading">Hotel Sales Hub</span>
          </Link>
        </div>

        <div className="relative max-w-lg">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">
            Sales &amp; Guest Relationship Hub
          </p>
          <h1 className="mt-4 text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.025em]">
            Every inquiry becomes a room night, or an answer why not.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-ink-2">
            One operating surface across conversations, availability, quotations, and the front-office handoff.
          </p>

          <ul className="mt-9 space-y-5">
            {PILLARS.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-primary-ink ring-1 ring-inset ring-border">
                  <p.icon aria-hidden className="size-4" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-ink">{p.title}</p>
                  <p className="mt-0.5 max-w-sm text-[13px] leading-5 text-ink-2">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative font-mono text-[11px] text-ink-3">
          Chatwoot owns conversations · PMS/CRS owns inventory · CRM owns the sale
        </p>
      </aside>

      <main id="main" className="relative flex flex-col justify-center bg-bg px-5 py-10 sm:px-10">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-[26rem]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
              <BedDouble aria-hidden className="size-4" />
            </span>
            <span className="t-heading">Hotel Sales Hub</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
