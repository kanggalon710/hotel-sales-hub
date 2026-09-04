import type { Metadata } from 'next';
import { List } from 'lucide-react';
import { getPropertyScope, leadVisibility, requireSession } from '@/server/context';
import { listLeads, type LeadRow } from '@/server/queries/leads';
import { defaultTemplate, listTemplates } from '@/server/services/pipelines';
import { STAGE_KIND_MEANING } from '@/lib/pipeline';
import { PageShell } from '@/components/page-header';
import { LinkButton } from '@/components/ui/button';
import { PermissionDenied } from '@/components/ui/states';
import { PipelineBoard, type BoardColumn } from '@/components/pipeline/board';
import { formatMoney } from '@/lib/utils';
import { requestNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'Pipeline' };
export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const session = await requireSession();
  const scope = await getPropertyScope(session);

  if (leadVisibility(session) === 'none') {
    return (
      <PageShell>
        <PermissionDenied what="the pipeline" />
      </PageShell>
    );
  }

  // Columns come from the configured pipeline, so renaming a stage in settings
  // renames the column here without any code change.
  const templates = listTemplates(session.user.organizationId);
  const template = defaultTemplate(session.user.organizationId);
  const boardStages = (template?.stages ?? []).filter((s) => s.kind === 'open' || s.kind === 'won');

  const all = listLeads(session, scope, { status: 'open', limit: 400, sort: 'value' });
  const byStage = new Map<string, LeadRow[]>();
  for (const stage of boardStages) byStage.set(stage.key, []);
  for (const lead of all) byStage.get(lead.stage)?.push(lead);

  const columns: BoardColumn[] = boardStages.map((stage) => {
    const leads = byStage.get(stage.key) ?? [];
    return {
      key: stage.key,
      label: stage.label,
      probability: stage.probability,
      colour: stage.colour,
      meaning: stage.meaning ?? STAGE_KIND_MEANING[stage.kind],
      leads,
      value: leads.reduce((sum, l) => sum + l.estimatedValue, 0),
    };
  });

  const now = requestNow();
  const locale = session.organization.locale;
  const currency = session.organization.currency;
  const total = all.reduce((sum, l) => sum + l.estimatedValue, 0);
  const weighted = all.reduce((sum, l) => sum + (l.estimatedValue * l.probability) / 100, 0);

  /*
   * The board is the page. The header is one compact line so the stages start
   * near the top of the viewport instead of below a block of prose.
   */
  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-none flex-col px-4 pb-4 pt-4 sm:px-6 lg:px-8">
      <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="t-title">Pipeline</h1>
          <p className="t-meta tnum">
            <span className="font-medium text-ink">{all.length}</span> open
            <span className="mx-1.5 text-border-strong">·</span>
            <span className="font-mono font-medium text-ink">{formatMoney(total, currency, locale, { compact: true })}</span>
            <span className="mx-1.5 text-border-strong">·</span>
            weighted <span className="font-mono font-medium text-ink">{formatMoney(weighted, currency, locale, { compact: true })}</span>
            {scope.isAllView ? (
              <span className="hidden sm:inline">
                <span className="mx-1.5 text-border-strong">·</span>
                {scope.permittedIds.length} properties
              </span>
            ) : null}
            {template ? (
              <span className="hidden md:inline">
                <span className="mx-1.5 text-border-strong">·</span>
                {template.name}
                {templates.length > 1 ? ` of ${templates.length} pipelines` : ''}
              </span>
            ) : null}
          </p>
        </div>
        <LinkButton href="/leads" size="sm" icon={<List aria-hidden className="size-4" />}>List view</LinkButton>
      </header>

      <PipelineBoard columns={columns} locale={locale} currency={currency} showProperty={scope.isAllView} now={now} />
    </div>
  );
}
