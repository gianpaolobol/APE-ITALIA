import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, shadow, R } from './theme';
import { Card, ClassBadge, IconCircle, Pill, SectionTitle, tap } from './kit';
import { estimate } from '../energy/estimate';
import { PROVINCES } from '../survey/questions';
import { euro, quote } from '../pricing';
import { fmtWhen } from '../job';
import type { AppState, Draft } from '../survey/drafts';

/** Certifier inbox. Until the server is online it shows the requests created on this phone (demo). */
export function InboxScreen({ state, onBack, onOpen }: { state: AppState; onBack: () => void; onOpen: (d: Draft) => void }) {
 const insets = useSafeAreaInsets();
 const pro = state.pro!.data;
 const mine = state.drafts.filter(d => d.status !== 'bozza' && d.job?.status !== 'rifiutata' && (!d.answers.province || pro.provinces.includes(String(d.answers.province))));
 const nuove = mine.filter(d => !d.job || d.job.status === 'nuova');
 const attive = mine.filter(d => d.job?.status === 'accettata');
 const chiuse = mine.filter(d => d.job?.status === 'consegnata');
 return (
  <View style={{ flex: 1, backgroundColor: C.bg }}>
   <View style={[st.top, { paddingTop: insets.top + 6 }]}>
    <Pressable accessibilityLabel="Indietro" hitSlop={12} onPress={() => { tap(); onBack(); }} style={st.round}><Ionicons name="chevron-back" size={22} color={C.ink} /></Pressable>
    <Text style={st.topTitle}>Richieste in arrivo</Text>
    <View style={{ width: 40 }} />
   </View>
   <ScrollView contentContainerStyle={{ padding: S.m, paddingBottom: insets.bottom + 30 }}>
    <Card style={{ flexDirection: 'row', backgroundColor: C.warnSoft }}>
     <Ionicons name="flask-outline" size={20} color="#8A5A00" />
     <Text style={[F.small, { flex: 1, marginLeft: 10, color: '#6B4700' }]}>Modalità dimostrativa: qui vedi le richieste inviate da questo telefono, esattamente come le riceverà il certificatore. Con il server attivo arriveranno dai clienti delle tue province ({pro.provinces.join(', ')}).</Text>
    </Card>
    <Section title={`Nuove · ${nuove.length}`} items={nuove} onOpen={onOpen} empty="Nessuna nuova richiesta. Crea una richiesta dalla home e inviala per vederla qui." />
    <Section title={`In corso · ${attive.length}`} items={attive} onOpen={onOpen} />
    <Section title={`Consegnate · ${chiuse.length}`} items={chiuse} onOpen={onOpen} />
   </ScrollView>
  </View>
 );
}

function Section({ title, items, onOpen, empty }: { title: string; items: Draft[]; onOpen: (d: Draft) => void; empty?: string }) {
 if (!items.length && !empty) return null;
 return (<>
  <SectionTitle>{title}</SectionTitle>
  {items.length ? items.map(d => <Row key={d.id} d={d} onOpen={() => onOpen(d)} />) : <Text style={F.small}>{empty}</Text>}
 </>);
}

function Row({ d, onOpen }: { d: Draft; onOpen: () => void }) {
 const e = estimate(d.answers); const q = quote(d.answers);
 const prov = PROVINCES.find(p => p.value === d.answers.province)?.label;
 const j = d.job;
 const next = !j || j.status === 'nuova' ? 'Da valutare' : j.status === 'consegnata' ? 'APE consegnato' : j.verbale ? 'Carica l’APE' : j.visit ? `Sopralluogo ${fmtWhen(j.visit.at)}` : j.call ? `Videochiamata ${fmtWhen(j.call.at)}` : 'Fissa l’appuntamento';
 return (
  <Pressable onPress={() => { tap(); onOpen(); }} style={({ pressed }) => [st.row, pressed && { opacity: 0.9 }]}>
   {e ? <ClassBadge value={e.energyClass} size={38} estimate /> : <IconCircle name="home-outline" />}
   <View style={{ flex: 1, marginLeft: 12 }}>
    <Text style={F.h3} numberOfLines={1}>{String(d.answers.municipality ?? 'Comune')} {prov ? `(${prov})` : ''}</Text>
    <Text style={F.small} numberOfLines={1}>{[typeof d.answers.floorArea === 'number' ? `${d.answers.floorArea} m²` : null, d.answers.urgency === 'urgente' ? 'urgente' : null, next].filter(Boolean).join(' · ')}</Text>
   </View>
   {q ? <Pill text={euro(q.certifierPayout)} /> : null}
  </Pressable>
 );
}

const st = StyleSheet.create({
 top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.m, paddingBottom: 10 },
 round: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
 topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: C.ink },
 row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.l, padding: S.m, marginBottom: 10, ...shadow },
});
