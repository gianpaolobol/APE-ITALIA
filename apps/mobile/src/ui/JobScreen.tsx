import React, { useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Sharing from 'expo-sharing';
import { C, F, R, S } from './theme';
import { Button, Card, Chips, ClassBadge, Field, IconCircle, Label, Pill, SectionTitle, ToggleRow, tap } from './kit';
import { SlotPicker } from './SlotPicker';
import { estimate, CLASSES } from '../energy/estimate';
import { checklist } from '../survey/checklist';
import { PROVINCES, findQuestion, type PhotoRef } from '../survey/questions';
import { quote, euro } from '../pricing';
import { APE_CODE, VERBALE_CHECKS, canDeliver, dossier, fmtWhen, newCallUrl, verbaleErrors, type Job, type Verbale } from '../job';
import { pickDocument } from '../pickers';
import { persistPhoto, type Draft } from '../survey/drafts';
import type { ProRegistration } from '../pro/registration';
import { KIND_LABELS } from '../evidence';

/** Actions on a job: local (demo on this phone) or remote (server). Each returns when persisted. */
export type JobOps = {
 accept(): Promise<void>; decline(): Promise<void>; call(at: string): Promise<void>; visit(at: string): Promise<void>;
 verbale(v: Verbale): Promise<void>; deliver(code: string, cls: string, pdf: { uri: string; name: string; mimeType: string }): Promise<void>;
 videoUri?(uri: string): Promise<string>;
};
type Props = { draft: Draft; pro: ProRegistration; onBack: () => void; onUpdate: (fn: (d: Draft) => Draft) => void; ops?: JobOps; remote?: boolean };

export function JobScreen({ draft, pro, onBack, onUpdate, ops: remoteOps, remote }: Props) {
 const insets = useSafeAreaInsets();
 const a = draft.answers;
 const job = draft.job;
 const accepted = job?.status === 'accettata' || job?.status === 'consegnata';
 const est = useMemo(() => estimate(a), [a]);
 const q = quote(a);
 const prov = PROVINCES.find(p => p.value === a.province)?.label ?? '';
 const media = Object.entries(draft.photos).flatMap(([qid, list]) => (list ?? []).map(p => ({ qid, p })));
 const videos = media.filter(m => m.p.mimeType.startsWith('video/'));
 const images = media.filter(m => m.p.mimeType.startsWith('image/'));
 const pdfs = media.filter(m => m.p.mimeType === 'application/pdf');
 const missing = checklist(a, draft.photos).filter(i => i.required && !i.done);
 const tq = findQuestion('propertyType');
 const typeLabel = (tq && tq.kind === 'choice' ? tq.options.find(o => o.value === a.propertyType)?.label : undefined) ?? 'Immobile';
 const [viewer, setViewer] = useState<PhotoRef | null>(null);
 const [player, setPlayer] = useState<PhotoRef | null>(null);
 const setJob = (fn: (j: Job) => Job) => onUpdate(d => ({ ...d, job: fn(d.job ?? { status: 'nuova', certifier: { name: `${pro.firstName} ${pro.lastName}`, sace: pro.saceNumber } }) }));

 const localOps: JobOps = {
  accept: async () => setJob(j => ({ ...j, status: 'accettata', acceptedAt: new Date().toISOString(), certifier: { name: `${pro.firstName} ${pro.lastName}`, sace: pro.saceNumber } })),
  decline: async () => setJob(j => ({ ...j, status: 'rifiutata' })),
  call: async at => setJob(j => ({ ...j, call: { at, url: j.call?.url ?? newCallUrl() } })),
  visit: async at => setJob(j => ({ ...j, visit: { at } })),
  verbale: async v => setJob(j => ({ ...j, verbale: v })),
  deliver: async (code, cls, pdf) => { const ref = persistPhoto(draft.id, pdf); setJob(j => ({ ...j, status: 'consegnata', ape: { code, energyClass: cls, pdf: ref, deliveredAt: new Date().toISOString() } })); },
 };
 const ops = remoteOps ?? localOps;
 const [busy, setBusy] = useState(false);
 const run = async (f: () => Promise<void>, ok?: string) => {
  if (busy) return;
  setBusy(true);
  try { await f(); if (ok) Alert.alert(ok); }
  catch (e) { Alert.alert('Operazione non riuscita', e instanceof Error ? e.message : 'Riprova.'); }
  finally { setBusy(false); }
 };
 const accept = () => run(ops.accept);
 const decline = () => Alert.alert('Rifiutare l’incarico?', 'La richiesta verrà proposta a un altro certificatore della zona.', [{ text: 'Annulla', style: 'cancel' }, { text: 'Rifiuta', style: 'destructive', onPress: () => run(async () => { await ops.decline(); onBack(); }) }]);
 const caption = (qid: string) => findQuestion(qid)?.label ?? KIND_LABELS[qid.replace('kind:', '') as keyof typeof KIND_LABELS] ?? '';
 const invite = (kind: 'call' | 'visit', at: string, url?: string) => {
  const name = String(a.fullName ?? '').split(' ')[0];
  const msg = kind === 'call'
   ? `Buongiorno ${name}, sono ${pro.firstName} ${pro.lastName}, certificatore energetico (accreditamento SACE n. ${pro.saceNumber}). Le propongo una breve videochiamata di pre-sopralluogo per l’APE di ${a.street ?? ''}: ${fmtWhen(at)}.\nCollegamento: ${url}\nTenga a portata di mano libretto della caldaia e documenti. Il sopralluogo in presenza resta necessario e lo fissiamo insieme.`
   : `Buongiorno ${name}, confermo il sopralluogo per l’APE di ${a.street ?? ''}, ${a.municipality ?? ''}: ${fmtWhen(at)}. Durata prevista 30–45 minuti. ${pro.firstName} ${pro.lastName}, certificatore SACE n. ${pro.saceNumber}.`;
  Share.share({ message: msg }).catch(() => undefined);
 };

 return (
  <View style={{ flex: 1, backgroundColor: C.bg }}>
   <View style={[st.top, { paddingTop: insets.top + 6 }]}>
    <Pressable accessibilityLabel="Indietro" hitSlop={12} onPress={() => { tap(); onBack(); }} style={st.round}><Ionicons name="chevron-back" size={22} color={C.ink} /></Pressable>
    <Text style={st.topTitle}>Incarico</Text>
    <View style={{ width: 40 }} />
   </View>
   <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
   <ScrollView contentContainerStyle={{ padding: S.m, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
    <Card style={{ padding: S.l }}>
     <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {est ? <ClassBadge value={est.energyClass} size={52} estimate /> : <IconCircle name="home-outline" size={52} />}
      <View style={{ flex: 1, marginLeft: 12 }}>
       <Text style={F.h3}>{accepted ? `${a.street ?? ''}${a.unit ? ', ' + a.unit : ''}` : `${typeLabel} a ${a.municipality ?? ''}`}</Text>
       <Text style={F.small}>{[a.municipality, prov, typeof a.floorArea === 'number' ? `${a.floorArea} m²` : null].filter(Boolean).join(' · ')}</Text>
      </View>
     </View>
     <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      {q ? <Pill text={`Compenso ${euro(q.certifierPayout)}`} icon="cash-outline" /> : null}
      {a.urgency === 'urgente' ? <Pill tone="warn" text="Urgente" icon="flash-outline" /> : null}
      {a.hasPlan === 'no' ? <Pill tone="muted" text="Da recuperare visura e planimetria" icon="search-outline" /> : null}
      {missing.length ? <Pill tone="danger" text={`${missing.length} dati mancanti`} /> : <Pill text="Fascicolo completo" icon="checkmark-circle-outline" />}
     </View>
    </Card>

    {!accepted ? (<>
     <Text style={[F.small, { marginTop: S.m }]}>Indirizzo e contatti del cliente sono visibili dopo l’accettazione.</Text>
     <View style={{ flexDirection: 'row', gap: 10, marginTop: S.m }}>
      <Button title="Rifiuta" kind="danger" onPress={decline} style={{ flex: 1 }} />
      <Button title="Accetta incarico" icon="checkmark" busy={busy} onPress={accept} style={{ flex: 2 }} />
     </View>
    </>) : null}

    {accepted ? (<>
     <SectionTitle>Cliente</SectionTitle>
     <Card>
      <Text style={F.h3}>{String(a.fullName ?? '')}</Text>
      <Text style={F.small}>Disponibilità: {Array.isArray(a.availability) ? a.availability.join(', ') : '—'}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
       <Contact icon="call" label="Chiama" onPress={() => Linking.openURL(`tel:${String(a.phone ?? '').replace(/\s/g, '')}`)} />
       <Contact icon="logo-whatsapp" label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${String(a.phone ?? '').replace(/\D/g, '').replace(/^(?!39)/, '39')}`)} />
       <Contact icon="mail" label="Email" onPress={() => Linking.openURL(`mailto:${String(a.email ?? '')}`)} />
      </View>
     </Card>

     <SectionTitle>Video del cliente</SectionTitle>
     {videos.length ? videos.map((v, i) => (
      <Card key={v.p.uri} onPress={() => setPlayer(v.p)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
       <IconCircle name="play" />
       <Text style={[F.h3, { flex: 1, marginLeft: 12 }]}>Parte {i + 1}{v.p.durationSec ? ` · ${Math.floor(v.p.durationSec / 60)}:${String(v.p.durationSec % 60).padStart(2, '0')}` : ''}</Text>
       <Ionicons name="chevron-forward" size={18} color={C.muted} />
      </Card>
     )) : <Card><Text style={F.small}>Nessun video caricato.</Text></Card>}

     <SectionTitle>Foto e documenti · {images.length + pdfs.length}</SectionTitle>
     <View style={st.grid}>
      {images.map(m => (
       <Pressable key={m.p.uri} onPress={() => setViewer(m.p)} style={st.cell}>
        <Image source={{ uri: m.p.uri }} style={st.img} />
        <Text style={st.cap} numberOfLines={1}>{caption(m.qid)}</Text>
       </Pressable>
      ))}
      {pdfs.map(m => (
       <Pressable key={m.p.uri} onPress={() => Sharing.shareAsync(m.p.uri).catch(() => undefined)} style={st.cell}>
        <View style={[st.img, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="document-text" size={30} color={C.brand} /></View>
        <Text style={st.cap} numberOfLines={1}>{caption(m.qid) || 'PDF'}</Text>
       </Pressable>
      ))}
     </View>

     <SectionTitle>Fascicolo</SectionTitle>
     {dossier(a).map(g => (
      <Card key={g.title} style={{ marginBottom: 10 }}>
       <Text style={[F.label, { marginBottom: 6 }]}>{g.title}</Text>
       {g.rows.map(r => (
        <View key={r.label} style={st.row}><Text style={[F.small, { flex: 1 }]}>{r.label}</Text><Text style={[F.body, { flex: 1, color: C.ink, textAlign: 'right' }]}>{r.value}</Text></View>
       ))}
      </Card>
     ))}
     {est ? <Text style={F.small}>Stima automatica dell’app: classe indicativa {est.energyClass} (intervallo {est.classRange[0]}–{est.classRange[1]}, affidabilità {est.confidence}). Non sostituisce il calcolo del certificatore.</Text> : null}

     <SectionTitle>1 · Videochiamata di pre-sopralluogo</SectionTitle>
     <Card>
      <Text style={[F.small, { marginBottom: 10 }]}>Facoltativa: serve a vedere casa e impianti con il cliente e a preparare la visita. Non sostituisce il sopralluogo obbligatorio.</Text>
      <SlotPicker label="Quando" value={job?.call?.at} onChange={at => run(() => ops.call(at))} />
      {job?.call ? (<>
       <Pill text={fmtWhen(job.call.at)} icon="videocam-outline" />
       <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Button title="Invia invito" kind="secondary" icon="share-outline" onPress={() => invite('call', job.call!.at, job.call!.url)} style={{ flex: 1 }} />
        <Button title="Avvia" icon="videocam" onPress={() => Linking.openURL(job.call!.url)} style={{ flex: 1 }} />
       </View>
      </>) : null}
     </Card>

     <SectionTitle>2 · Sopralluogo in presenza</SectionTitle>
     <Card>
      <SlotPicker label="Data e ora" value={job?.visit?.at} onChange={at => run(() => ops.visit(at))} />
      {job?.visit ? (<>
       <Pill text={fmtWhen(job.visit.at)} icon="calendar-outline" />
       <Button title="Invia conferma al cliente" kind="secondary" icon="share-outline" onPress={() => invite('visit', job.visit!.at)} style={{ marginTop: 12 }} />
      </>) : null}
     </Card>

     <SectionTitle>3 · Verbale di sopralluogo</SectionTitle>
     <VerbaleForm value={job?.verbale} defaultOwner={String(a.fullName ?? '')} defaultDate={job?.visit?.at}
      onSave={v => run(() => ops.verbale(v), remote ? 'Verbale inviato' : undefined)} />

     <SectionTitle>4 · Consegna dell’APE</SectionTitle>
     <DeliveryForm job={job} onDeliver={(code, cls, pdf) => run(() => ops.deliver(code, cls, pdf!), 'APE consegnato: il cliente lo trova nella sua richiesta.')} />
    </>) : null}
   </ScrollView>
   </KeyboardAvoidingView>

   <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
    <Pressable style={st.modal} onPress={() => setViewer(null)}>
     {viewer ? <Image source={{ uri: viewer.uri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
     <Text style={{ color: C.white, marginTop: 12 }}>Tocca per chiudere</Text>
    </Pressable>
   </Modal>
   <Modal visible={!!player} animationType="slide" onRequestClose={() => setPlayer(null)}>
    {player ? <Player uri={player.uri} resolve={ops.videoUri} onClose={() => setPlayer(null)} /> : null}
   </Modal>
  </View>
 );
}

function Player({ uri, resolve, onClose }: { uri: string; resolve?: (u: string) => Promise<string>; onClose: () => void }) {
 const [src, setSrc] = useState<string | null>(resolve ? null : uri);
 React.useEffect(() => { if (resolve) resolve(uri).then(setSrc).catch(() => { Alert.alert('Video non disponibile'); onClose(); }); }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps
 if (!src) return <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.white }}>Scarico il video…</Text></View>;
 return <PlayerView uri={src} onClose={onClose} />;
}

function PlayerView({ uri, onClose }: { uri: string; onClose: () => void }) {
 const insets = useSafeAreaInsets();
 const p = useVideoPlayer(uri, pl => { pl.muted = true; pl.play(); });
 return (
  <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
   <Pressable onPress={onClose} hitSlop={12} style={{ padding: 16, alignSelf: 'flex-end' }}><Ionicons name="close" size={28} color={C.white} /></Pressable>
   <VideoView player={p} style={{ flex: 1 }} nativeControls contentFit="contain" />
  </View>
 );
}

function Contact({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
 return (
  <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => [st.contact, pressed && { opacity: 0.8 }]}>
   <Ionicons name={icon} size={20} color={C.brand} /><Text style={{ color: C.brand, fontWeight: '700', marginTop: 4, fontSize: 13 }}>{label}</Text>
  </Pressable>
 );
}

function VerbaleForm({ value, defaultOwner, defaultDate, onSave }: { value?: Verbale; defaultOwner: string; defaultDate?: string; onSave: (v: Verbale) => void }) {
 const [v, setV] = useState<Partial<Verbale>>(value ?? { date: defaultDate ? new Date(defaultDate).toLocaleDateString('it-IT') : new Date().toLocaleDateString('it-IT'), checks: [], ownerName: defaultOwner, notes: '' });
 const [errors, setErrors] = useState<string[]>([]);
 const set = <K extends keyof Verbale>(k: K, x: Verbale[K]) => setV(p => ({ ...p, [k]: x }));
 if (value && !errors.length && v.savedAt) {
  return <Card><View style={{ flexDirection: 'row', alignItems: 'center' }}><Ionicons name="checkmark-circle" size={22} color={C.accent} /><Text style={[F.h3, { marginLeft: 8 }]}>Verbale salvato · {value.date}, {value.start}–{value.end}</Text></View>
   <Text style={[F.small, { marginTop: 6 }]}>Presenti: {value.attendees}. Confermato da {value.ownerName}.</Text></Card>;
 }
 return (
  <Card>
   <Text style={[F.small, { marginBottom: 12 }]}>Contenuti minimi del “verbale del sopralluogo obbligatorio” (DGR 1385/2020). Il verbale fa parte della documentazione dell’APE e va conservato.</Text>
   <Label required>Data</Label><Field value={v.date ?? ''} onChangeText={t => set('date', t)} placeholder="gg/mm/aaaa" />
   <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
    <View style={{ flex: 1 }}><Label required>Inizio</Label><Field value={v.start ?? ''} onChangeText={t => set('start', t)} placeholder="09:30" keyboard="numeric" /></View>
    <View style={{ flex: 1 }}><Label required>Fine</Label><Field value={v.end ?? ''} onChangeText={t => set('end', t)} placeholder="10:15" keyboard="numeric" /></View>
   </View>
   <View style={{ marginTop: 10 }}><Label required>Presenti</Label><Field value={v.attendees ?? ''} onChangeText={t => set('attendees', t)} placeholder="Certificatore e proprietario" /></View>
   <View style={{ marginTop: 10 }}><Label required>Verifiche eseguite</Label>
    <Chips multi options={VERBALE_CHECKS} value={v.checks ?? []} onChange={x => set('checks', (v.checks ?? []).includes(x) ? (v.checks ?? []).filter(y => y !== x) : [...(v.checks ?? []), x])} />
   </View>
   <View style={{ marginTop: 10 }}><Label>Note</Label><Field value={v.notes ?? ''} onChangeText={t => set('notes', t)} placeholder="Difformità rispetto al fascicolo, dati da integrare…" /></View>
   <View style={{ marginTop: 10 }}><Label required>Proprietario o delegato presente</Label><Field value={v.ownerName ?? ''} onChangeText={t => set('ownerName', t)} autoCapitalize="words" /></View>
   <View style={{ marginTop: 10 }}><ToggleRow label="Il proprietario/delegato conferma che il sopralluogo è avvenuto in questa data" value={!!v.ownerConfirmed} onChange={x => set('ownerConfirmed', x)} /></View>
   <View style={{ marginTop: 10 }}><ToggleRow label="Dichiaro di aver eseguito personalmente il sopralluogo" value={!!v.declaration} onChange={x => set('declaration', x)} /></View>
   {errors.length ? <Text style={{ color: C.danger, marginTop: 10, fontWeight: '600' }}>Mancano: {errors.join(', ')}</Text> : null}
   <Button title="Salva verbale" icon="document-text" style={{ marginTop: 14 }} onPress={() => {
    const e = verbaleErrors(v); setErrors(e);
    if (!e.length) { const saved = { ...(v as Verbale), savedAt: new Date().toISOString() }; setV(saved); onSave(saved); }
   }} />
  </Card>
 );
}

function DeliveryForm({ job, onDeliver }: { job?: Job; onDeliver: (code: string, cls: string, pdf?: { uri: string; name: string; mimeType: string }) => void }) {
 const [code, setCode] = useState('');
 const [cls, setCls] = useState<string | undefined>();
 const [pdf, setPdf] = useState<{ uri: string; name: string; mimeType: string } | undefined>();
 if (job?.ape) return <Card><View style={{ flexDirection: 'row', alignItems: 'center' }}><ClassBadge value={job.ape.energyClass as never} size={40} /><View style={{ marginLeft: 12 }}><Text style={F.h3}>APE consegnato</Text><Text style={F.small}>Codice {job.ape.code}</Text></View></View></Card>;
 if (!canDeliver(job)) return <Card><Text style={F.small}>Disponibile dopo aver salvato il verbale di sopralluogo.</Text></Card>;
 const ok = APE_CODE.test(code.trim()) && !!cls && !!pdf;
 return (
  <Card>
   <Label required>Codice APE (SACE)</Label>
   <Field value={code} onChangeText={setCode} placeholder="05905-012345-2026" keyboard="numeric" error={code && !APE_CODE.test(code.trim()) ? 'Formato NNNNN-NNNNNN-AAAA' : null} />
   <View style={{ marginTop: 10 }}><Label required>Classe energetica ufficiale</Label><Chips options={CLASSES.map(c => ({ value: c, label: c }))} value={cls} onChange={setCls} /></View>
   <Button title={pdf ? `PDF: ${pdf.name}` : 'Allega il PDF dell’APE'} kind="secondary" icon="attach" style={{ marginTop: 12 }}
    onPress={async () => { const f = await pickDocument().catch(() => null); if (f && f.mimeType === 'application/pdf') setPdf(f); else if (f) Alert.alert('Serve un PDF', 'Allega l’APE in formato PDF.'); }} />
   <Button title="Consegna al cliente" icon="send" disabled={!ok} style={{ marginTop: 10 }} onPress={() => onDeliver(code.trim(), cls!, pdf)} />
  </Card>
 );
}

const st = StyleSheet.create({
 top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.m, paddingBottom: 10 },
 round: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
 topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: C.ink },
 contact: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: R.m, backgroundColor: C.brandSoft },
 grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
 cell: { width: '31.5%' },
 img: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: C.surfaceAlt },
 cap: { fontSize: 11, color: C.muted, marginTop: 4 },
 row: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, gap: 10 },
 modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
});
