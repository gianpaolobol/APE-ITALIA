import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, S } from './theme';
import { Button, Card, ClassBadge, ClassScale, IconCircle, Pill, ProgressBar, SectionTitle, tap } from './kit';
import { estimate } from '../energy/estimate';
import { checklist, onSiteChecks, progress, readyToSend } from '../survey/checklist';
import { PROVINCES } from '../survey/questions';
import { euro, quote } from '../pricing';
import { serverConfigured, submitToServer } from '../remote-submit';
import type { Draft } from '../survey/drafts';

const LOSS_LABEL = { muri: 'Muri', finestre: 'Finestre', tetto: 'Tetto', pavimento: 'Pavimento', ventilazione: 'Ricambi d’aria' } as const;

export function ResultScreen({ draft, onBack, onEditStep, onUpdate, onDelete }: { draft: Draft; onBack: () => void; onEditStep: (stepId: string) => void; onUpdate: (fn: (d: Draft) => Draft) => void; onDelete: () => void }) {
 const insets = useSafeAreaInsets();
 const est = useMemo(() => estimate(draft.answers), [draft.answers]);
 const items = checklist(draft.answers, draft.photos);
 const prog = progress(draft.answers, draft.photos);
 const ready = readyToSend(draft.answers, draft.photos);
 const q = quote(draft.answers);
 const [sending, setSending] = useState<string | null>(null);
 const a = draft.answers;
 const where = [a.street, a.municipality, PROVINCES.find(p => p.value === a.province)?.label].filter(Boolean).join(', ');

 const send = async () => {
  if (sending) return;
  if (!serverConfigured()) {
   onUpdate(d => ({ ...d, status: 'pronta' }));
   Alert.alert('Richiesta pronta', 'In questa versione di prova l’invio ai certificatori non è ancora attivo: la richiesta resta salvata sul telefono, completa di foto e stima, e potrai inviarla appena il servizio sarà online.');
   return;
  }
  setSending('Accesso in corso…');
  try {
   const r = await submitToServer({ answers: draft.answers, photos: draft.photos, remoteCaseId: draft.remoteCaseId, uploaded: draft.uploaded }, label => setSending(label),
    cp => onUpdate(d => ({ ...d, ...cp })));
   onUpdate(d => ({ ...d, status: 'inviata', sentAt: new Date().toISOString(), remoteCaseId: r.caseId }));
   Alert.alert('Richiesta inviata', 'I certificatori della tua zona la stanno valutando. Ti contatteremo per fissare il sopralluogo.');
  } catch (e) {
   Alert.alert('Invio non riuscito', e instanceof Error ? e.message : 'Riprova tra poco.');
  } finally { setSending(null); }
 };

 return (
  <View style={{ flex: 1, backgroundColor: C.bg }}>
   <View style={[st.top, { paddingTop: insets.top + 6 }]}>
    <Pressable accessibilityLabel="Indietro" hitSlop={12} onPress={() => { tap(); onBack(); }} style={st.round}><Ionicons name="chevron-back" size={22} color={C.ink} /></Pressable>
    <Text style={st.topTitle}>Riepilogo</Text>
    <Pressable accessibilityLabel="Elimina richiesta" hitSlop={12} style={st.round} onPress={() => Alert.alert('Eliminare la richiesta?', 'Foto e risposte verranno cancellate dal telefono.', [{ text: 'Annulla', style: 'cancel' }, { text: 'Elimina', style: 'destructive', onPress: onDelete }])}>
     <Ionicons name="trash-outline" size={20} color={C.danger} />
    </Pressable>
   </View>
   <ScrollView contentContainerStyle={{ padding: S.m, paddingBottom: 180 }}>
    {where ? <Text style={[F.small, { marginBottom: 6 }]}>{where}</Text> : null}
    {est ? (
     <Card style={{ padding: S.l }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
       <ClassBadge value={est.energyClass} size={70} estimate />
       <View style={{ flex: 1, marginLeft: S.m }}>
        <Text style={F.label}>Stima indicativa · non è un APE</Text>
        <Text style={[F.title, { marginTop: 2 }]}>Classe indicativa {est.energyClass}</Text>
        <Text style={F.small}>{est.classRange[0] === est.classRange[1] ? 'Stima stabile' : `Probabilmente tra ${est.classRange[0]} e ${est.classRange[1]}`} · affidabilità {est.confidence}</Text>
       </View>
      </View>
      <View style={{ marginTop: S.l }}><ClassScale value={est.energyClass} range={est.classRange} /></View>
      <View style={st.kpis}>
       <Kpi value={`≈ ${Math.round(est.epglNren / 5) * 5}`} unit="kWh/m² anno" label="Consumo stimato di energia non rinnovabile" />
       <Kpi value={`≈ ${Math.round(est.breakdown.heating / 5) * 5}`} unit="kWh/m² anno" label="di cui per il riscaldamento" />
      </View>
      <View style={st.disclaimer}>
       <Ionicons name="information-circle" size={18} color="#8A5A00" />
       <Text style={[F.small, { flex: 1, marginLeft: 8, color: '#6B4700' }]}>È una stima indicativa, non un APE. La classe ufficiale la stabilisce il certificatore accreditato dopo il sopralluogo obbligatorio.</Text>
      </View>
     </Card>
    ) : (
     <Card><Text style={F.h3}>La stima comparirà qui</Text><Text style={[F.body, { marginTop: 4 }]}>Servono provincia, tipo di immobile, superficie e anno di costruzione.</Text></Card>
    )}

    {est && est.losses.length ? (<>
     <SectionTitle>Dove si disperde il calore</SectionTitle>
     <Card>
      {est.losses.map(l => (
       <View key={l.key} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
         <Text style={[F.body, { flex: 1, color: C.ink, fontWeight: '600' }]}>{LOSS_LABEL[l.key]}</Text>
         <Text style={[F.body, { fontWeight: '700', color: C.ink }]}>{Math.round(l.share * 100)}%</Text>
        </View>
        <ProgressBar ratio={l.share} color={C.sun} track={C.surfaceAlt} />
       </View>
      ))}
     </Card>
    </>) : null}

    {est && est.suggestions.length ? (<>
     <SectionTitle>Come migliorare la classe</SectionTitle>
     {est.suggestions.map(sg => (
      <Card key={sg.title} style={{ marginBottom: 10, flexDirection: 'row' }}>
       <IconCircle name="trending-up" size={36} />
       <View style={{ flex: 1, marginLeft: 12 }}><Text style={F.h3}>{sg.title}</Text><Text style={[F.small, { marginTop: 3 }]}>{sg.detail}</Text></View>
      </Card>
     ))}
    </>) : null}

    <SectionTitle>Cosa manca · {prog.done}/{prog.total}</SectionTitle>
    <Card>
     <ProgressBar ratio={prog.ratio} />
     <View style={{ height: 10 }} />
     {items.map(it => (
      <Pressable key={it.questionId} onPress={() => { tap(); onEditStep(it.stepId); }} style={st.item}>
       <Ionicons name={it.done ? 'checkmark-circle' : it.required ? 'ellipse-outline' : 'add-circle-outline'} size={22} color={it.done ? C.accent : it.required ? C.danger : C.muted} />
       <Text style={[F.body, { flex: 1, marginLeft: 10, color: it.done ? C.muted : C.ink }]}>{it.label}{!it.required ? ' (facoltativo)' : ''}</Text>
       <Ionicons name={it.kind === 'photo' ? 'camera-outline' : 'create-outline'} size={18} color={C.muted} />
      </Pressable>
     ))}
    </Card>

    <SectionTitle>Al sopralluogo il certificatore verificherà</SectionTitle>
    <Card>
     {onSiteChecks(draft.answers).map(t => (
      <View key={t} style={st.bullet}><Ionicons name="shield-checkmark-outline" size={18} color={C.brand} /><Text style={[F.body, { flex: 1, marginLeft: 10 }]}>{t}</Text></View>
     ))}
    </Card>

    {q ? (<>
     <SectionTitle>Prezzo</SectionTitle>
     <Card>
      {q.items.map(i => (
       <View key={i.label} style={st.priceRow}><Text style={[F.body, { flex: 1 }]}>{i.label}</Text><Text style={[F.body, { color: C.ink, fontWeight: '700' }]}>{euro(i.amount)}</Text></View>
      ))}
      <View style={[st.priceRow, { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, marginTop: 4 }]}>
       <Text style={[F.h3, { flex: 1 }]}>Totale</Text><Text style={[F.title, { fontSize: 22 }]}>{euro(q.total)}</Text>
      </View>
      <Text style={[F.small, { marginTop: 6 }]}>{q.note}</Text>
     </Card>
    </>) : null}

    {draft.status !== 'bozza' ? <View style={{ marginTop: S.m }}><Pill tone={draft.status === 'inviata' ? 'brand' : 'warn'} icon="paper-plane" text={draft.status === 'inviata' ? 'Inviata ai certificatori' : 'Pronta: verrà inviata quando il servizio sarà online'} /></View> : null}
   </ScrollView>
   <View style={[st.bottom, { paddingBottom: insets.bottom + 10 }]}>
    {!ready ? <Text style={st.hint}>Completa i punti obbligatori per inviare la richiesta</Text> : null}
    <Button title={sending ?? (draft.status === 'inviata' ? 'Richiesta già inviata' : 'Invia ai certificatori')} icon="paper-plane" busy={!!sending}
     disabled={!ready || draft.status === 'inviata'} onPress={send} />
   </View>
  </View>
 );
}

function Kpi({ value, unit, label }: { value: string; unit: string; label: string }) {
 return (
  <View style={st.kpi}>
   <Text style={{ fontSize: 24, fontWeight: '800', color: C.ink }}>{value}<Text style={{ fontSize: 12, fontWeight: '600', color: C.muted }}> {unit}</Text></Text>
   <Text style={F.small}>{label}</Text>
  </View>
 );
}

const st = StyleSheet.create({
 top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.m, paddingBottom: 10 },
 round: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
 topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: C.ink },
 kpis: { flexDirection: 'row', gap: 10, marginTop: S.l },
 kpi: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: R.m, padding: 12 },
 disclaimer: { flexDirection: 'row', backgroundColor: C.warnSoft, borderRadius: R.m, padding: 12, marginTop: S.m },
 item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
 bullet: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7 },
 priceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
 bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.m, paddingTop: 10, backgroundColor: 'rgba(245,246,242,0.97)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
 hint: { textAlign: 'center', color: C.muted, fontSize: 13, marginBottom: 8, fontWeight: '600' },
});
