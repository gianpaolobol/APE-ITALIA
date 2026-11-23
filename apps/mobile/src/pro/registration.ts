/**
 * Self-registration of energy certifiers. In Emilia-Romagna only certifiers accredited in the regional
 * system (SACE, managed by ART-ER) may issue APE: the accreditation number is mandatory and is checked
 * by an operator against the public list before the profile is activated.
 */
export type ProRegistration = {
 firstName: string; lastName: string; email: string; phone: string;
 vatNumber: string; taxCode: string; pec?: string;
 profession: 'architetto' | 'ingegnere' | 'geometra' | 'perito' | 'altro';
 professionalOrder: string; orderNumber: string;
 region: 'Emilia-Romagna';
 saceNumber: string;
 provinces: string[];
 maxMonthlyJobs: number;
 acceptsTerms: boolean;
 declaresAccreditation: boolean;
};

export type FieldErrors = Partial<Record<keyof ProRegistration, string>>;

/** Italian VAT number check digit (Luhn-like algorithm defined by the Agenzia delle Entrate). */
export function validVat(v: string): boolean {
 const s = v.replace(/\s/g, '');
 if (!/^\d{11}$/.test(s)) return false;
 let sum = 0;
 for (let i = 0; i < 10; i++) {
  let d = Number(s[i]);
  if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
  sum += d;
 }
 return (10 - (sum % 10)) % 10 === Number(s[10]);
}

export function normalizeSace(v: string): string {
 return v.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * SACE accreditation numbers are 5-digit codes; they are also the first block of every APE code issued
 * by that certifier (NNNNN-NNNNNN-AAAA). Shorter inputs are accepted and zero-padded.
 */
export function validSace(v: string): boolean {
 return /^\d{1,5}$/.test(normalizeSace(v));
}

export function normalizeSaceNumber(v: string): string {
 const s = normalizeSace(v);
 return /^\d{1,5}$/.test(s) ? s.padStart(5, '0') : s;
}

/** True when the APE code prefix (certifying subject: a person, firm or public body) equals the given number. */
export function apeCodeMatchesCertifier(apeCode: string, saceNumber: string): boolean {
 const m = /^(\d{5})-(\d{6})-(\d{4})$/.exec(apeCode.trim());
 return !!m && m[1] === normalizeSaceNumber(saceNumber);
}

export function validateRegistration(r: Partial<ProRegistration>): FieldErrors {
 const e: FieldErrors = {};
 const req = (k: keyof ProRegistration, label: string) => { const v = r[k]; if (typeof v !== 'string' || !v.trim()) e[k] = `${label} obbligatorio`; };
 req('firstName', 'Nome'); req('lastName', 'Cognome'); req('email', 'Email'); req('phone', 'Telefono');
 req('vatNumber', 'Partita IVA'); req('taxCode', 'Codice fiscale'); req('professionalOrder', 'Ordine o collegio'); req('orderNumber', 'Numero di iscrizione');
 req('saceNumber', 'Numero di accreditamento SACE');
 if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email.trim())) e.email = 'Email non valida';
 if (r.pec && r.pec.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.pec.trim())) e.pec = 'PEC non valida';
 if (r.phone && !/^\+?[0-9 ]{8,16}$/.test(r.phone.trim())) e.phone = 'Telefono non valido';
 if (r.vatNumber && !validVat(r.vatNumber)) e.vatNumber = 'Partita IVA non valida';
 if (r.taxCode && !/^([A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]|\d{11})$/i.test(r.taxCode.trim())) e.taxCode = 'Codice fiscale non valido';
 if (r.saceNumber && !validSace(r.saceNumber)) e.saceNumber = 'Numero SACE non valido';
 if (!r.profession) e.profession = 'Seleziona la professione';
 if (!r.provinces || r.provinces.length === 0) e.provinces = 'Scegli almeno una provincia';
 if (!r.declaresAccreditation) e.declaresAccreditation = 'Dichiarazione obbligatoria';
 if (!r.acceptsTerms) e.acceptsTerms = 'Accetta le condizioni';
 return e;
}
