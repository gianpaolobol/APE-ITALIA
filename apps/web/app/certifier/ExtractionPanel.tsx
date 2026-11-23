import React from 'react';
import type { ExtractedFieldView, InspectionSchema } from '../../lib/api';
import { reviewExtracted } from './actions';
import { box, btn, btnLight } from '../ui';

const STATUS: Record<string, string> = { needs_review: 'Da revisionare', accepted: 'Accettato', corrected: 'Corretto', rejected: 'Respinto' };

/** Candidates are suggestions: the certifier decides, and the decision is recorded with history. */
export function ExtractionPanel({ assignmentId, fields, schema }: { assignmentId: string; fields: ExtractedFieldView[]; schema: InspectionSchema }) {
 if (!fields.length) return null;
 return <section style={box}>
  <h2>Valori proposti dall'estrazione automatica</h2>
  <p>Proposte da verificare: non sono dati accertati. Accetta, correggi o respingi; ogni decisione è registrata.</p>
  <table cellPadding={4}><thead><tr><th align="left">Voce</th><th align="left">Valore proposto</th><th>Confidenza</th><th>Stato</th><th></th></tr></thead><tbody>
   {fields.map(f => { const spec = schema.fields[f.field]; return <tr key={f.id}>
    <td>{spec?.label ?? f.field}</td>
    <td>{String(f.value)}{f.unit ? ' ' + f.unit : ''}</td>
    <td>{f.confidence === null ? '—' : Math.round(f.confidence * 100) + '%'}</td>
    <td>{STATUS[f.status]}</td>
    <td>{f.status === 'needs_review' ? <div style={{ display: 'flex', gap: 6 }}>
     <form action={reviewExtracted}><input type="hidden" name="id" value={assignmentId} /><input type="hidden" name="fieldId" value={f.id} /><input type="hidden" name="action" value="accept" /><button style={btn} type="submit">Accetta</button></form>
     <form action={reviewExtracted} style={{ display: 'flex', gap: 4 }}><input type="hidden" name="id" value={assignmentId} /><input type="hidden" name="fieldId" value={f.id} /><input type="hidden" name="action" value="correct" /><input type="hidden" name="numeric" value={spec?.kind === 'number' ? '1' : '0'} />
      {spec?.kind === 'enum' ? <select name="value" required>{spec.values.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}</select> : <input name="value" required size={6} inputMode="decimal" />}
      <button style={btnLight} type="submit">Correggi</button></form>
     <form action={reviewExtracted} style={{ display: 'flex', gap: 4 }}><input type="hidden" name="id" value={assignmentId} /><input type="hidden" name="fieldId" value={f.id} /><input type="hidden" name="action" value="reject" /><input name="note" required minLength={3} placeholder="Motivo" size={14} /><button style={btnLight} type="submit">Respingi</button></form>
    </div> : null}</td>
   </tr>; })}
  </tbody></table>
 </section>;
}
