/**
 * Certifier side of a request: acceptance, pre-inspection video call, on-site inspection, report
 * (verbale) and APE delivery. The video call never replaces the on-site inspection, which is mandatory
 * in Emilia-Romagna (DGR 1275/2015 as amended by DGR 1385/2020): the APE cannot be delivered without
 * a completed inspection report.
 */
import { STEPS, isVisible, type Answers, type PhotoRef, type Question } from './survey/questions';

export type JobStatus = 'nuova' | 'accettata' | 'rifiutata' | 'consegnata';
export type Verbale = {
 date: string; start: string; end: string; attendees: string; checks: string[]; notes: string;
 ownerName: string; ownerConfirmed: boolean; declaration: boolean; savedAt: string;
};
export type Job = {
 status: JobStatus;
 certifier: { name: string; sace: string };
 acceptedAt?: string;
 call?: { at: string; url: string };
 visit?: { at: string };
 verbale?: Verbale;
 ape?: { code: string; energyClass: string; pdf?: PhotoRef; deliveredAt: string };
};

export const VERBALE_CHECKS = [
 { value: 'misure', label: 'Misure di ambienti e altezze' },
 { value: 'involucro', label: 'Murature, spessori e serramenti' },
 { value: 'generatore', label: 'Generatore e libretto di impianto' },
 { value: 'terminali', label: 'Terminali e regolazione' },
 { value: 'acs', label: 'Produzione acqua calda' },
 { value: 'raffrescamento', label: 'Impianto di raffrescamento' },
 { value: 'fer', label: 'Impianti a fonte rinnovabile' },
 { value: 'foto', label: 'Documentazione fotografica' },
];

export const APE_CODE = /^\d{5}-\d{6}-\d{4}$/;

/** Unguessable meeting room on the public Jitsi Meet service (no account needed on either side). */
export function newCallUrl(): string {
 const a = 'abcdefghijkmnpqrstuvwxyz23456789';
 let id = '';
 for (let i = 0; i < 16; i++) id += a[Math.floor(Math.random() * a.length)];
 return `https://meet.jit.si/APEItalia-${id}`;
}

export function verbaleErrors(v: Partial<Verbale>): string[] {
 const e: string[] = [];
 const hhmm = /^([01]\d|2[0-3])[:.][0-5]\d$/;
 if (!v.date) e.push('Data del sopralluogo');
 if (!v.start || !hhmm.test(v.start)) e.push('Ora di inizio (hh:mm)');
 if (!v.end || !hhmm.test(v.end)) e.push('Ora di fine (hh:mm)');
 if (!v.attendees || v.attendees.trim().length < 3) e.push('Persone presenti');
 if (!v.checks || v.checks.length < 3) e.push('Almeno 3 verifiche eseguite');
 if (!v.ownerName || v.ownerName.trim().length < 3) e.push('Nome del proprietario o delegato');
 if (!v.ownerConfirmed) e.push('Conferma del proprietario o delegato');
 if (!v.declaration) e.push('Dichiarazione del certificatore');
 return e;
}

export function canDeliver(j: Job | undefined): boolean {
 return !!j && j.status === 'accettata' && !!j.verbale;
}

const fmtValue = (q: Question, v: unknown): string | null => {
 if (v === undefined || v === null || v === '') return null;
 if (q.kind === 'choice') return q.options.find(o => o.value === v)?.label ?? String(v);
 if (q.kind === 'multi') return Array.isArray(v) ? v.map(x => q.options.find(o => o.value === x)?.label ?? x).join(', ') : null;
 if (q.kind === 'toggle') return v === true ? 'Sì' : 'No';
 if (q.kind === 'number') return `${String(v).replace('.', ',')}${q.unit ? ' ' + q.unit : ''}`;
 if (q.kind === 'text') return String(v);
 return null;
};

/** Readable dossier: visible answers grouped by survey step (consents excluded). */
export function dossier(a: Answers): Array<{ title: string; rows: Array<{ label: string; value: string }> }> {
 const skip = new Set(['dataNotice', 'aiConsent', 'privacy', 'cadastralDelegation']);
 return STEPS.map(s => ({
  title: s.title,
  rows: s.questions.filter(q => !skip.has(q.id) && isVisible(q, a)).map(q => ({ label: q.label, value: fmtValue(q, a[q.id]) })).filter((r): r is { label: string; value: string } => !!r.value),
 })).filter(g => g.rows.length > 0);
}

export const fmtWhen = (iso: string) => new Date(iso).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
