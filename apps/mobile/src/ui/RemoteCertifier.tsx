import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, S, shadow } from './theme';
import { Button, ClassBadge, IconCircle, Pill, SectionTitle, tap } from './kit';
import { JobScreen, type JobOps } from './JobScreen';
import { PROVINCES } from '../survey/questions';
import { euro } from '../pricing';
import { fmtWhen } from '../job';
import { acceptAssignment, declineAssignment, deliverCertificate, listAssignments, loadDossier, offerDraft, resolveVideo, scheduleCall, scheduleVisit, submitReport, type RemoteAssignment } from '../certifier-remote';
import type { Draft } from '../survey/drafts';
import type { ProRegistration } from '../pro/registration';

type Me = { name: string; sace: string };

/** Certifier inbox and job screens backed by the server. */
export function RemoteCertifier({ me, onBack, onLogout }: { me: Me; onBack: () => void; onLogout: () => void }) {
 const insets = useSafeAreaInsets();
 const [items, setItems] = useState<RemoteAssignment[] | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [open, setOpen] = useState<RemoteAssignment | null>(null);
 const [loading, setLoading] = useState(false);
 const load = useCallback(async () => {
  setLoading(true); setError(null);
  try { setItems(await listAssignments()); } catch (e) { setError(e instanceof Error ? e.message : 'Errore'); } finally { setLoading(false); }
 }, []);
 useEffect(() => { load(); }, [load]);

 if (open) return <RemoteJob a={open} me={me} onBack={() => { setOpen(null); load(); }} />;
 const offers = (items ?? []).filter(a => a.status === 'OFFERED');
 const active = (items ?? []).filter(a => a.status === 'ACCEPTED');
 return (
  <View style={{ flex: 1, backgroundColor: C.bg }}>
   <View style={[st.top, { paddingTop: insets.top + 6 }]}>
    <Pressable accessibilityLabel="Indietro" hitSlop={12} onPress={() => { tap(); onBack(); }} style={st.round}><Ionicons name="chevron-back" size={22} color={C.ink} /></Pressable>
    <Text style={st.topTitle}>I miei incarichi</Text>
    <Pressable accessibilityLabel="Esci" hitSlop={12} onPress={onLogout} style={st.round}><Ionicons name="log-out-outline" size={20} color={C.ink} /></Pressable>
   </View>
   <ScrollView contentContainerStyle={{ padding: S.m, paddingBottom: insets.bottom + 30 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
    <Text style={F.small}>{me.name} · SACE n. {me.sace}</Text>
    {error ? <Text style={{ color: C.danger, marginTop: 10 }}>{error}</Text> : null}
    {!items && !error ? <ActivityIndicator style={{ marginTop: 40 }} color={C.brand} /> : null}
    <SectionTitle>Nuove proposte · {offers.length}</SectionTitle>
    {offers.length ? offers.map(a => <Row key={a.id} a={a} onPress={() => setOpen(a)} />) : <Text style={F.small}>Nessuna proposta al momento. Tira giù per aggiornare.</Text>}
    <SectionTitle>In corso · {active.length}</SectionTitle>
    {active.map(a => <Row key={a.id} a={a} onPress={() => setOpen(a)} />)}
   </ScrollView>
  </View>
 );
}

function Row({ a, onPress }: { a: RemoteAssignment; onPress: () => void }) {
 const s = a.summary;
 const prov = PROVINCES.find(p => p.value === s.province)?.label;
 const next = a.status === 'OFFERED' ? `Scade ${fmtWhen(a.expiresAt)}` : a.caseStatus === 'INSPECTION_SCHEDULED' ? 'Sopralluogo fissato' : a.caseStatus === 'INSPECTION_DONE' ? 'Carica l’APE' : ['DEPOSITED', 'DELIVERED'].includes(a.caseStatus) ? 'APE consegnato' : a.call ? `Videochiamata ${fmtWhen(a.call.at)}` : 'Fissa l’appuntamento';
 return (
  <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => [st.row, pressed && { opacity: 0.9 }]}>
   {s.estimatedClass ? <ClassBadge value={s.estimatedClass as never} size={38} estimate /> : <IconCircle name="home-outline" />}
   <View style={{ flex: 1, marginLeft: 12 }}>
    <Text style={F.h3} numberOfLines={1}>{a.property.city}{prov ? ` (${prov})` : ''}</Text>
    <Text style={F.small} numberOfLines={1}>{[typeof s.floorArea === 'number' ? `${s.floorArea} m²` : null, s.urgency === 'urgente' ? 'urgente' : null, next].filter(Boolean).join(' · ')}</Text>
   </View>
   {typeof s.payout === 'number' ? <Pill text={euro(s.payout)} /> : null}
  </Pressable>
 );
}

function RemoteJob({ a, me, onBack }: { a: RemoteAssignment; me: Me; onBack: () => void }) {
 const [draft, setDraft] = useState<Draft | null>(a.status === 'ACCEPTED' ? null : offerDraft(a));
 const [assignment, setAssignment] = useState(a);
 const [error, setError] = useState<string | null>(null);
 const reload = useCallback(async (as: RemoteAssignment) => {
  try {
   const fresh = (await listAssignments()).find(x => x.id === as.id) ?? as;
   setAssignment(fresh);
   setDraft(fresh.status === 'ACCEPTED' ? await loadDossier(fresh, me) : offerDraft(fresh));
  } catch (e) { setError(e instanceof Error ? e.message : 'Errore'); }
 }, [me]);
 useEffect(() => { if (a.status === 'ACCEPTED') reload(a); }, []); // eslint-disable-line react-hooks/exhaustive-deps
 if (error) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text style={{ color: C.danger, textAlign: 'center' }}>{error}</Text><Button title="Indietro" kind="secondary" onPress={onBack} style={{ marginTop: 16 }} /></View>;
 if (!draft) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.brand} /><Text style={[F.small, { marginTop: 10 }]}>Scarico il fascicolo…</Text></View>;
 const ops: JobOps = {
  accept: async () => { await acceptAssignment(assignment.id); await reload(assignment); },
  decline: async () => { await declineAssignment(assignment.id); },
  call: async at => { await scheduleCall(assignment.id, at); await reload(assignment); },
  visit: async at => { await scheduleVisit(assignment.id, at); await reload(assignment); },
  verbale: async v => { await submitReport(assignment.id, draft.answers, v); await reload(assignment); },
  deliver: async (code, cls, pdf) => { await deliverCertificate(assignment.id, code, cls, pdf); await reload(assignment); },
  videoUri: resolveVideo,
 };
 const pro = { firstName: me.name, lastName: '', saceNumber: me.sace } as ProRegistration;
 return <JobScreen draft={draft} pro={pro} onBack={onBack} onUpdate={fn => setDraft(d => (d ? fn(d) : d))} ops={ops} remote />;
}

const st = StyleSheet.create({
 top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.m, paddingBottom: 10 },
 round: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
 topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: C.ink },
 row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.l, padding: S.m, marginBottom: 10, ...shadow },
});
