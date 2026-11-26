import React, { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, S } from './theme';
import { Button, ClassBadge, IconCircle, ProgressBar, tap, type IconName } from './kit';
import { QuestionView } from './QuestionView';
import { isVisible, stepMissing, visibleSteps, type AnswerValue, type Answers, type PhotoRef } from '../survey/questions';
import { estimate } from '../energy/estimate';
import type { Draft } from '../survey/drafts';

type Props = {
 draft: Draft;
 startStepId?: string;
 onUpdate: (fn: (d: Draft) => Draft) => void;
 onAddPhoto: (qid: string, f: { uri: string; name: string; mimeType: string }) => PhotoRef;
 onReadPhoto: (qid: string, p: PhotoRef, use: (uri: string) => Promise<void>) => Promise<void>;
 onRemovePhoto: (qid: string, p: PhotoRef) => void;
 onClose: () => void;
 onFinish: () => void;
};

export function WizardScreen({ draft, startStepId, onUpdate, onAddPhoto, onReadPhoto, onRemovePhoto, onClose, onFinish }: Props) {
 const insets = useSafeAreaInsets();
 const steps = visibleSteps(draft.answers);
 const [index, setIndex] = useState(() => Math.max(0, steps.findIndex(s => s.id === startStepId)));
 const [showErrors, setShowErrors] = useState(false);
 const [autofill, setAutofill] = useState<string | null>(null);
 const scroll = useRef<ScrollView>(null);
 const i = Math.min(index, steps.length - 1);
 const step = steps[i];
 const missing = stepMissing(step, draft.answers, draft.photos);
 const est = useMemo(() => (draft.answers.heatingSystem ? estimate(draft.answers) : null), [draft.answers]);
 const last = i === steps.length - 1;

 const setAnswer = (id: string, v: AnswerValue | undefined) => {
  onUpdate(d => {
   const answers: Answers = { ...d.answers };
   if (v === undefined) delete answers[id]; else answers[id] = v;
   return { ...d, answers, updatedAt: new Date().toISOString() };
  });
 };
 const go = (to: number) => {
  setShowErrors(false); setAutofill(null);
  setIndex(to);
  scroll.current?.scrollTo({ y: 0, animated: false });
 };
 const next = () => {
  if (missing.length && !showErrors) { setShowErrors(true); return; }
  if (last) onFinish(); else go(i + 1);
 };

 return (
  <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
   <View style={[st.top, { paddingTop: insets.top + 6 }]}>
    <View style={st.topRow}>
     <Pressable accessibilityLabel="Indietro" hitSlop={12} onPress={() => { tap(); i === 0 ? onClose() : go(i - 1); }} style={st.round}>
      <Ionicons name={i === 0 ? 'close' : 'chevron-back'} size={22} color={C.ink} />
     </Pressable>
     <Text style={st.counter}>Passo {i + 1} di {steps.length}</Text>
     {est ? <View style={st.live}><Text style={[F.small, { marginRight: 6 }]}>Stima</Text><ClassBadge value={est.energyClass} size={24} /></View> : <View style={{ width: 40 }} />}
    </View>
    <ProgressBar ratio={(i + 1) / steps.length} />
   </View>

   <ScrollView ref={scroll} contentContainerStyle={{ padding: S.m, paddingBottom: 190 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
    <View style={st.head}>
     <IconCircle name={step.icon as IconName} size={48} />
     <Text style={[F.title, { marginTop: 14 }]}>{step.title}</Text>
     <Text style={[F.body, { marginTop: 4 }]}>{step.subtitle}</Text>
    </View>
    {autofill ? (
     <View style={st.autofill}>
      <Ionicons name="sparkles" size={18} color={C.brandDeep} />
      <Text style={[F.small, { flex: 1, marginLeft: 8, color: C.brandDeep }]}>Dati letti dalla foto e compilati: {autofill}. Controllali.</Text>
     </View>
    ) : null}
    {step.questions.filter(q => isVisible(q, draft.answers)).map(q => (
     <QuestionView key={q.id} q={q} answers={draft.answers} photos={draft.photos[q.id] ?? []} showErrors={showErrors}
      onAnswer={setAnswer} onAddPhoto={onAddPhoto} onReadPhoto={onReadPhoto} onRemovePhoto={onRemovePhoto}
      onAutoFill={(fields, summary, source) => {
       let filled = 0;
       onUpdate(d => {
        const stillThere = Object.values(d.photos).some(l => (l ?? []).some(x => x.uri === source.uri));
        if (!stillThere) return d;
        const add: Answers = {};
        for (const [k, v] of Object.entries(fields)) if (d.answers[k] === undefined) { add[k] = v; filled++; }
        return filled ? { ...d, answers: { ...d.answers, ...add }, updatedAt: new Date().toISOString() } : d;
       });
       if (filled) setAutofill(summary || `${filled} campi`);
      }} />
    ))}
   </ScrollView>

   <View style={[st.bottom, { paddingBottom: insets.bottom + 10 }]}>
    {showErrors && missing.length ? <Text style={st.missing}>Mancano {missing.length} {missing.length === 1 ? 'risposta' : 'risposte'}: puoi completarle anche dopo.</Text> : null}
    <Button title={last ? 'Vedi il riepilogo' : showErrors && missing.length ? 'Continua comunque' : 'Continua'} icon={last ? 'checkmark-done' : 'arrow-forward'} onPress={next} />
   </View>
  </KeyboardAvoidingView>
 );
}

const st = StyleSheet.create({
 top: { backgroundColor: C.bg, paddingHorizontal: S.m, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
 topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
 round: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
 counter: { flex: 1, textAlign: 'center', fontWeight: '700', color: C.inkSoft },
 live: { flexDirection: 'row', alignItems: 'center' },
 head: { marginBottom: S.l, marginTop: S.s },
 autofill: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.brandSoft, borderRadius: R.m, padding: 12, marginBottom: S.m },
 bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.m, paddingTop: 10, backgroundColor: 'rgba(245,246,242,0.97)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
 missing: { textAlign: 'center', color: '#8A5A00', fontWeight: '600', fontSize: 13, marginBottom: 8 },
});
