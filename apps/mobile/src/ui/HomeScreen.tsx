import React, { useEffect, useState } from 'react';
import { API_BASE, deleteAccount, getSession, logout, serverEnabled } from '../server';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, S, shadow } from './theme';
import { Button, Card, ClassBadge, IconCircle, Pill, ProgressBar, SectionTitle, tap } from './kit';
import { estimate } from '../energy/estimate';
import { progress } from '../survey/checklist';
import { PROVINCES } from '../survey/questions';
import { PRICE_LIST, euro } from '../pricing';
import type { AppState, Draft } from '../survey/drafts';

const STEPS_HOW = [
 { icon: 'chatbubbles-outline', title: 'Rispondi e scatta', text: 'Domande semplici e qualche foto: caldaia, finestre, muri, planimetria.' },
 { icon: 'analytics-outline', title: 'Stima immediata', text: 'Vedi subito la classe probabile e dove migliorare.' },
 { icon: 'shield-checkmark-outline', title: 'Certificatore accreditato', text: 'Un professionista SACE fa il sopralluogo, firma e deposita l’APE.' },
] as const;

export function HomeScreen({ state, onNew, onOpen, onDelete, onPro }: { state: AppState; onNew: () => void; onOpen: (d: Draft) => void; onDelete: (d: Draft) => void; onPro: () => void }) {
 const insets = useSafeAreaInsets();
 const minPrice = Math.min(...PRICE_LIST.tiers.map(t => t.price));
 const [email, setEmail] = useState<string | null>(null);
 useEffect(() => { if (serverEnabled()) getSession().then(s => setEmail(s?.email ?? null)); }, [state]);
 const removeAccount = () => Alert.alert('Eliminare l’account?', 'Verranno cancellati accesso, dati di contatto e richieste non ancora inviate. Le pratiche già seguite da un certificatore restano solo per gli obblighi di legge, senza collegamento al tuo account.', [
  { text: 'Annulla', style: 'cancel' },
  { text: 'Elimina', style: 'destructive', onPress: () => deleteAccount().then(() => { setEmail(null); Alert.alert('Account eliminato'); }).catch(() => Alert.alert('Errore', 'Riprova tra poco.')) },
 ]);
 return (
  <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
   <LinearGradient colors={[C.brandDeep, C.brand, '#14806A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.hero, { paddingTop: insets.top + 18 }]}>
    <View style={st.brandRow}>
     <View style={st.logo}><Ionicons name="leaf" size={18} color={C.brandDeep} /></View>
     <Text style={st.brand}>APE Italia</Text>
     <View style={st.region}><Text style={st.regionText}>Emilia-Romagna</Text></View>
    </View>
    <Text style={st.heroTitle}>Il tuo APE,{'\n'}senza pensieri.</Text>
    <Text style={st.heroText}>Rispondi a poche domande, scatta le foto giuste e ricevi subito una stima della classe energetica. Al resto pensa un certificatore accreditato.</Text>
    <View style={st.scaleRow}>
     {(['A4', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'] as const).map(c => <ClassBadge key={c} value={c} size={22} />)}
    </View>
    <Button title="Richiedi il tuo APE" icon="arrow-forward" onPress={onNew} style={{ backgroundColor: C.white, marginTop: S.l }} kind="secondary" />
    <Text style={st.priceNote}>Prezzo fisso da {euro(minPrice)} · sopralluogo, IVA e deposito SACE inclusi</Text>
   </LinearGradient>

   <View style={{ paddingHorizontal: S.m }}>
    {state.drafts.length ? (<>
     <SectionTitle>Le tue richieste</SectionTitle>
     {state.drafts.map(d => <DraftCard key={d.id} d={d} onOpen={() => onOpen(d)} onDelete={() => onDelete(d)} />)}
    </>) : null}

    <SectionTitle>Come funziona</SectionTitle>
    <Card>
     {STEPS_HOW.map((s, i) => (
      <View key={s.title} style={[st.how, i < STEPS_HOW.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }]}>
       <IconCircle name={s.icon} />
       <View style={{ flex: 1, marginLeft: 12 }}><Text style={F.h3}>{s.title}</Text><Text style={[F.small, { marginTop: 2 }]}>{s.text}</Text></View>
      </View>
     ))}
    </Card>

    <SectionTitle>Sei un certificatore energetico?</SectionTitle>
    <Card onPress={onPro} style={{ flexDirection: 'row', alignItems: 'center' }}>
     <IconCircle name="briefcase-outline" bg={C.warnSoft} color="#8A5A00" />
     <View style={{ flex: 1, marginLeft: 12 }}>
      <Text style={F.h3}>Ricevi incarichi nella tua zona</Text>
      <Text style={[F.small, { marginTop: 2 }]}>{state.pro ? (state.pro.status === 'inviata_al_server' ? 'Candidatura ricevuta: in verifica sull’elenco SACE' : 'Candidatura salvata sul telefono (versione di prova)') : 'Fascicoli già pronti, sopralluoghi mirati. Serve l’accreditamento SACE.'}</Text>
     </View>
     <Ionicons name="chevron-forward" size={20} color={C.muted} />
    </Card>
    {email ? (<>
     <SectionTitle>Il tuo account</SectionTitle>
     <Card>
      <Text style={F.h3}>{email}</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
       <Button title="Esci" kind="secondary" icon="log-out-outline" onPress={() => logout().then(() => setEmail(null))} style={{ flex: 1 }} />
       <Button title="Elimina account" kind="danger" icon="trash-outline" onPress={removeAccount} style={{ flex: 1 }} />
      </View>
     </Card>
    </>) : null}
    {serverEnabled() ? (
     <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: S.l }}>
      <Pressable onPress={() => WebBrowser.openBrowserAsync(`${API_BASE}/privacy`)} hitSlop={8}><Text style={{ color: C.brand, fontWeight: '700' }}>Privacy</Text></Pressable>
      <Pressable onPress={() => WebBrowser.openBrowserAsync(`${API_BASE}/termini`)} hitSlop={8}><Text style={{ color: C.brand, fontWeight: '700' }}>Termini</Text></Pressable>
     </View>
    ) : null}
    <Text style={[F.small, { textAlign: 'center', marginTop: S.l }]}>La stima dell’app non sostituisce l’APE: l’attestato è redatto e firmato solo da un certificatore accreditato dopo il sopralluogo.</Text>
   </View>
  </ScrollView>
 );
}

function DraftCard({ d, onOpen, onDelete }: { d: Draft; onOpen: () => void; onDelete: () => void }) {
 const est = estimate(d.answers);
 const p = progress(d.answers, d.photos);
 const prov = PROVINCES.find(x => x.value === d.answers.province)?.label;
 const title = [d.answers.street, d.answers.municipality].filter(Boolean).join(', ') || 'Nuova richiesta';
 return (
  <Pressable onPress={() => { tap(); onOpen(); }} onLongPress={() => Alert.alert('Eliminare la richiesta?', 'Foto e risposte verranno cancellate dal telefono.', [{ text: 'Annulla', style: 'cancel' }, { text: 'Elimina', style: 'destructive', onPress: onDelete }])}
   style={({ pressed }) => [st.draft, pressed && { opacity: 0.92 }]}>
   <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    {est ? <ClassBadge value={est.energyClass} size={40} estimate /> : <IconCircle name="home-outline" size={44} />}
    <View style={{ flex: 1, marginLeft: 12 }}>
     <Text style={F.h3} numberOfLines={1}>{title}</Text>
     <Text style={F.small}>{[est ? `classe indicativa ${est.energyClass}` : null, prov, typeof d.answers.floorArea === 'number' ? `${d.answers.floorArea} m²` : null].filter(Boolean).join(' · ') || 'Da completare'}</Text>
    </View>
    {d.job?.status === 'consegnata' ? <Pill text="APE pronto" icon="ribbon-outline" /> : d.job?.status === 'accettata' ? <Pill text="Assegnata" icon="person-outline" /> : d.status === 'inviata' ? <Pill text="Inviata" icon="paper-plane" /> : d.status === 'pronta' ? <Pill tone="warn" text="Pronta" /> : <Pill tone="muted" text={`${p.done}/${p.total}`} />}
   </View>
   {d.status === 'bozza' ? <View style={{ marginTop: 12 }}><ProgressBar ratio={p.ratio} /></View> : null}
  </Pressable>
 );
}

const st = StyleSheet.create({
 hero: { paddingHorizontal: S.m, paddingBottom: S.l, borderBottomLeftRadius: R.xl, borderBottomRightRadius: R.xl },
 brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: S.l },
 logo: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#B8F0D3', alignItems: 'center', justifyContent: 'center' },
 brand: { color: C.white, fontSize: 18, fontWeight: '800', marginLeft: 8, flex: 1 },
 region: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5 },
 regionText: { color: C.white, fontSize: 12, fontWeight: '700' },
 heroTitle: { color: C.white, fontSize: 36, lineHeight: 41, fontWeight: '800', letterSpacing: -0.8 },
 heroText: { color: 'rgba(255,255,255,0.86)', fontSize: 15, lineHeight: 21, marginTop: 10 },
 scaleRow: { flexDirection: 'row', gap: 6, marginTop: S.l },
 priceNote: { color: 'rgba(255,255,255,0.8)', fontSize: 12, textAlign: 'center', marginTop: 10, fontWeight: '600' },
 how: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
 draft: { backgroundColor: C.surface, borderRadius: R.l, padding: S.m, marginBottom: 10, ...shadow },
});
