import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { ApiError, type ApeApi } from '../api';
import { KIND_LABELS, PDF_KINDS, countByKind, precheckFile, type EvidenceKind, type EvidenceRecord, type PickedFile } from '../evidence';
import { PermissionDeniedError, pickDocument, pickImage, takePhoto } from '../pickers';

type Props = {
 api: ApeApi | null;
 caseId?: string;
 kinds: EvidenceKind[];
 consented: boolean;
 consentVersion?: string;
 onConsent: () => Promise<void>;
 items: EvidenceRecord[];
 onUploaded: (item: EvidenceRecord) => void;
};

export function EvidenceStep({ api, caseId, kinds, consented, consentVersion, onConsent, items, onUploaded }: Props) {
 const [busy, setBusy] = useState<EvidenceKind | 'consent' | null>(null);
 const counts = countByKind(items);
 if (!api || !caseId) {
  return <Text style={st.body}>Per allegare fotografie e documenti accedi e crea la pratica in bozza al primo passaggio.</Text>;
 }
 if (!consented) {
  return <View style={st.box}>
   <Text style={st.title}>Informativa sul trattamento delle immagini e dei documenti</Text>
   <Text style={st.body}>Le fotografie e i documenti servono al certificatore abilitato per preparare il sopralluogo e il calcolo. Sono conservati cifrati, accessibili solo alla tua organizzazione e al certificatore incaricato; i metadati di posizione delle foto JPEG vengono rimossi. Testo in bozza (versione {consentVersion ?? '—'}), in attesa di revisione legale.</Text>
   <TouchableOpacity accessibilityRole="button" disabled={busy !== null} style={[st.btn, st.primary]} onPress={async () => {
    setBusy('consent');
    try { await onConsent(); } catch { Alert.alert('Consenso non registrato', 'Riprova più tardi.'); } finally { setBusy(null); }
   }}><Text style={st.white}>{busy === 'consent' ? 'Attendere' : 'Ho letto e acconsento'}</Text></TouchableOpacity>
  </View>;
 }
 const send = async (kind: EvidenceKind, pick: () => Promise<PickedFile | null>) => {
  if (busy) return;
  setBusy(kind);
  try {
   const file = await pick();
   if (!file) return;
   const problem = precheckFile(kind, file);
   if (problem) { Alert.alert('File non accettato', problem); return; }
   onUploaded(await api.uploadEvidence(caseId, kind, file));
  } catch (e) {
   if (e instanceof PermissionDeniedError) Alert.alert('Permesso negato', 'Abilita la fotocamera dalle impostazioni del telefono.');
   else Alert.alert('Caricamento non riuscito', e instanceof ApiError ? e.message : 'Errore imprevisto');
  } finally { setBusy(null); }
 };
 return <View style={{ gap: 14 }}>
  {kinds.map(kind => <View key={kind} style={st.box}>
   <Text style={st.title}>{KIND_LABELS[kind]} · {counts[kind] ?? 0} caricati</Text>
   <View style={st.row}>
    <TouchableOpacity accessibilityRole="button" disabled={busy !== null} style={[st.btn, st.primary]} onPress={() => send(kind, takePhoto)}><Text style={st.white}>{busy === kind ? 'Invio…' : 'Scatta foto'}</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={busy !== null} style={st.btn} onPress={() => send(kind, PDF_KINDS.includes(kind) ? pickDocument : pickImage)}><Text>{PDF_KINDS.includes(kind) ? 'Scegli file' : 'Dalla galleria'}</Text></TouchableOpacity>
   </View>
  </View>)}
  <Text style={st.note}>Le foto non sostituiscono il sopralluogo: il certificatore verificherà i dati sul posto.</Text>
 </View>;
}

const st = StyleSheet.create({
 box: { backgroundColor: '#fff', borderColor: '#cad8d0', borderWidth: 1, borderRadius: 10, padding: 14, gap: 10 },
 title: { fontWeight: '700', fontSize: 16 },
 body: { fontSize: 15, lineHeight: 22 },
 note: { fontSize: 13, color: '#586b61' },
 row: { flexDirection: 'row', gap: 10 },
 btn: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 9, backgroundColor: '#e5ece8' },
 primary: { backgroundColor: '#176344' },
 white: { color: '#fff', fontWeight: '700' },
});
