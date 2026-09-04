import Link from 'next/link';
import { Lock } from 'lucide-react';

/** Rendered by `forbidden()` when a server guard blocks a page. */
export default function Forbidden() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning-ink">
        <Lock aria-hidden className="size-5" />
      </span>
      <div className="max-w-sm space-y-1.5">
        <h1 className="t-title">You do not have access to this page</h1>
        <p className="text-[13px] leading-6 text-ink-2">
          Your role does not include the permission this page requires. The attempt has been recorded in the audit
          log. Ask an administrator if you need access.
        </p>
      </div>
      <Link href="/" className="focus-ring tap text-[13px] font-medium text-primary-ink hover:underline">
        Back to My Day
      </Link>
    </div>
  );
}
