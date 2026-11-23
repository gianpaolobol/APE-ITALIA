import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import type { ApeApi } from '../api';
import type { EvidenceKind, EvidenceRecord } from '../evidence';
import { EvidenceStep } from './EvidenceStep';

type Req = { id: string; message: string; kinds: EvidenceKind[]; resolvedAt: string | null };

/** Lets the customer upload what the certifier asked for and then confirm, resuming the case. */
export function EvidenceRequestPanel({ api, caseId, onDone }: { api: ApeApi; caseId: string; onDone: () => void }) {
 const [reqs, setReqs] = useState<Req[] | null>(null);
 const [consentVersion, setConsentVersion] = useState<string>();
 const [consented, setConsented] = useState(false);
 const [items, setItems] = useState<EvidenceRecord[]>([]);
 const [busy, setBusy] = useState(false);
 useEffect(() => {
  Promise.all([api.evidenceRequests(caseId), api.getNotices(), api.listEvidence(caseId)])
   .then(([r, n, ev]) => { setReqs(r.filter(x => !x.resolvedAt)); setConsentVersion(n.evidence_processing); setItems(ev); })
   .catch(() => setReqs([]));
 }, [api, caseId]);
 if (!reqs) return <ActivityIndicator />;
 if (!reqs.length) return <Text>Nessuna richiesta aperta.</Text>;
 const kinds = [...new Set(reqs.flatMap(r => r.kinds))];
 return <View style={{ gap: 10 }}>
  {reqs.map(r => <Text key={r.id} style={st.msg}>«{r.message}»</Text>)}
  <EvidenceStep api={api} caseId={caseId} kinds={kinds} consented={consented} consentVersion={consentVersion}
   onConsent={async () => { await api.giveConsent(caseId, consentVersion!); setConsented(true); }} items={items} onUploaded={i => setItems(v => [...v, i])} />
  <TouchableOpacity accessibilityRole="button" disabled={busy} style={st.btn} onPress={async () => {
   setBusy(true);
   try { for (const r of reqs) await api.resolveEvidenceRequest(caseId, r.id); onDone(); }
   catch { Alert.alert('Conferma non registrata', 'Riprova più tardi.'); }
   finally { setBusy(false); }
  }}><Text style={st.white}>{busy ? 'Attendere' : 'Ho caricato quanto richiesto'}</Text></TouchableOpacity>
 </View>;
}
const st = StyleSheet.create({
 msg: { fontStyle: 'italic', fontSize: 15 },
 btn: { padding: 12, alignItems: 'center', borderRadius: 9, backgroundColor: '#176344' },
 white: { color: '#fff', fontWeight: '700' },
});
