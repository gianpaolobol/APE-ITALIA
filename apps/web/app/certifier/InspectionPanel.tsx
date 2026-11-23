import React from 'react';
import type { InspectionSchema, InspectionView } from '../../lib/api';
import { scheduleInspection, submitReport } from './actions';
import { box, btn } from '../ui';

const STATUS_LABEL: Record<string, string> = { verified: 'Verificato', to_verify: 'Da verificare', undeterminable: 'Non determinabile' };
const SOURCE_LABEL: Record<string, string> = { inspection: 'Sopralluogo', document: 'Documento', photo: 'Foto' };
const fmt = (d: string) => new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'medium', timeStyle: 'short' });

export function InspectionPanel({ assignmentId, inspection, schema }: { assignmentId: string; inspection: InspectionView | null; schema: InspectionSchema }) {
 if (inspection?.status === 'DONE' && inspection.report) {
  return <section style={box}>
   <h2>Verbale di sopralluogo (inviato, non modificabile)</h2>
   <p>Eseguito il {inspection.performedAt ? fmt(inspection.performedAt) : '—'} · presenti: {inspection.report.attendees}</p>
   <table cellPadding={6} style={{ borderCollapse: 'collapse' }}><thead><tr><th align="left">Voce</th><th align="left">Stato</th><th align="left">Valore</th><th align="left">Fonte</th><th align="left">Note</th></tr></thead>
    <tbody>{inspection.report.findings.map(f => <tr key={f.field}><td>{schema.fields[f.field]?.label ?? f.field}</td><td>{STATUS_LABEL[f.status]}</td><td>{f.value ?? '—'}{(() => { const s = schema.fields[f.field]; return s && s.kind === 'number' && f.value !== undefined ? ' ' + s.unit : ''; })()}</td><td>{SOURCE_LABEL[f.source]}</td><td>{f.note ?? ''}</td></tr>)}</tbody></table>
   {inspection.report.generalNotes ? <p>Note: {inspection.report.generalNotes}</p> : null}
   <p>Esporta i dati per il software di calcolo conforme: <a href={`/certifier/${assignmentId}/export?format=json`}>JSON</a> · <a href={`/certifier/${assignmentId}/export?format=csv`}>CSV</a>. L'esportazione non è un APE.</p>
  </section>;
 }
 return <>
  <section style={box}>
   <h2>Sopralluogo</h2>
   {inspection ? <p>Programmato per il {fmt(inspection.scheduledAt)} (ora di Roma). Puoi riprogrammarlo finché non invii il verbale.</p> : <p>Non ancora programmato.</p>}
   <form action={scheduleInspection} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <input type="hidden" name="id" value={assignmentId} />
    <label>Data e ora (Europe/Rome) <input type="datetime-local" name="scheduledAt" required /></label>
    <button style={btn} type="submit">{inspection ? 'Riprogramma' : 'Programma'}</button>
   </form>
  </section>
  {inspection?.status === 'SCHEDULED' ? <section style={box}>
   <h2>Verbale di sopralluogo</h2>
   <p>Compila solo le voci rilevate. Per ogni voce scegli lo stato: un valore letto da foto o documenti va confermato sul posto o annotato. Non è prevista alcuna classe energetica: il calcolo avviene nel software conforme.</p>
   <form action={submitReport}>
    <input type="hidden" name="id" value={assignmentId} />
    <p><label>Eseguito il (Europe/Rome) <input type="datetime-local" name="performedAt" required /></label></p>
    <p><label>Presenti <input name="attendees" required minLength={2} maxLength={300} size={50} /></label></p>
    <table cellPadding={4}><thead><tr><th align="left">Voce</th><th>Stato</th><th>Valore</th><th>Fonte</th><th>Note</th></tr></thead><tbody>
     {Object.entries(schema.fields).map(([key, spec]) => <tr key={key}>
      <td>{spec.label}{spec.kind === 'number' ? ` (${spec.unit})` : ''}</td>
      <td><select name={`${key}.status`} defaultValue="skip"><option value="skip">— non rilevato —</option>{schema.statuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}</select></td>
      <td>{spec.kind === 'enum'
       ? <select name={`${key}.value`} defaultValue=""><option value="">—</option>{spec.values.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}</select>
       : <input name={`${key}.value`} inputMode="decimal" size={8} />}</td>
      <td><select name={`${key}.source`} defaultValue="inspection">{schema.sources.map(s => <option key={s} value={s}>{SOURCE_LABEL[s] ?? s}</option>)}</select></td>
      <td><input name={`${key}.note`} maxLength={1000} size={30} /></td>
     </tr>)}
    </tbody></table>
    <p><label>Note generali<br /><textarea name="generalNotes" maxLength={4000} rows={4} cols={80} /></label></p>
    <p><label><input type="checkbox" name="declaration" required /> Dichiaro di aver effettuato personalmente il sopralluogo e che i valori indicati come verificati sono stati da me accertati.</label></p>
    <button style={btn} type="submit">Invia verbale (non modificabile)</button>
   </form>
  </section> : null}
 </>;
}
