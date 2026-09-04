'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Ban, Check, Copy, KeyRound, Mail, Pencil, RotateCcw, Send, UserPlus, X,
} from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/bits';
import { Drawer, Modal } from '@/components/ui/overlay';
import { InlineError, ListState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  inviteUserAction, resendInvitationAction, revokeInvitationAction,
  setUserStatusAction, updateUserAccessAction,
} from '@/server/actions/users';

export type UserView = {
  id: string; name: string; email: string; status: string; jobTitle: string | null;
  lastLogin: string; mustChangePassword: boolean;
  discountLimitPercent: number; canApproveDiscountUpToPercent: number;
  roleKey: string; roleName: string; roleScope: string;
  propertyIds: string[]; teamId: string | null; teamNames: string[];
};

export type InviteView = {
  id: string; email: string; name: string; roleName: string;
  invitedBy: string; expiresLabel: string; expiresAt: string; expired: boolean;
};

type RoleOption = { key: string; name: string; scope: string; description: string | null };

export function UserAdmin({
  users, invitations, roles, properties, teams,
  currentUserId, isOrgAdmin, approvalCeiling,
}: {
  users: UserView[];
  invitations: InviteView[];
  roles: RoleOption[];
  properties: { id: string; name: string; code: string }[];
  teams: { id: string; name: string; propertyId: string | null }[];
  currentUserId: string;
  isOrgAdmin: boolean;
  approvalCeiling: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<UserView | null>(null);
  const [confirm, setConfirm] = useState<{ user: UserView; next: 'suspended' | 'deactivated' | 'active' } | null>(null);
  const [inviteLink, setInviteLink] = useState<{ link: string; email: string } | null>(null);
  const [pending, start] = useTransition();

  function copyLink(link: string) {
    const absolute = `${window.location.origin}${link}`;
    navigator.clipboard?.writeText(absolute).then(
      () => toast.push({ tone: 'success', title: 'Invitation link copied' }),
      () => toast.push({ tone: 'error', title: 'Could not copy', body: absolute }),
    );
  }

  function changeStatus(user: UserView, next: 'suspended' | 'deactivated' | 'active') {
    start(async () => {
      const result = await setUserStatusAction(user.id, next);
      setConfirm(null);
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not change the account', body: result.error });
        return;
      }
      toast.push({
        tone: next === 'active' ? 'success' : 'info',
        title: next === 'active' ? `${user.name} reactivated` : `${user.name} ${next}`,
        body: next === 'active' ? undefined : 'All of their sessions have been revoked.',
      });
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardHeader
          title="People"
          subtitle={`${users.filter((u) => u.status === 'active').length} active of ${users.length}`}
          action={
            <Button variant="primary" onClick={() => setInviting(true)} icon={<UserPlus aria-hidden className="size-4" />}>
              Invite user
            </Button>
          }
        />
        <ul className="divide-y divide-border">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar name={u.name} />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-ink">{u.name}</span>
                    <StatusBadge status={u.status} />
                    {u.id === currentUserId ? <Badge tone="primary">You</Badge> : null}
                    {u.mustChangePassword ? <Badge tone="warning">Password change pending</Badge> : null}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-3">{u.email}</p>
                  <p className="mt-1 text-[11px] text-ink-2">
                    {u.roleName}
                    {u.roleScope === 'organization'
                      ? ' · organization-wide'
                      : ` · ${u.propertyIds.length} propert${u.propertyIds.length === 1 ? 'y' : 'ies'}`}
                    {u.teamNames.length ? ` · ${u.teamNames.join(', ')}` : ''}
                    {u.discountLimitPercent > 0 ? ` · can discount to ${u.discountLimitPercent}%` : ''}
                    {u.canApproveDiscountUpToPercent > 0 ? ` · approves to ${u.canApproveDiscountUpToPercent}%` : ''}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-ink-3">last sign-in {u.lastLogin}</p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => setEditing(u)} icon={<Pencil aria-hidden className="size-3.5" />}>
                  Access
                </Button>
                {u.status === 'active' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-warning-ink"
                    disabled={u.id === currentUserId}
                    title={u.id === currentUserId ? 'You cannot suspend your own account' : undefined}
                    onClick={() => setConfirm({ user: u, next: 'suspended' })}
                    icon={<Ban aria-hidden className="size-3.5" />}
                  >
                    Suspend
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-success-ink"
                    onClick={() => changeStatus(u, 'active')}
                    loading={pending}
                    icon={<RotateCcw aria-hidden className="size-3.5" />}
                  >
                    Reactivate
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Pending invitations"
          subtitle="Links expire after seven days. Reissuing invalidates the previous link."
          icon={<Mail aria-hidden className="size-4" />}
        />
        {invitations.length === 0 ? (
          <ListState title="No invitations outstanding" description="Everyone invited has activated their account." />
        ) : (
          <ul className="divide-y divide-border">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] text-ink">{i.name}</span>
                    <Badge tone={i.expired ? 'danger' : 'info'}>{i.expired ? 'Expired' : 'Invited'}</Badge>
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-3">{i.email}</p>
                  <p className="mt-0.5 text-[11px] text-ink-3">
                    {i.roleName} · invited by {i.invitedBy} · expires {i.expiresLabel} ({i.expiresAt})
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={pending}
                    icon={<Send aria-hidden className="size-3.5" />}
                    onClick={() =>
                      start(async () => {
                        const result = await resendInvitationAction(i.id);
                        if (!result.ok) {
                          toast.push({ tone: 'error', title: 'Could not reissue', body: result.error });
                          return;
                        }
                        setInviteLink({ link: result.data.link, email: i.email });
                        router.refresh();
                      })
                    }
                  >
                    Reissue
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger-ink"
                    loading={pending}
                    icon={<X aria-hidden className="size-3.5" />}
                    onClick={() =>
                      start(async () => {
                        const result = await revokeInvitationAction(i.id);
                        if (!result.ok) {
                          toast.push({ tone: 'error', title: 'Could not revoke', body: result.error });
                          return;
                        }
                        toast.push({ tone: 'info', title: `Invitation for ${i.email} revoked` });
                        router.refresh();
                      })
                    }
                  >
                    Revoke
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <InviteDrawer
        open={inviting}
        onClose={() => setInviting(false)}
        roles={roles}
        properties={properties}
        teams={teams}
        isOrgAdmin={isOrgAdmin}
        approvalCeiling={approvalCeiling}
        onInvited={(payload) => {
          setInviting(false);
          setInviteLink(payload);
          router.refresh();
        }}
      />

      <AccessDrawer
        user={editing}
        onClose={() => setEditing(null)}
        roles={roles}
        properties={properties}
        teams={teams}
        isOrgAdmin={isOrgAdmin}
        approvalCeiling={approvalCeiling}
        onSaved={() => {
          setEditing(null);
          toast.push({ tone: 'success', title: 'Access updated', body: 'It applies on their next request.' });
          router.refresh();
        }}
      />

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm ? `Suspend ${confirm.user.name}?` : ''}
        description="They are signed out of every device immediately and cannot sign back in. Their name stays on all historical records."
        tone="danger"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" loading={pending} onClick={() => confirm && changeStatus(confirm.user, confirm.next)}>
              Suspend account
            </Button>
          </>
        }
      />

      <Modal
        open={Boolean(inviteLink)}
        onClose={() => setInviteLink(null)}
        title="Share this invitation link"
        description={inviteLink ? `Send it to ${inviteLink.email}. It is shown once and expires in seven days.` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => inviteLink && copyLink(inviteLink.link)} icon={<Copy aria-hidden className="size-4" />}>
              Copy link
            </Button>
            <Button variant="primary" onClick={() => setInviteLink(null)}>Done</Button>
          </>
        }
      >
        <code className="block break-all rounded-md bg-surface-inset px-3 py-2.5 font-mono text-[12px] text-ink">
          {inviteLink?.link}
        </code>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-ink-3">
          <KeyRound aria-hidden className="mt-px size-3.5 shrink-0" />
          Email delivery is not wired up in this build, so hand the link over directly.
        </p>
      </Modal>
    </>
  );
}

function RoleFields({
  roles, properties, teams, isOrgAdmin, approvalCeiling, defaults, errors, idPrefix,
}: {
  roles: RoleOption[];
  properties: { id: string; name: string; code: string }[];
  teams: { id: string; name: string; propertyId: string | null }[];
  isOrgAdmin: boolean;
  approvalCeiling: number;
  defaults: { roleKey: string; propertyIds: string[]; teamId: string | null; discountLimitPercent: number; canApproveDiscountUpToPercent?: number };
  errors?: Record<string, string>;
  idPrefix: string;
}) {
  const [roleKey, setRoleKey] = useState(defaults.roleKey || 'sales_agent');
  const [selected, setSelected] = useState<string[]>(defaults.propertyIds);
  const role = roles.find((r) => r.key === roleKey);
  const orgScoped = role?.scope === 'organization';
  const available = roles.filter((r) => isOrgAdmin || r.scope === 'property');

  return (
    <div className="space-y-4">
      <Field label="Role" htmlFor={`${idPrefix}-role`} required hint={role?.description ?? undefined} error={errors?.roleKey}>
        <Select id={`${idPrefix}-role`} name="roleKey" value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
          {available.map((r) => (
            <option key={r.key} value={r.key}>{r.name}</option>
          ))}
        </Select>
      </Field>

      {orgScoped ? (
        <p className="rounded-md bg-info-soft px-3 py-2 text-[12px] leading-5 text-info-ink">
          This role is organization-wide: it covers every active property automatically, so no selection is needed.
        </p>
      ) : (
        <fieldset>
          <legend className="text-xs font-medium text-ink-2">
            Properties <span aria-hidden className="text-danger-ink">*</span>
          </legend>
          <p className="mt-0.5 text-[11px] text-ink-3">
            Access is denied on the server for anything outside this list, even with a valid record id.
          </p>
          <div className="mt-2 space-y-0.5 rounded-md border border-border bg-surface-inset p-2">
            {properties.map((p) => (
              <Checkbox
                key={p.id}
                name="propertyIds"
                value={p.id}
                checked={selected.includes(p.id)}
                onChange={(e) =>
                  setSelected((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))
                }
                label={
                  <span>
                    {p.name} <span className="font-mono text-[11px] text-ink-3">{p.code}</span>
                  </span>
                }
              />
            ))}
          </div>
          {errors?.propertyIds ? (
            <p role="alert" className="mt-1 text-[11px] text-danger-ink">{errors.propertyIds}</p>
          ) : null}
        </fieldset>
      )}

      {!orgScoped ? (
        <Field label="Team" htmlFor={`${idPrefix}-team`} hint="Used for team-scoped lead visibility and routing.">
          <Select id={`${idPrefix}-team`} name="teamId" defaultValue={defaults.teamId ?? ''}>
            <option value="">No team</option>
            {teams
              .filter((t) => !t.propertyId || selected.includes(t.propertyId))
              .map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Discount limit %"
          htmlFor={`${idPrefix}-limit`}
          error={errors?.discountLimitPercent}
          hint="Quotations above this go to an approver instead of the guest."
        >
          <Input
            id={`${idPrefix}-limit`}
            name="discountLimitPercent"
            type="number"
            min={0}
            max={approvalCeiling}
            defaultValue={defaults.discountLimitPercent}
          />
        </Field>
        {defaults.canApproveDiscountUpToPercent !== undefined ? (
          <Field
            label="Can approve up to %"
            htmlFor={`${idPrefix}-approve`}
            hint={`Capped by your own authority (${approvalCeiling}%) and by the role.`}
          >
            <Input
              id={`${idPrefix}-approve`}
              name="canApproveDiscountUpToPercent"
              type="number"
              min={0}
              max={approvalCeiling}
              defaultValue={defaults.canApproveDiscountUpToPercent}
            />
          </Field>
        ) : null}
      </div>
    </div>
  );
}

function InviteDrawer({
  open, onClose, roles, properties, teams, isOrgAdmin, approvalCeiling, onInvited,
}: {
  open: boolean;
  onClose: () => void;
  roles: RoleOption[];
  properties: { id: string; name: string; code: string }[];
  teams: { id: string; name: string; propertyId: string | null }[];
  isOrgAdmin: boolean;
  approvalCeiling: number;
  onInvited: (payload: { link: string; email: string }) => void;
}) {
  const [state, action, pending] = useActionState(inviteUserAction, null);
  const errors = state?.ok === false ? state.fieldErrors : undefined;

  if (state?.ok && open && !pending) setTimeout(() => onInvited(state.data), 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Invite a user"
      description="They set their own password on activation. Nothing is granted until they accept."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="invite-form" variant="primary" loading={pending} icon={<UserPlus aria-hidden className="size-4" />}>
            Send invitation
          </Button>
        </>
      }
    >
      <form id="invite-form" action={action} className="space-y-4">
        {state?.ok === false && !state.fieldErrors ? <InlineError message={state.error} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="inv-name" required error={errors?.name}>
            <Input id="inv-name" name="name" data-autofocus required />
          </Field>
          <Field label="Work email" htmlFor="inv-email" required error={errors?.email}>
            <Input id="inv-email" name="email" type="email" autoComplete="off" required />
          </Field>
        </div>

        <RoleFields
          roles={roles}
          properties={properties}
          teams={teams}
          isOrgAdmin={isOrgAdmin}
          approvalCeiling={approvalCeiling}
          defaults={{ roleKey: 'sales_agent', propertyIds: [], teamId: null, discountLimitPercent: 10 }}
          errors={errors}
          idPrefix="inv"
        />
      </form>
    </Drawer>
  );
}

function AccessDrawer({
  user, onClose, roles, properties, teams, isOrgAdmin, approvalCeiling, onSaved,
}: {
  user: UserView | null;
  onClose: () => void;
  roles: RoleOption[];
  properties: { id: string; name: string; code: string }[];
  teams: { id: string; name: string; propertyId: string | null }[];
  isOrgAdmin: boolean;
  approvalCeiling: number;
  onSaved: () => void;
}) {
  const [state, action, pending] = useActionState(updateUserAccessAction, null);
  const errors = state?.ok === false ? state.fieldErrors : undefined;

  if (state?.ok && user && !pending) setTimeout(onSaved, 0);
  if (!user) return null;

  return (
    <Drawer
      open={Boolean(user)}
      onClose={onClose}
      title={`Access for ${user.name}`}
      description="Changes apply on their next request; no sign-out is needed."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="access-form" variant="primary" loading={pending} icon={<Check aria-hidden className="size-4" />}>
            Save access
          </Button>
        </>
      }
    >
      <form id="access-form" key={user.id} action={action} className="space-y-4">
        <input type="hidden" name="userId" value={user.id} />
        {state?.ok === false && !state.fieldErrors ? <InlineError message={state.error} /> : null}

        <div className="rounded-md bg-surface-inset px-3 py-2">
          <p className="text-[13px] text-ink">{user.name}</p>
          <p className="font-mono text-[11px] text-ink-3">{user.email}</p>
        </div>

        <RoleFields
          roles={roles}
          properties={properties}
          teams={teams}
          isOrgAdmin={isOrgAdmin}
          approvalCeiling={approvalCeiling}
          defaults={{
            roleKey: user.roleKey,
            propertyIds: user.propertyIds,
            teamId: user.teamId,
            discountLimitPercent: user.discountLimitPercent,
            canApproveDiscountUpToPercent: user.canApproveDiscountUpToPercent,
          }}
          errors={errors}
          idPrefix="acc"
        />
      </form>
    </Drawer>
  );
}
