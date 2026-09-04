import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, integrationConnections, notifications } from '@/db';
import { requireSession, getPropertyScope } from '@/server/context';
import { visibleNav } from '@/components/app-shell/nav-config';
import { DesktopSidebar, MobileNav } from '@/components/app-shell/sidebar-nav';
import { PropertySwitcher } from '@/components/app-shell/property-switcher';
import { UserMenu } from '@/components/app-shell/user-menu';
import { NotificationsMenu } from '@/components/app-shell/notifications-menu';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ToastProvider } from '@/components/ui/toast';
import { ConnectionPulse } from '@/components/app-shell/connection-pulse';

/**
 * App frame. Sidebar (≥1024px) + a 64px top bar that carries exactly three
 * things: navigation toggle on small screens, the Current Property, and
 * status affordances. Page titles live in the page, not the bar.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const scope = await getPropertyScope(session);
  const groups = visibleNav(session.permissions);

  const unread = db
    .select({
      id: notifications.id, title: notifications.title, body: notifications.body,
      link: notifications.link, severity: notifications.severity, createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(12)
    .all()
    .map((n) => ({ ...n, createdAt: n.createdAt.getTime() }));

  const connections = db
    .select({
      id: integrationConnections.id, provider: integrationConnections.provider,
      label: integrationConnections.label, status: integrationConnections.status,
      lastEventAt: integrationConnections.lastEventAt,
    })
    .from(integrationConnections)
    .where(eq(integrationConnections.organizationId, session.user.organizationId))
    .all()
    .map((c) => ({ ...c, lastEventAt: c.lastEventAt?.getTime() ?? null }));

  const roleSummary = scope.current ? scope.current.roleName : (session.propertyAccess[0]?.roleName ?? 'No property access');
  const userMenu = <UserMenu name={session.user.name} email={session.user.email} roleSummary={roleSummary} />;

  return (
    <ToastProvider>
      <div className="flex min-h-dvh bg-bg">
        <DesktopSidebar groups={groups} footer={userMenu} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
            <MobileNav groups={groups} footer={userMenu} />
            <div className="min-w-0 flex-1">
              <PropertySwitcher
                properties={session.propertyAccess}
                currentId={scope.currentPropertyId}
                allowAll={session.propertyAccess.length > 1}
              />
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <ConnectionPulse connections={connections} canManage={session.permissions.has('integration.manage')} />
              <NotificationsMenu items={unread} />
              <ThemeToggle />
            </div>
          </header>

          <main id="main" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
