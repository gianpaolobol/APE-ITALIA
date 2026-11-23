import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import type { ApeApi } from '../api';
import { PROGRESS, loadCaseSummaries, type CaseSummary } from '../cases';
import { EvidenceRequestPanel } from './EvidenceRequestPanel';

const fmt = (d: string) => new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function CaseList({ api }: { api: ApeApi | null }) {
 const [items, setItems] = useState<CaseSummary[] | null>(null);
 const [error, setError] = useState(false);
 const [open, setOpen] = useState<string | null>(null);
 const load = useCallback(async () => {
  if (!api) return;
  setError(false);
  try { setItems(await loadCaseSummaries(api)); } catch { setError(true); }
 }, [api]);
 useEffect(() => { load(); }, [load]);
 if (!api) return <Text style={st.body}>Accedi per vedere le tue pratiche.</Text>;
 if (error) return <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={st.body}>Impossibile caricare le pratiche. Tocca per riprovare.</Text></TouchableOpacity>;
 if (!items) return <ActivityIndicator />;
 if (!items.length) return <Text style={st.body}>Nessuna pratica ancora.</Text>;
 return <View style={{ gap: 12 }}>
  {items.map(c => <View key={c.id} style={st.box} accessible accessibilityLabel={`${c.property.address}, ${c.label}`}>
   <Text style={st.title}>{c.property.address}, {c.property.city}</Text>
   <Text>{c.label}</Text>
   <View style={st.bar}>{PROGRESS.map((_, i) => <View key={i} style={[st.seg, i <= c.step && st.done]} />)}</View>
   {c.inspection ? <Text style={st.small}>{c.inspection.status === 'DONE' && c.inspection.performedAt ? `Sopralluogo eseguito il ${fmt(c.inspection.performedAt)}` : `Sopralluogo: ${fmt(c.inspection.scheduledAt)}`} · {c.inspection.certifierName}</Text> : null}
   {c.openEvidenceRequests > 0 ? (open === c.id
    ? <EvidenceRequestPanel api={api} caseId={c.id} onDone={() => { setOpen(null); load(); }} />
    : <TouchableOpacity accessibilityRole="button" onPress={() => setOpen(c.id)}><Text style={st.link}>Il certificatore ha richiesto integrazioni: carica i documenti</Text></TouchableOpacity>) : null}
   {c.certificate ? <Text style={st.small}>APE n. {c.certificate.regionalId}, depositato il {fmt(c.certificate.depositedAt)}. Scaricalo dal portale web nell'area della tua organizzazione.</Text> : null}
  </View>)}
  <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={st.link}>Aggiorna</Text></TouchableOpacity>
 </View>;
}

const st = StyleSheet.create({
 box: { backgroundColor: '#fff', borderColor: '#cad8d0', borderWidth: 1, borderRadius: 10, padding: 14, gap: 6 },
 title: { fontWeight: '700', fontSize: 16 },
 body: { fontSize: 15, lineHeight: 22 },
 small: { fontSize: 13, color: '#3f5249' },
 link: { color: '#176344', fontWeight: '700' },
 bar: { flexDirection: 'row', gap: 4, marginVertical: 4 },
 seg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#e5ece8' },
 done: { backgroundColor: '#176344' },
});
