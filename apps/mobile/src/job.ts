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
 ape?: { code: string; energyClass: string; pdf?: PhotoRef; deliveredAt: string; depositedAt?: string };
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

/** Server report format (services/api/src/inspections/report.ts). */
export type ServerFinding = { field: string; status: 'verified' | 'to_verify' | 'undeterminable'; value?: string | number; source: 'inspection' | 'document' | 'photo' };
export type ServerReport = { performedAt: string; attendees: string; findings: ServerFinding[]; generalNotes?: string; declaration: true };

const MAP_ENUM: Record<string, Record<string, string>> = {
 heatGenerator: { caldaia_condensazione: 'caldaia_condensazione', caldaia_tradizionale: 'caldaia_tradizionale', pompa_calore: 'pompa_di_calore', teleriscaldamento: 'teleriscaldamento', biomassa: 'biomassa', elettrico: 'stufa_elettrica' },
 emitters: { radiatori: 'radiatori', pavimento: 'pannelli_radianti', ventilconvettori: 'ventilconvettori' },
 dhw: { stesso_generatore: 'combinata_riscaldamento', boiler_elettrico: 'boiler_elettrico', pdc_acs: 'pompa_di_calore', boiler_gas: 'altro' },
 cooling: { nessuno: 'assente', split: 'split', centralizzato: 'centralizzata' },
 wallType: { mattoni_pieni: 'muratura_piena', laterizio_forato: 'laterizio_forato', cemento: 'cemento_armato', cassa_vuota: 'altro', pietra: 'altro' },
 glazing: { singolo: 'singolo', doppio: 'doppio', basso_emissivo: 'doppio_basso_emissivo' },
 frame: { legno: 'legno', pvc: 'pvc', alluminio_tt: 'alluminio_taglio_termico', metallo: 'alluminio' },
};

/**
 * Builds the structured inspection report from the verbale. Survey values become findings: "verified" when
 * the certifier ticked the matching check on site, otherwise "to_verify". Values are the customer's
 * declarations confirmed (or not) by the certifier: nothing is invented.
 */
export function reportFromVerbale(a: Answers, v: Verbale): ServerReport {
 const st = (check: string): ServerFinding['status'] => (v.checks.includes(check) ? 'verified' : 'to_verify');
 const f: ServerFinding[] = [];
 const en = (key: string, field: string, check: string) => { const m = MAP_ENUM[key]?.[String(a[key])]; if (m) f.push({ field, status: st(check), value: m, source: 'inspection' }); };
 const num = (key: string, field: string, check: string, min: number, max: number, int = false) => { const x = a[key]; if (typeof x === 'number' && x >= min && x <= max && (!int || Number.isInteger(x))) f.push({ field, status: st(check), value: x, source: 'inspection' }); };
 en('heatGenerator', 'heating.generator.type', 'generatore');
 num('generatorPowerKw', 'heating.generator.nominal_power_kw', 'generatore', 0.5, 5000);
 num('generatorYear', 'heating.generator.install_year', 'generatore', 1900, 2100, true);
 en('emitters', 'heating.emitters.type', 'terminali');
 en('dhw', 'dhw.generator.type', 'acs');
 en('cooling', 'cooling.present', 'raffrescamento');
 en('wallType', 'envelope.wall.type', 'involucro');
 num('wallThickness', 'envelope.wall.thickness_cm', 'involucro', 5, 200);
 if (a.wallInsulated !== undefined) f.push({ field: 'envelope.wall.insulation', status: st('involucro'), value: a.wallInsulated === true ? 'cappotto_esterno' : 'assente', source: 'inspection' });
 en('glazing', 'windows.glazing', 'involucro');
 en('frame', 'windows.frame', 'involucro');
 num('floorArea', 'geometry.heated_area_m2', 'misure', 1, 100000);
 if (a.pv === true) num('pvKw', 'renewables.pv_kwp', 'fer', 0, 10000); else f.push({ field: 'renewables.pv_kwp', status: st('fer'), value: 0, source: 'inspection' });
 const [d, m, y] = v.date.split(/[/.-]/).map(Number);
 const [hh, mm] = v.start.replace('.', ':').split(':').map(Number);
 const performed = new Date(y < 100 ? 2000 + y : y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
 const notes = [`Orario ${v.start}–${v.end}.`, `Confermato da ${v.ownerName}.`, v.notes ? `Note: ${v.notes}` : ''].filter(Boolean).join(' ').slice(0, 4000);
 return { performedAt: performed.toISOString(), attendees: v.attendees.slice(0, 300), findings: f.slice(0, 200), generalNotes: notes, declaration: true };
}
