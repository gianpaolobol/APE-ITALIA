import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, S } from './theme';
import { Button, Card, Chips, Field, Help, IconCircle, Label, Pill, ToggleRow, tap } from './kit';
import { PROVINCES } from '../survey/questions';
import { normalizeSaceNumber, validateRegistration, type FieldErrors, type ProRegistration } from '../pro/registration';
import type { AppState } from '../survey/drafts';

const PROFESSIONS = [
 { value: 'architetto', label: 'Architetto' }, { value: 'ingegnere', label: 'Ingegnere' }, { value: 'geometra', label: 'Geometra' },
 { value: 'perito', label: 'Perito industriale' }, { value: 'altro', label: 'Altro' },
];
const apiBase = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');

export function ProScreen({ state, onBack, onSaved }: { state: AppState; onBack: () => void; onSaved: (pro: NonNullable<AppState['pro']>) => void }) {
 const insets = useSafeAreaInsets();
 const [r, setR] = useState<Partial<ProRegistration>>(state.pro?.data ?? { region: 'Emilia-Romagna', provinces: [], maxMonthlyJobs: 10 });
 const [errors, setErrors] = useState<FieldErrors>({});
 const [busy, setBusy] = useState(false);
 const set = <K extends keyof ProRegistration>(k: K, v: ProRegistration[K]) => setR(x => ({ ...x, [k]: v }));
 const txt = (k: keyof ProRegistration) => (typeof r[k] === 'string' ? (r[k] as string) : '');

 if (state.pro) {
  return (
   <Shell title="Area certificatori" onBack={onBack} top={insets.top}>
    <Card style={{ alignItems: 'center', padding: S.l }}>
     <IconCircle name="hourglass-outline" size={60} bg={C.warnSoft} color="#8A5A00" />
     <Text style={[F.title, { marginTop: S.m, textAlign: 'center' }]}>Candidatura in verifica</Text>
     <Text style={[F.body, { textAlign: 'center', marginTop: 6 }]}>Controlliamo il numero di accreditamento <Text style={{ fontWeight: '800', color: C.ink }}>{state.pro.data.saceNumber}</Text> sull’elenco pubblico dei certificatori dell’Emilia-Romagna. Ti avvisiamo via email a {state.pro.data.email}.</Text>
     <View style={{ marginTop: S.m }}><Pill tone={state.pro.status === 'inviata_al_server' ? 'brand' : 'warn'} text={state.pro.status === 'inviata_al_server' ? 'Ricevuta dal server' : 'Salvata sul telefono (versione di prova)'} /></View>
    </Card>
   </Shell>
  );
 }

 const submit = async () => {
  const e = validateRegistration(r);
  setErrors(e);
  if (Object.keys(e).length) { Alert.alert('Controlla i campi', 'Alcuni dati mancano o non sono validi.'); return; }
  const data = { ...(r as ProRegistration), saceNumber: normalizeSaceNumber(r.saceNumber!) };
  setBusy(true);
  let status: 'in_verifica' | 'inviata_al_server' = 'in_verifica';
  try {
   if (/^https:\/\//.test(apiBase)) {
    const res = await fetch(`${apiBase}/v1/certifier-applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) status = 'inviata_al_server';
    else if (res.status === 409) { Alert.alert('Già registrato', 'Esiste già una candidatura con questo numero SACE o email.'); setBusy(false); return; }
   }
  } catch { /* offline: kept on the device */ }
  setBusy(false);
  onSaved({ data, submittedAt: new Date().toISOString(), status });
 };

 return (
  <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
   <Shell title="Diventa certificatore partner" onBack={onBack} top={insets.top}>
    <Card style={{ flexDirection: 'row', marginBottom: S.l }}>
     <Ionicons name="shield-checkmark" size={22} color={C.brand} />
     <Text style={[F.small, { flex: 1, marginLeft: 10, color: C.inkSoft }]}>In Emilia-Romagna l’APE può essere rilasciato solo da certificatori accreditati nel sistema regionale SACE. Il numero di accreditamento è obbligatorio e viene verificato prima di attivare il profilo.</Text>
    </Card>

    <Group title="Dati personali">
     <Two>
      <F2 label="Nome" required err={errors.firstName}><Field value={txt('firstName')} onChangeText={t => set('firstName', t)} autoCapitalize="words" error={errors.firstName} /></F2>
      <F2 label="Cognome" required err={errors.lastName}><Field value={txt('lastName')} onChangeText={t => set('lastName', t)} autoCapitalize="words" error={errors.lastName} /></F2>
     </Two>
     <F2 label="Email" required><Field value={txt('email')} onChangeText={t => set('email', t)} keyboard="email" autoCapitalize="none" error={errors.email} /></F2>
     <F2 label="Telefono" required><Field value={txt('phone')} onChangeText={t => set('phone', t)} keyboard="phone" error={errors.phone} /></F2>
     <F2 label="PEC"><Field value={txt('pec')} onChangeText={t => set('pec', t)} keyboard="email" autoCapitalize="none" error={errors.pec} /></F2>
    </Group>

    <Group title="Accreditamento">
     <F2 label="Numero di accreditamento SACE" required>
      <Field value={txt('saceNumber')} onChangeText={t => set('saceNumber', t)} autoCapitalize="none" placeholder="Es. 05990" keyboard="numeric" maxLength={5} error={errors.saceNumber} />
      <Help>Il codice di 5 cifre con cui iniziano i tuoi APE (es. 05990-034798-2026). Lo verifichiamo sull’elenco pubblico SACE.</Help>
      <Pressable onPress={() => Linking.openURL('https://sace-er.regione.emilia-romagna.it/ui/elenco-certificatori')} hitSlop={6}><Text style={st.link}>Apri l’elenco pubblico dei certificatori</Text></Pressable>
     </F2>
     <F2 label="Professione" required><Chips options={PROFESSIONS} value={r.profession} onChange={v => set('profession', v as ProRegistration['profession'])} />{errors.profession ? <Text style={st.err}>{errors.profession}</Text> : null}</F2>
     <Two>
      <F2 label="Ordine o collegio" required><Field value={txt('professionalOrder')} onChangeText={t => set('professionalOrder', t)} placeholder="Es. Bologna" error={errors.professionalOrder} /></F2>
      <F2 label="N. iscrizione" required><Field value={txt('orderNumber')} onChangeText={t => set('orderNumber', t)} error={errors.orderNumber} /></F2>
     </Two>
    </Group>

    <Group title="Dati fiscali">
     <F2 label="Partita IVA" required><Field value={txt('vatNumber')} onChangeText={t => set('vatNumber', t.replace(/\s/g, ''))} keyboard="numeric" maxLength={11} error={errors.vatNumber} /></F2>
     <F2 label="Codice fiscale" required><Field value={txt('taxCode')} onChangeText={t => set('taxCode', t.toUpperCase())} autoCapitalize="none" maxLength={16} error={errors.taxCode} /></F2>
    </Group>

    <Group title="Zona di lavoro">
     <F2 label="Province in cui lavori" required>
      <Chips multi options={PROVINCES} value={r.provinces ?? []} onChange={v => set('provinces', (r.provinces ?? []).includes(v) ? (r.provinces ?? []).filter(x => x !== v) : [...(r.provinces ?? []), v])} />
      {errors.provinces ? <Text style={st.err}>{errors.provinces}</Text> : null}
     </F2>
    </Group>

    <ToggleRow label="Dichiaro di essere accreditato come certificatore energetico in Emilia-Romagna" value={!!r.declaresAccreditation} onChange={v => set('declaresAccreditation', v)} />
    {errors.declaresAccreditation ? <Text style={st.err}>{errors.declaresAccreditation}</Text> : null}
    <View style={{ height: 10 }} />
    <ToggleRow label="Accetto le condizioni per i professionisti e l’informativa privacy" value={!!r.acceptsTerms} onChange={v => set('acceptsTerms', v)} />
    {errors.acceptsTerms ? <Text style={st.err}>{errors.acceptsTerms}</Text> : null}
    <Button title="Invia candidatura" icon="send" busy={busy} onPress={submit} style={{ marginTop: S.l, marginBottom: insets.bottom + 20 }} />
   </Shell>
  </KeyboardAvoidingView>
 );
}

function Shell({ title, onBack, top, children }: { title: string; onBack: () => void; top: number; children: React.ReactNode }) {
 return (
  <View style={{ flex: 1, backgroundColor: C.bg }}>
   <View style={[st.top, { paddingTop: top + 6 }]}>
    <Pressable accessibilityLabel="Indietro" hitSlop={12} onPress={() => { tap(); onBack(); }} style={st.round}><Ionicons name="chevron-back" size={22} color={C.ink} /></Pressable>
    <Text style={st.topTitle} numberOfLines={1}>{title}</Text>
    <View style={{ width: 40 }} />
   </View>
   <ScrollView contentContainerStyle={{ padding: S.m }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </View>
 );
}
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => <View style={{ marginBottom: S.m }}><Text style={[F.label, { marginBottom: S.s }]}>{title}</Text>{children}</View>;
const Two = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', gap: 10 }}>{React.Children.map(children, c => <View style={{ flex: 1 }}>{c}</View>)}</View>;
const F2 = ({ label, required, children }: { label: string; required?: boolean; err?: string; children: React.ReactNode }) => <View style={{ marginBottom: 14 }}><Label required={required}>{label}</Label>{children}</View>;

const st = StyleSheet.create({
 top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.m, paddingBottom: 10 },
 round: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
 topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: C.ink },
 link: { color: C.brand, fontWeight: '700', marginTop: 6 },
 err: { color: C.danger, fontSize: 13, marginTop: 5, fontWeight: '600' },
});
