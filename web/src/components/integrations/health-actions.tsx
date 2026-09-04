'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { retryEventsAction, runSyncQueueAction } from '@/server/actions/integrations';

export function HealthActions({
  deadLetterCount,
  pendingOutbound,
}: {
  deadLetterCount: number;
  pendingOutbound: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [retrying, startRetry] = useTransition();
  const [flushing, startFlush] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        loading={flushing}
        icon={<Send aria-hidden className="size-4" />}
        onClick={() =>
          startFlush(async () => {
            const result = await runSyncQueueAction();
            if (!result.ok) {
              toast.push({ tone: 'error', title: 'Could not run the queue', body: result.error });
              return;
            }
            toast.push({
              tone: result.data.failed ? 'warning' : 'success',
              title: `${result.data.delivered} of ${result.data.attempted} delivered`,
              body: result.data.live
                ? 'Sent to the live Chatwoot API.'
                : 'Simulated delivery. Set CHATWOOT_LIVE=1 to call the real API.',
            });
            router.refresh();
          })
        }
      >
        Run outbound queue{pendingOutbound ? ` (${pendingOutbound})` : ''}
      </Button>

      <Button
        variant="primary"
        loading={retrying}
        disabled={deadLetterCount === 0}
        title={deadLetterCount === 0 ? 'Nothing to retry' : undefined}
        icon={<RefreshCw aria-hidden className="size-4" />}
        onClick={() =>
          startRetry(async () => {
            const result = await retryEventsAction();
            if (!result.ok) {
              toast.push({ tone: 'error', title: 'Retry failed', body: result.error });
              return;
            }
            toast.push({
              tone: result.data.recovered ? 'success' : 'warning',
              title: `${result.data.recovered} of ${result.data.attempted} recovered`,
              body: result.data.recovered < result.data.attempted
                ? 'The rest still hit the same cause. Fix the mapping first.'
                : 'All previously failed events are now processed.',
            });
            router.refresh();
          })
        }
      >
        Retry failed{deadLetterCount ? ` (${deadLetterCount})` : ''}
      </Button>
    </div>
  );
}
