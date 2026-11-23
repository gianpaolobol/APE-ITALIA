/**
 * Price list shown to customers (VAT included). Values come from the Emilia-Romagna market analysis in
 * docs/research/MARKET_PRICING_ER.md; change them there first, then here.
 */
import type { Answers } from './survey/questions';

export type Quote = { total: number; items: Array<{ label: string; amount: number }>; certifierPayout: number; note: string };

/** Single regional price list (no per-province prices: variance within a province exceeds that between provinces). */
export const PRICE_LIST = {
 tiers: [
  { id: 'small', label: 'Appartamento fino a 60 m²', price: 179 },
  { id: 'medium', label: 'Appartamento 61–120 m²', price: 219 },
  { id: 'large', label: 'Appartamento oltre 120 m²', price: 269 },
  { id: 'row', label: 'Villetta a schiera / bifamiliare', price: 299 },
  { id: 'house', label: 'Casa indipendente fino a 250 m²', price: 349 },
 ],
 houseExtraPer100m2: 50,
 urgent: 49,
 /** Visura + planimetria retrieved by the certifier when the owner has no floor plan (see docs/research/VISURA_CATASTALE_ER.md). */
 cadastralRetrieval: 14.9,
 /** Platform fee on the taxable amount; the 15 € regional SACE fee always goes to the certifier. */
 platformShare: 0.15,
 regionalFee: 15,
};

export function tierFor(a: Answers): (typeof PRICE_LIST.tiers)[number] | null {
 const type = typeof a.propertyType === 'string' ? a.propertyType : undefined;
 const area = typeof a.floorArea === 'number' ? a.floorArea : undefined;
 if (!type) return null;
 const t = (id: string) => PRICE_LIST.tiers.find(x => x.id === id)!;
 if (type === 'casa') return t('house');
 if (type === 'schiera') return t('row');
 if (area === undefined) return t('medium');
 return area <= 60 ? t('small') : area <= 120 ? t('medium') : t('large');
}

export function quote(a: Answers): Quote | null {
 const tier = tierFor(a);
 if (!tier) return null;
 const items: Quote['items'] = [{ label: `${tier.label} · sopralluogo, APE e deposito SACE`, amount: tier.price }];
 const area = typeof a.floorArea === 'number' ? a.floorArea : 0;
 if (tier.id === 'house' && area > 250) items.push({ label: 'Superficie oltre 250 m²', amount: Math.ceil((area - 250) / 100) * PRICE_LIST.houseExtraPer100m2 });
 if (a.hasPlan === 'no') items.push({ label: 'Recupero visura e planimetria catastale', amount: PRICE_LIST.cadastralRetrieval });
 if (a.urgency === 'urgente') items.push({ label: 'Consegna urgente (48 ore dal sopralluogo)', amount: PRICE_LIST.urgent });
 const total = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
 const taxable = (total - PRICE_LIST.regionalFee) / 1.22;
 return { total, items, certifierPayout: Math.round(taxable * (1 - PRICE_LIST.platformShare) + PRICE_LIST.regionalFee), note: 'Prezzo fisso in tutta l’Emilia-Romagna: IVA, cassa previdenziale del professionista e contributo regionale SACE inclusi. Paghi solo dopo il sopralluogo.' };
}

export const euro = (n: number) => `${n.toLocaleString('it-IT', Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
