/** The "everything you need" list: what is still missing and what the certifier will check on site. */
import { STEPS, isAnswered, isVisible, visibleSteps, type Answers, type Photos } from './questions';

export type ChecklistItem = { stepId: string; questionId: string; label: string; kind: 'photo' | 'data'; required: boolean; done: boolean };

export function checklist(a: Answers, p: Photos): ChecklistItem[] {
 const items: ChecklistItem[] = [];
 for (const s of visibleSteps(a)) for (const q of s.questions) {
  if (!isVisible(q, a)) continue;
  if (!q.required && q.kind !== 'photo') continue;
  items.push({ stepId: s.id, questionId: q.id, label: q.label, kind: q.kind === 'photo' ? 'photo' : 'data', required: !!q.required, done: isAnswered(q, a, p) });
 }
 return items;
}

export function progress(a: Answers, p: Photos): { done: number; total: number; ratio: number } {
 const req = checklist(a, p).filter(i => i.required);
 const done = req.filter(i => i.done).length;
 return { done, total: req.length, ratio: req.length ? done / req.length : 0 };
}

export function readyToSend(a: Answers, p: Photos): boolean {
 return checklist(a, p).every(i => !i.required || i.done);
}

/** Things the certifier verifies during the mandatory inspection (shown to set expectations). */
export function onSiteChecks(a: Answers): string[] {
 const out = ['Misure di stanze, altezze e superfici disperdenti', 'Verifica di muri, serramenti e cassonetti'];
 if (a.heatingSystem !== 'nessuno') out.push('Generatore di calore e libretto di impianto (registro CRITER)');
 if (a.cooling && a.cooling !== 'nessuno') out.push('Unità di climatizzazione e loro dati di targa');
 if (a.pv === true || a.solarThermal === true) out.push('Impianti a fonte rinnovabile');
 out.push('Calcolo e deposito dell’APE sul portale regionale SACE');
 return out;
}

export const STEP_IDS = STEPS.map(s => s.id);
