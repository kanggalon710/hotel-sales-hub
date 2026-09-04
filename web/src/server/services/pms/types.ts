/**
 * Adapter contract for PMS/CRS connectors (PRD 17.5). Adding a second vendor
 * means implementing this interface — the CRM core does not change.
 */
export type AvailabilityQuery = {
  propertyId: string;
  externalPropertyCode: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;
  adults: number;
  children: number;
  rateContext?: string | null;
  /** Sandbox-only switch used to exercise timeout/unavailable paths. */
  simulate?: 'ok' | 'timeout' | 'sold_out' | 'error';
};

export type AvailabilityOffer = {
  roomTypeCode: string;
  ratePlanCode: string;
  sellableQty: number;
  ratePerNight: number;
  currency: string;
  restrictions: string[];
  inclusions: string[];
};

export type AvailabilityResult =
  | { ok: true; offers: AvailabilityOffer[]; checkedAt: Date; latencyMs: number; sourceLabel: string }
  | {
      ok: false;
      /** Distinguishes a vendor failure from a genuine sold-out answer. */
      kind: 'timeout' | 'error' | 'unavailable';
      message: string;
      /** What the user can actually do about it. */
      recovery: string;
      checkedAt: Date;
      latencyMs: number;
      sourceLabel: string;
    };

export type HoldRequest = {
  externalPropertyCode: string;
  roomTypeCode: string;
  ratePlanCode: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  guestName: string;
  totalAmount: number;
  currency: string;
  specialRequest?: string | null;
};

export type HoldResult =
  | { ok: true; reference: string; kind: 'hold' | 'reservation'; raw: unknown }
  | { ok: false; message: string; recovery: string };

export interface PmsAdapter {
  readonly id: string;
  readonly label: string;
  /** False when the vendor has no write API — the CRM then falls back to manual confirmation. */
  readonly supportsWrite: boolean;
  searchAvailability(query: AvailabilityQuery): Promise<AvailabilityResult>;
  createReservation(request: HoldRequest): Promise<HoldResult>;
}
