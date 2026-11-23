/**
 * Server-side price list: the amount charged is always recomputed from the survey answers, never taken
 * from the client. Must match apps/mobile/src/pricing.ts (parity test in the mobile workspace).
 */
export const PRICE_TIERS = [
 { id: 'small', price: 179 }, { id: 'medium', price: 219 }, { id: 'large', price: 269 }, { id: 'row', price: 299 }, { id: 'house', price: 349 },
] as const;
export const HOUSE_EXTRA_PER_100M2 = 50;
export const URGENT = 49;
export const CADASTRAL_RETRIEVAL = 29;

export function priceFor(a: Record<string, unknown>): { totalCents: number; lines: Array<{ label: string; cents: number }> } | null {
 const type = typeof a.propertyType === 'string' ? a.propertyType : undefined;
 const area = typeof a.floorArea === 'number' ? a.floorArea : undefined;
 if (!type) return null;
 const tierId = type === 'casa' ? 'house' : type === 'schiera' ? 'row' : area === undefined ? 'medium' : area <= 60 ? 'small' : area <= 120 ? 'medium' : 'large';
 const tier = PRICE_TIERS.find(t => t.id === tierId)!;
 const lines = [{ label: 'APE con sopralluogo e deposito SACE', cents: tier.price * 100 }];
 if (tierId === 'house' && (area ?? 0) > 250) lines.push({ label: 'Superficie oltre 250 m²', cents: Math.ceil(((area ?? 0) - 250) / 100) * HOUSE_EXTRA_PER_100M2 * 100 });
 if (a.hasPlan === 'no') lines.push({ label: 'Visura e planimetria catastale', cents: CADASTRAL_RETRIEVAL * 100 });
 if (a.urgency === 'urgente') lines.push({ label: 'Consegna urgente', cents: URGENT * 100 });
 return { totalCents: lines.reduce((s, l) => s + l.cents, 0), lines };
}
