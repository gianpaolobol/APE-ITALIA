/** Server-side validation of certifier applications (mirrors apps/mobile/src/pro/registration.ts). */
export const PROVINCES_ER = ['BO', 'MO', 'RE', 'PR', 'PC', 'FE', 'RA', 'FC', 'RN'] as const;
const PROFESSIONS = ['architetto', 'ingegnere', 'geometra', 'perito', 'altro'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ApplicationInput = {
 firstName: string; lastName: string; email: string; phone: string; pec: string | null; vatNumber: string; taxCode: string;
 profession: string; professionalOrder: string; orderNumber: string; region: 'Emilia-Romagna'; saceNumber: string; provinces: string[];
};

export function validVat(v: string): boolean {
 if (!/^\d{11}$/.test(v)) return false;
 let sum = 0;
 for (let i = 0; i < 10; i++) { let d = Number(v[i]); if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } sum += d; }
 return (10 - (sum % 10)) % 10 === Number(v[10]);
}

export function validateApplication(body: unknown): { ok: true; value: ApplicationInput } | { ok: false; errors: string[] } {
 const b = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
 const errors: string[] = [];
 const s = (k: string, max = 120, required = true) => {
  const v = typeof b[k] === 'string' ? (b[k] as string).trim() : '';
  if (required && !v) errors.push(`${k} required`);
  if (v.length > max) errors.push(`${k} too long`);
  return v;
 };
 const firstName = s('firstName', 60), lastName = s('lastName', 60), email = s('email').toLowerCase(), phone = s('phone', 20);
 const pec = s('pec', 120, false) || null;
 const vatNumber = s('vatNumber', 11).replace(/\s/g, ''), taxCode = s('taxCode', 16).toUpperCase();
 const profession = s('profession', 20), professionalOrder = s('professionalOrder', 80), orderNumber = s('orderNumber', 20);
 const saceRaw = s('saceNumber', 10).replace(/\s/g, '');
 if (email && !EMAIL.test(email)) errors.push('email invalid');
 if (pec && !EMAIL.test(pec)) errors.push('pec invalid');
 if (phone && !/^\+?[0-9 ]{8,16}$/.test(phone)) errors.push('phone invalid');
 if (vatNumber && !validVat(vatNumber)) errors.push('vatNumber invalid');
 if (taxCode && !/^([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]|\d{11})$/.test(taxCode)) errors.push('taxCode invalid');
 if (profession && !PROFESSIONS.includes(profession)) errors.push('profession invalid');
 if (saceRaw && !/^\d{1,5}$/.test(saceRaw)) errors.push('saceNumber must be the 5-digit SACE accreditation number');
 if (b.region !== 'Emilia-Romagna') errors.push('region must be Emilia-Romagna');
 const provinces = Array.isArray(b.provinces) ? [...new Set(b.provinces.filter((p): p is string => typeof p === 'string'))] : [];
 if (!provinces.length || provinces.some(p => !(PROVINCES_ER as readonly string[]).includes(p))) errors.push('provinces invalid');
 if (b.declaresAccreditation !== true) errors.push('declaresAccreditation required');
 if (b.acceptsTerms !== true) errors.push('acceptsTerms required');
 if (errors.length) return { ok: false, errors };
 return { ok: true, value: { firstName, lastName, email, phone, pec, vatNumber, taxCode, profession, professionalOrder, orderNumber, region: 'Emilia-Romagna', saceNumber: saceRaw.padStart(5, '0'), provinces } };
}
