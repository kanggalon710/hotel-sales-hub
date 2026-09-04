import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db, properties } from '@/db';
import { requirePermission, requireSession } from '@/server/context';
import { listTemplates } from '@/server/services/pipelines';
import { INQUIRY_TYPES } from '@/lib/constants';
import { PageHeader, PageShell } from '@/components/page-header';
import { PipelineSettings } from '@/components/settings/pipeline-settings';

export const metadata: Metadata = { title: 'Pipelines' };
export const dynamic = 'force-dynamic';

export default async function PipelineSettingsPage() {
  const session = await requireSession();
  requirePermission(session, 'org.manage');
  const orgId = session.user.organizationId;

  const templates = listTemplates(orgId, true);
  const props = db
    .select({ id: properties.id, name: properties.name, code: properties.code, templateId: properties.pipelineTemplateId })
    .from(properties)
    .where(and(eq(properties.organizationId, orgId), eq(properties.active, true)))
    .all();

  return (
    <PageShell narrow>
      <Link href="/settings" className="focus-ring tap inline-flex items-center gap-1.5 rounded text-[12px] text-ink-3 hover:text-ink">
        <ArrowLeft aria-hidden className="size-3.5" />
        Back to settings
      </Link>

      <PageHeader
        title="Pipelines"
        count={`${templates.filter((t) => !t.archivedAt).length} active`}
        description="Each pipeline is a set of stages. Rename, recolour, and reorder them freely; what a stage enforces comes from its kind, so a renamed stage keeps its guarantees."
      />

      <PipelineSettings
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          inquiryType: t.inquiryType,
          isDefault: t.isDefault,
          archived: Boolean(t.archivedAt),
          leadCount: t.leadCount,
          stages: t.stages.map((s) => ({
            id: s.id, key: s.key, label: s.label, kind: s.kind, gates: s.gates,
            colour: s.colour, probability: s.probability, meaning: s.meaning,
          })),
        }))}
        properties={props.map((p) => ({ id: p.id, name: p.name, code: p.code, templateId: p.templateId }))}
        inquiryTypes={INQUIRY_TYPES.map((t) => ({ key: t.key, label: t.label }))}
      />
    </PageShell>
  );
}
