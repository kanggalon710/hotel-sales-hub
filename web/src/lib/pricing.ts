/**
 * Quotation maths. Shared by the server (authoritative) and the builder UI
 * (live preview) so the two can never disagree.
 *
 * Indonesian hotel convention: service charge on the net, then tax on
 * (net + service).
 */
export type PricingInput = {
  lines: { rooms: number; ratePerNight: number }[];
  nights: number;
  discountType: 'none' | 'percent' | 'amount';
  discountValue: number;
  servicePercent: number;
  taxPercent: number;
};

export type Pricing = {
  subtotal: number;
  discountAmount: number;
  discountPercentEffective: number;
  netAmount: number;
  serviceAmount: number;
  taxAmount: number;
  total: number;
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(v) ? v : 0));
}

export function priceQuotation(input: PricingInput): Pricing {
  const nights = Math.max(1, input.nights);
  const subtotal = input.lines.reduce(
    (sum, l) => sum + Math.max(0, l.rooms) * Math.max(0, l.ratePerNight) * nights,
    0,
  );

  let discountAmount = 0;
  if (input.discountType === 'percent') {
    discountAmount = Math.round((subtotal * clamp(input.discountValue, 0, 100)) / 100);
  } else if (input.discountType === 'amount') {
    discountAmount = Math.round(clamp(input.discountValue, 0, subtotal));
  }

  const netAmount = subtotal - discountAmount;
  const serviceAmount = Math.round((netAmount * input.servicePercent) / 100);
  const taxAmount = Math.round(((netAmount + serviceAmount) * input.taxPercent) / 100);

  return {
    subtotal,
    discountAmount,
    discountPercentEffective: subtotal > 0 ? Math.round((discountAmount / subtotal) * 1000) / 10 : 0,
    netAmount,
    serviceAmount,
    taxAmount,
    total: netAmount + serviceAmount + taxAmount,
  };
}
