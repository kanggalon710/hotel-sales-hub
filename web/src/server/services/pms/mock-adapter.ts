import 'server-only';
import { createHash } from 'node:crypto';
import type { AvailabilityQuery, AvailabilityResult, HoldRequest, HoldResult, PmsAdapter } from './types';

/** Deterministic pseudo-random so the same stay returns the same inventory. */
function seeded(...parts: (string | number)[]) {
  const hex = createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 8);
  return parseInt(hex, 16) / 0xffffffff;
}

const ROOM_TYPES = [
  { code: 'DLX', base: 1_450_000, stock: 12 },
  { code: 'PREM', base: 1_850_000, stock: 8 },
  { code: 'EXEC', base: 3_250_000, stock: 4 },
  { code: 'VILLA', base: 6_750_000, stock: 6 },
];

const RATE_PLANS = [
  { code: 'BAR-RO', factor: 1, minStay: 1, refundable: true, inclusions: ['Wi-Fi', 'Gym & pool access'] },
  { code: 'BAR-BB', factor: 1.06, minStay: 1, refundable: true, inclusions: ['Wi-Fi', 'Breakfast for 2', 'Gym & pool access'] },
  { code: 'ADV-NR', factor: 0.88, minStay: 2, refundable: false, inclusions: ['Wi-Fi', 'Breakfast for 2', 'Late checkout 14:00'] },
  { code: 'STAY3', factor: 0.8, minStay: 3, refundable: true, inclusions: ['Wi-Fi', 'Breakfast for 2', '1 night free'] },
];

/**
 * Stand-in for the first real PMS/CRS connector. It behaves like a live vendor:
 * variable inventory, occasional sold-out room types, and explicit failure
 * modes the UI must handle rather than paper over.
 */
export class MockPmsAdapter implements PmsAdapter {
  readonly id = 'pms-mock';
  readonly supportsWrite = true;

  readonly label: string;
  constructor(label = 'Opera Cloud (sandbox adapter)') {
    this.label = label;
  }

  async searchAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    const started = Date.now();
    const latency = 220 + Math.round(seeded(query.propertyId, query.checkIn) * 900);
    await new Promise((r) => setTimeout(r, Math.min(latency, 700)));
    const checkedAt = new Date();
    const latencyMs = Date.now() - started;

    if (query.simulate === 'timeout') {
      return {
        ok: false, kind: 'timeout', checkedAt, latencyMs, sourceLabel: this.label,
        message: 'The PMS did not respond within the configured timeout.',
        recovery: 'Retry the search. If it keeps failing, confirm the stay manually with the front office before quoting.',
      };
    }
    if (query.simulate === 'error') {
      return {
        ok: false, kind: 'error', checkedAt, latencyMs, sourceLabel: this.label,
        message: 'The PMS rejected the request (rate context not configured for this property).',
        recovery: 'Ask an administrator to check the rate mapping for this property in Integrations.',
      };
    }

    const offers = ROOM_TYPES.flatMap((room) => {
      const capacityOk = query.adults <= (room.code === 'EXEC' || room.code === 'VILLA' ? 3 : 2) * query.rooms;
      if (!capacityOk) return [];
      return RATE_PLANS.filter((plan) => query.nights >= plan.minStay).map((plan) => {
        const r = seeded(query.propertyId, query.checkIn, room.code, plan.code);
        const soldOut = query.simulate === 'sold_out' || r < 0.12;
        const sellableQty = soldOut ? 0 : Math.max(1, Math.round(r * room.stock));
        // Weekend and short-notice arrivals price higher, like a real rate engine.
        const dow = new Date(`${query.checkIn}T00:00:00Z`).getUTCDay();
        const weekend = dow === 5 || dow === 6 ? 1.12 : 1;
        const leadDays = Math.round((Date.parse(`${query.checkIn}T00:00:00Z`) - Date.now()) / 86_400_000);
        const urgency = leadDays <= 7 ? 1.08 : leadDays >= 45 ? 0.95 : 1;
        return {
          roomTypeCode: room.code,
          ratePlanCode: plan.code,
          sellableQty,
          ratePerNight: Math.round((room.base * plan.factor * weekend * urgency) / 1000) * 1000,
          currency: 'IDR',
          restrictions: [
            plan.minStay > 1 ? `Min stay ${plan.minStay} nights` : null,
            !plan.refundable ? 'Non-refundable' : null,
            sellableQty > 0 && sellableQty < query.rooms ? `Only ${sellableQty} left, fewer than requested` : null,
          ].filter((x): x is string => Boolean(x)),
          inclusions: plan.inclusions,
        };
      });
    });

    const sellable = offers.filter((o) => o.sellableQty > 0);
    if (sellable.length === 0) {
      return {
        ok: false, kind: 'unavailable', checkedAt, latencyMs, sourceLabel: this.label,
        message: 'No sellable inventory for these dates and occupancy.',
        recovery: 'Offer alternative dates or a different room type, or ask the front office for a house-use exception.',
      };
    }

    return { ok: true, offers, checkedAt, latencyMs, sourceLabel: this.label };
  }

  async createReservation(request: HoldRequest): Promise<HoldResult> {
    await new Promise((r) => setTimeout(r, 320));
    const stamp = createHash('sha1')
      .update([request.externalPropertyCode, request.checkIn, request.guestName, Date.now()].join('|'))
      .digest('hex')
      .slice(0, 6)
      .toUpperCase();
    return {
      ok: true,
      kind: 'reservation',
      reference: `NHG${request.externalPropertyCode}${stamp}`,
      raw: { pmsStatus: 'RESERVED', roomType: request.roomTypeCode, ratePlan: request.ratePlanCode },
    };
  }
}
