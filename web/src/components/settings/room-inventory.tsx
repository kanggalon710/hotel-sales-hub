'use client';

import { useActionState, useState } from 'react';
import { BedDouble, Check, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { InlineError, ListState } from '@/components/ui/states';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table';
import { formatMoney } from '@/lib/utils';
import {
  removeRatePlanAction, removeRoomTypeAction, saveRatePlanAction,
  saveRoomTypeAction, setInventorySourceAction,
} from '@/server/actions/inventory';

export type RoomTypeView = {
  id: string; code: string; name: string; totalRooms: number;
  maxAdults: number; maxChildren: number; bedType: string | null;
  sizeSqm: number | null; description: string | null;
  source: string; active: boolean;
};

export type RatePlanView = {
  id: string; code: string; name: string; mealPlan: string;
  baseRatePerNight: number; refundable: boolean; minStay: number;
  inclusionList: string[]; policies: string | null;
  surcharges: Record<string, number>; source: string; active: boolean;
};

const MEALS = [
  { value: 'room_only', label: 'Kamar saja' },
  { value: 'breakfast', label: 'Termasuk sarapan' },
  { value: 'half_board', label: 'Setengah papan' },
  { value: 'full_board', label: 'Penuh papan' },
];

const MEAL_LABEL: Record<string, string> = Object.fromEntries(MEALS.map((m) => [m.value, m.label]));

export function RoomInventory({
  propertyId, propertyName, inventorySource, currency, locale,
  roomTypes, ratePlans, canEdit,
}: {
  propertyId: string;
  propertyName: string;
  inventorySource: string;
  currency: string;
  locale: string;
  roomTypes: RoomTypeView[];
  ratePlans: RatePlanView[];
  canEdit: boolean;
}) {
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const crmOwned = inventorySource === 'crm';

  return (
    <div className="space-y-4 sm:space-y-8">
      <SourceCard propertyId={propertyId} propertyName={propertyName} source={inventorySource} canEdit={canEdit} />

      <Card>
        <CardHeader
          title="Tipe kamar"
          subtitle={crmOwned
            ? 'Jumlah kamar di sini adalah alotmen yang dipakai untuk menghitung ketersediaan.'
            : 'Dicerminkan dari PMS. Ubah di sistem tersebut, bukan di sini.'}
          icon={<BedDouble aria-hidden className="size-4" />}
          action={canEdit && crmOwned && editingRoom !== 'new' ? (
            <Button size="sm" variant="secondary" icon={<Plus aria-hidden className="size-3.5" />} onClick={() => setEditingRoom('new')}>
              Tambah tipe kamar
            </Button>
          ) : null}
        />
        {editingRoom === 'new' ? (
          <CardBody>
            <RoomForm propertyId={propertyId} onDone={() => setEditingRoom(null)} />
          </CardBody>
        ) : null}

        {roomTypes.length === 0 && editingRoom !== 'new' ? (
          <ListState
            title="Belum ada tipe kamar"
            description="Tanpa tipe kamar, properti ini tidak punya apa pun untuk dijual dan cek ketersediaan akan kosong."
          />
        ) : (
          <TableScroll>
            <Table className="min-w-[820px]" columns={['12%', '26%', '12%', '16%', '16%', '18%']}>
              <thead>
                <tr>
                  <Th>Kode</Th>
                  <Th>Nama</Th>
                  <Th numeric>Alotmen</Th>
                  <Th>Kapasitas</Th>
                  <Th>Ranjang / Luas</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {roomTypes.map((room) => (
                  <Tr key={room.id}>
                    <Td className="font-mono text-[12px] text-ink">{room.code}</Td>
                    <Td className="text-ink">{room.name}</Td>
                    <Td numeric className="text-ink">{room.totalRooms}</Td>
                    <Td>{room.maxAdults} dewasa · {room.maxChildren} anak</Td>
                    <Td className="truncate">{[room.bedType, room.sizeSqm ? `${room.sizeSqm} m²` : null].filter(Boolean).join(' · ') || '–'}</Td>
                    <Td>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={room.active ? 'success' : 'neutral'}>{room.active ? 'Aktif' : 'Nonaktif'}</Badge>
                        {room.source === 'pms' ? <Badge tone="info">PMS</Badge> : null}
                        {canEdit && room.source === 'crm' ? (
                          <Button size="sm" variant="ghost" icon={<Pencil aria-hidden className="size-3.5" />} onClick={() => setEditingRoom(room.id)}>
                            Ubah
                          </Button>
                        ) : null}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        )}

        {editingRoom && editingRoom !== 'new' ? (
          <CardBody>
            <RoomForm
              propertyId={propertyId}
              room={roomTypes.find((r) => r.id === editingRoom)}
              onDone={() => setEditingRoom(null)}
            />
          </CardBody>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Paket tarif"
          subtitle="Tarif dasar berlaku untuk tipe kamar termurah. Tipe lain memakai selisih yang Anda tentukan."
          icon={<Tag aria-hidden className="size-4" />}
          action={canEdit && crmOwned && editingPlan !== 'new' ? (
            <Button size="sm" variant="secondary" icon={<Plus aria-hidden className="size-3.5" />} onClick={() => setEditingPlan('new')}>
              Tambah paket tarif
            </Button>
          ) : null}
        />
        {editingPlan === 'new' ? (
          <CardBody>
            <PlanForm propertyId={propertyId} roomTypes={roomTypes} currency={currency} onDone={() => setEditingPlan(null)} />
          </CardBody>
        ) : null}

        {ratePlans.length === 0 && editingPlan !== 'new' ? (
          <ListState
            title="Belum ada paket tarif"
            description="Tipe kamar tanpa paket tarif tidak punya harga, jadi tidak bisa ditawarkan."
          />
        ) : (
          <TableScroll>
            <Table className="min-w-[860px]" columns={['12%', '24%', '18%', '18%', '12%', '16%']}>
              <thead>
                <tr>
                  <Th>Kode</Th>
                  <Th>Nama</Th>
                  <Th>Makan</Th>
                  <Th numeric>Tarif dasar / malam</Th>
                  <Th numeric>Min. inap</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {ratePlans.map((plan) => (
                  <Tr key={plan.id}>
                    <Td className="font-mono text-[12px] text-ink">{plan.code}</Td>
                    <Td className="text-ink">{plan.name}</Td>
                    <Td>{MEAL_LABEL[plan.mealPlan] ?? plan.mealPlan}</Td>
                    <Td numeric className="text-ink">{formatMoney(plan.baseRatePerNight, currency, locale)}</Td>
                    <Td numeric>{plan.minStay} malam</Td>
                    <Td>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={plan.active ? 'success' : 'neutral'}>{plan.active ? 'Aktif' : 'Nonaktif'}</Badge>
                        {plan.refundable ? <Badge tone="info">Bisa batal</Badge> : <Badge tone="warning">Tanpa batal</Badge>}
                        {plan.source === 'pms' ? <Badge tone="info">PMS</Badge> : null}
                        {canEdit && plan.source === 'crm' ? (
                          <Button size="sm" variant="ghost" icon={<Pencil aria-hidden className="size-3.5" />} onClick={() => setEditingPlan(plan.id)}>
                            Ubah
                          </Button>
                        ) : null}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        )}

        {editingPlan && editingPlan !== 'new' ? (
          <CardBody>
            <PlanForm
              propertyId={propertyId}
              plan={ratePlans.find((p) => p.id === editingPlan)}
              roomTypes={roomTypes}
              currency={currency}
              onDone={() => setEditingPlan(null)}
            />
          </CardBody>
        ) : null}
      </Card>
    </div>
  );
}

function SourceCard({
  propertyId, propertyName, source, canEdit,
}: { propertyId: string; propertyName: string; source: string; canEdit: boolean }) {
  const [state, action, pending] = useActionState(setInventorySourceAction, null);
  const crmOwned = source === 'crm';
  return (
    <Card>
      <CardHeader
        title="Siapa pemilik inventaris"
        subtitle={`Menentukan dari mana jawaban "masih ada kamar?" untuk ${propertyName}.`}
      />
      <CardBody>
        {state?.ok === false ? <InlineError message={state.error} /> : null}
        <p className="t-body mb-3 text-ink-2">
          {crmOwned
            ? 'Saat ini CRM yang memegang inventaris. Ketersediaan dihitung dari alotmen tipe kamar dikurangi reservasi yang sudah terikat pada rentang tanggal yang dicari.'
            : 'Saat ini PMS yang memegang inventaris. Tipe kamar dan paket tarif hanya cermin, dan ketersediaan diambil dari konektor.'}
        </p>
        {canEdit ? (
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="inventorySource" value={crmOwned ? 'pms' : 'crm'} />
            <Button type="submit" size="sm" variant="secondary" loading={pending}>
              {crmOwned ? 'Serahkan ke PMS' : 'Kelola di CRM'}
            </Button>
            <span className="t-meta">
              {crmOwned
                ? 'Pindah ke PMS hanya masuk akal setelah konektornya benar-benar terhubung.'
                : 'Pindah ke CRM agar hotel bisa menjual tanpa menunggu PMS.'}
            </span>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}

function RoomForm({
  propertyId, room, onDone,
}: { propertyId: string; room?: RoomTypeView; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveRoomTypeAction, null);
  const [removeState, removeAction, removing] = useActionState(removeRoomTypeAction, null);
  const errors = state?.ok === false ? state.fieldErrors : undefined;
  const id = room?.id ?? 'new';
  if (state?.ok && !pending) setTimeout(onDone, 0);
  if (removeState?.ok && !removing) setTimeout(onDone, 0);

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-inset p-3">
      {state?.ok === false && !state.fieldErrors ? <InlineError message={state.error} /> : null}
      {removeState?.ok === false ? <InlineError message={removeState.error} /> : null}
      <form action={action} className="space-y-3">
        <input type="hidden" name="propertyId" value={propertyId} />
        {room ? <input type="hidden" name="id" value={room.id} /> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Kode" htmlFor={`r-code-${id}`} required error={errors?.code} hint="Dipakai pada penawaran dan pemetaan PMS">
            <Input id={`r-code-${id}`} name="code" defaultValue={room?.code} maxLength={12} required />
          </Field>
          <Field label="Nama tipe kamar" htmlFor={`r-name-${id}`} required error={errors?.name} className="sm:col-span-2">
            <Input id={`r-name-${id}`} name="name" defaultValue={room?.name} required />
          </Field>
          <Field label="Jumlah kamar" htmlFor={`r-total-${id}`} required error={errors?.totalRooms} hint="Alotmen yang bisa dijual">
            <Input id={`r-total-${id}`} name="totalRooms" type="number" min={0} max={5000} defaultValue={room?.totalRooms ?? 0} required />
          </Field>
          <Field label="Maks. dewasa" htmlFor={`r-ad-${id}`} required error={errors?.maxAdults}>
            <Input id={`r-ad-${id}`} name="maxAdults" type="number" min={1} max={20} defaultValue={room?.maxAdults ?? 2} required />
          </Field>
          <Field label="Maks. anak" htmlFor={`r-ch-${id}`} error={errors?.maxChildren}>
            <Input id={`r-ch-${id}`} name="maxChildren" type="number" min={0} max={20} defaultValue={room?.maxChildren ?? 1} />
          </Field>
          <Field label="Jenis ranjang" htmlFor={`r-bed-${id}`}>
            <Input id={`r-bed-${id}`} name="bedType" defaultValue={room?.bedType ?? ''} placeholder="King, Twin" />
          </Field>
          <Field label="Luas (m²)" htmlFor={`r-size-${id}`}>
            <Input id={`r-size-${id}`} name="sizeSqm" type="number" min={0} max={2000} defaultValue={room?.sizeSqm ?? ''} />
          </Field>
        </div>
        <Field label="Keterangan" htmlFor={`r-desc-${id}`}>
          <Textarea id={`r-desc-${id}`} name="description" rows={2} defaultValue={room?.description ?? ''} />
        </Field>
        <Checkbox
          name="active"
          defaultChecked={room?.active ?? true}
          label="Tipe kamar aktif"
          hint="Menonaktifkan membuatnya hilang dari penawaran baru, tanpa mengubah riwayat."
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>Batal</Button>
          <Button type="submit" variant="primary" size="sm" loading={pending} icon={<Check aria-hidden className="size-3.5" />}>
            {room ? 'Simpan tipe kamar' : 'Buat tipe kamar'}
          </Button>
        </div>
      </form>
      {room ? (
        <form action={removeAction} className="hairline-t pt-3">
          <input type="hidden" name="id" value={room.id} />
          <Button type="submit" variant="ghost" size="sm" loading={removing} icon={<Trash2 aria-hidden className="size-3.5" />}>
            Hapus tipe kamar
          </Button>
          <span className="t-meta ml-2">Hanya bisa dihapus bila belum pernah dipakai penawaran atau reservasi.</span>
        </form>
      ) : null}
    </div>
  );
}

function PlanForm({
  propertyId, plan, roomTypes, currency, onDone,
}: {
  propertyId: string; plan?: RatePlanView; roomTypes: RoomTypeView[];
  currency: string; onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveRatePlanAction, null);
  const [removeState, removeAction, removing] = useActionState(removeRatePlanAction, null);
  const errors = state?.ok === false ? state.fieldErrors : undefined;
  const id = plan?.id ?? 'new';
  if (state?.ok && !pending) setTimeout(onDone, 0);
  if (removeState?.ok && !removing) setTimeout(onDone, 0);

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-inset p-3">
      {state?.ok === false && !state.fieldErrors ? <InlineError message={state.error} /> : null}
      {removeState?.ok === false ? <InlineError message={removeState.error} /> : null}
      <form action={action} className="space-y-3">
        <input type="hidden" name="propertyId" value={propertyId} />
        {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Kode" htmlFor={`p-code-${id}`} required error={errors?.code}>
            <Input id={`p-code-${id}`} name="code" defaultValue={plan?.code} maxLength={12} required />
          </Field>
          <Field label="Nama paket" htmlFor={`p-name-${id}`} required error={errors?.name} className="sm:col-span-2">
            <Input id={`p-name-${id}`} name="name" defaultValue={plan?.name} required />
          </Field>
          <Field label="Makan" htmlFor={`p-meal-${id}`}>
            <Select id={`p-meal-${id}`} name="mealPlan" defaultValue={plan?.mealPlan ?? 'breakfast'}>
              {MEALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label={`Tarif dasar / malam (${currency})`} htmlFor={`p-rate-${id}`} required error={errors?.baseRatePerNight} hint="Sebelum pajak dan servis">
            <Input id={`p-rate-${id}`} name="baseRatePerNight" type="number" min={0} step={1000} defaultValue={plan?.baseRatePerNight ?? 0} required />
          </Field>
          <Field label="Minimal inap (malam)" htmlFor={`p-min-${id}`} error={errors?.minStay}>
            <Input id={`p-min-${id}`} name="minStay" type="number" min={1} max={365} defaultValue={plan?.minStay ?? 1} />
          </Field>
          <Field label="Termasuk" htmlFor={`p-inc-${id}`} hint="Pisahkan dengan koma" className="sm:col-span-2">
            <Input id={`p-inc-${id}`} name="inclusions" defaultValue={plan?.inclusionList.join(', ') ?? ''} placeholder="Sarapan 2 orang, WiFi" />
          </Field>
        </div>

        {roomTypes.length > 0 ? (
          <fieldset className="rounded-md border border-border p-3">
            <legend className="t-label px-1">Selisih tarif per tipe kamar</legend>
            <p className="t-meta mb-2">Ditambahkan ke tarif dasar. Kosongkan bila sama.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {roomTypes.map((room) => (
                <Field key={room.id} label={room.name} htmlFor={`sur-${id}-${room.code}`}>
                  <Input
                    id={`sur-${id}-${room.code}`}
                    name={`sur_${room.code}`}
                    type="number" step={1000}
                    defaultValue={plan?.surcharges[room.code] ?? 0}
                  />
                </Field>
              ))}
            </div>
          </fieldset>
        ) : null}

        <Field label="Kebijakan" htmlFor={`p-pol-${id}`}>
          <Textarea id={`p-pol-${id}`} name="policies" rows={2} defaultValue={plan?.policies ?? ''} placeholder="Batal gratis sampai 48 jam sebelum kedatangan." />
        </Field>
        <Checkbox name="refundable" defaultChecked={plan?.refundable ?? true} label="Dapat dibatalkan" />
        <Checkbox name="active" defaultChecked={plan?.active ?? true} label="Paket tarif aktif" />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>Batal</Button>
          <Button type="submit" variant="primary" size="sm" loading={pending} icon={<Check aria-hidden className="size-3.5" />}>
            {plan ? 'Simpan paket tarif' : 'Buat paket tarif'}
          </Button>
        </div>
      </form>
      {plan ? (
        <form action={removeAction} className="hairline-t pt-3">
          <input type="hidden" name="id" value={plan.id} />
          <Button type="submit" variant="ghost" size="sm" loading={removing} icon={<Trash2 aria-hidden className="size-3.5" />}>
            Hapus paket tarif
          </Button>
          <span className="t-meta ml-2">Hanya bisa dihapus bila belum pernah dipakai.</span>
        </form>
      ) : null}
    </div>
  );
}
