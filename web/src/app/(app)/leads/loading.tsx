import { PageShell } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Skeleton, TableSkeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <PageShell>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-9 w-full" />
      <Card>
        <TableSkeleton rows={8} cols={5} />
      </Card>
    </PageShell>
  );
}
