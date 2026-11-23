import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R, S } from './theme';
import { ChoiceCards, Chips, Field, Help, Label, ToggleRow, tap } from './kit';
import { questionError, type AnswerValue, type Answers, type NumberQuestion, type PhotoQuestion, type PhotoRef, type Question } from '../survey/questions';
import { PermissionDeniedError, pickDocument, pickImage, takePhoto } from '../pickers';
import { readPhoto } from '../ai';

type Props = {
 q: Question;
 answers: Answers;
 photos: PhotoRef[];
 onAnswer: (id: string, v: AnswerValue | undefined) => void;
 onAddPhoto: (id: string, file: { uri: string; name: string; mimeType: string }) => PhotoRef;
 onRemovePhoto: (id: string, p: PhotoRef) => void;
 onAutoFill: (fields: Answers, summary: string) => void;
 showErrors: boolean;
};

const fmt = (v: AnswerValue | undefined, decimals?: number) => (typeof v === 'number' ? (decimals ? String(v).replace('.', ',') : String(v)) : '');

export function QuestionView(p: Props) {
 const { q, answers, onAnswer, showErrors } = p;
 const missing = showErrors && q.required;
 switch (q.kind) {
  case 'choice':
   return <Block q={q} warn={missing && answers[q.id] === undefined}>
    {q.layout === 'cards'
     ? <ChoiceCards options={q.options} value={answers[q.id] as string | undefined} onChange={v => onAnswer(q.id, v)} />
     : <Chips options={q.options} value={answers[q.id] as string | undefined} onChange={v => onAnswer(q.id, v)} />}
   </Block>;
  case 'multi': {
   const cur = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
   return <Block q={q} warn={missing && cur.length === 0}>
    <Chips multi options={q.options} value={cur} onChange={v => onAnswer(q.id, cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v])} />
   </Block>;
  }
  case 'toggle':
   return <View style={st.block}><ToggleRow label={q.label} value={answers[q.id] === true} onChange={v => onAnswer(q.id, v)} />
    {missing && answers[q.id] !== true ? <Text style={st.warn}>Necessario per procedere</Text> : null}</View>;
  case 'number': return <NumberQ {...p} q={q} />;
  case 'text': {
   const err = questionError(q, answers);
   return <Block q={q} warn={missing && !answers[q.id]}>
    <Field value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''} onChangeText={t => onAnswer(q.id, t === '' ? undefined : t)}
     placeholder={q.placeholder} keyboard={q.keyboard} autoCapitalize={q.autoCapitalize} maxLength={q.maxLength} error={showErrors ? err : null} />
   </Block>;
  }
  case 'photo': return <PhotoQ {...p} q={q} />;
 }
}

function Block({ q, children, warn }: { q: Question; children: React.ReactNode; warn?: boolean }) {
 return (
  <View style={st.block}>
   <Label required={q.required}>{q.label}</Label>
   {children}
   {q.help ? <Help>{q.help}</Help> : null}
   {warn ? <Text style={st.warn}>Rispondi per completare questo passaggio</Text> : null}
  </View>
 );
}

function NumberQ({ q, answers, onAnswer, showErrors }: Props & { q: NumberQuestion }) {
 const [text, setText] = useState(fmt(answers[q.id], q.decimals));
 useEffect(() => { setText(fmt(answers[q.id], q.decimals)); }, [answers[q.id]]); // eslint-disable-line react-hooks/exhaustive-deps
 const err = questionError(q, answers);
 return (
  <Block q={q} warn={showErrors && q.required && answers[q.id] === undefined}>
   <Field value={text} unit={q.unit} placeholder={q.placeholder} keyboard={q.decimals ? 'decimal' : 'numeric'} error={err}
    onChangeText={t => {
     const clean = t.replace(/[^0-9.,]/g, '');
     setText(clean);
     const v = Number(clean.replace(',', '.'));
     onAnswer(q.id, clean === '' || !Number.isFinite(v) ? undefined : v);
    }} />
  </Block>
 );
}

function PhotoQ({ q, photos, onAddPhoto, onRemovePhoto, onAutoFill, showErrors }: Props & { q: PhotoQuestion }) {
 const [reading, setReading] = useState(false);
 const max = q.max ?? 3;
 const full = photos.length >= max;
 const add = async (source: 'camera' | 'library' | 'file') => {
  try {
   const f = source === 'camera' ? await takePhoto() : source === 'library' ? await pickImage() : await pickDocument();
   if (!f) return;
   if (f.size !== undefined && f.size > 15 * 1024 * 1024) { Alert.alert('File troppo grande', 'Massimo 15 MB.'); return; }
   const ref = onAddPhoto(q.id, f);
   if (q.extract) {
    setReading(true);
    try {
     const r = await readPhoto(q.extract, ref);
     if (r && Object.keys(r.fields).length) onAutoFill(r.fields, r.summary);
    } catch { /* reading is optional */ } finally { setReading(false); }
   }
  } catch (e) {
   if (e instanceof PermissionDeniedError) Alert.alert('Permesso negato', 'Consenti l’accesso alla fotocamera dalle Impostazioni di iOS per scattare la foto.');
   else Alert.alert('Errore', 'Non è stato possibile aggiungere il file.');
  }
 };
 return (
  <View style={st.block}>
   <Label required={q.required}>{q.label}</Label>
   <View style={st.guide}>
    <Ionicons name="camera-outline" size={18} color={C.brand} style={{ marginRight: 8, marginTop: 1 }} />
    <Text style={[F.small, { flex: 1, color: C.inkSoft }]}>{q.guide}</Text>
   </View>
   {photos.length > 0 ? (
    <View style={st.thumbs}>
     {photos.map(ph => (
      <View key={ph.uri} style={st.thumb}>
       {ph.mimeType === 'application/pdf'
        ? <View style={[st.thumbImg, { alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceAlt }]}><Ionicons name="document-text" size={30} color={C.brand} /><Text style={F.small}>PDF</Text></View>
        : <Image source={{ uri: ph.uri }} style={st.thumbImg} />}
       <Pressable accessibilityLabel="Rimuovi" hitSlop={8} onPress={() => { tap(); onRemovePhoto(q.id, ph); }} style={st.remove}><Ionicons name="close" size={14} color={C.white} /></Pressable>
      </View>
     ))}
    </View>
   ) : null}
   {reading ? <View style={st.reading}><ActivityIndicator color={C.brand} /><Text style={[F.small, { marginLeft: 8, color: C.brand, fontWeight: '700' }]}>Leggo la foto e compilo i dati…</Text></View> : null}
   {!full ? (
    <View style={st.actions}>
     <Action icon="camera" label="Scatta" primary onPress={() => add('camera')} />
     <Action icon="images-outline" label="Galleria" onPress={() => add('library')} />
     {q.allowDocuments ? <Action icon="document-attach-outline" label="PDF" onPress={() => add('file')} /> : null}
    </View>
   ) : <Text style={F.small}>Hai aggiunto il numero massimo di file ({max}).</Text>}
   {showErrors && q.required && photos.length === 0 ? <Text style={st.warn}>Serve almeno una foto</Text> : null}
  </View>
 );
}

function Action({ icon, label, onPress, primary }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; primary?: boolean }) {
 return (
  <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => [st.action, primary && { backgroundColor: C.brand, borderColor: C.brand }, pressed && { opacity: 0.85 }]}>
   <Ionicons name={icon} size={18} color={primary ? C.white : C.brand} />
   <Text style={[st.actionText, primary && { color: C.white }]}>{label}</Text>
  </Pressable>
 );
}

const st = StyleSheet.create({
 block: { marginBottom: S.l },
 warn: { color: '#B26A00', fontSize: 13, fontWeight: '600', marginTop: 6 },
 guide: { flexDirection: 'row', backgroundColor: C.brandSoft, borderRadius: R.m, padding: 12, marginBottom: 10 },
 thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
 thumb: { width: 92, height: 92 },
 thumbImg: { width: 92, height: 92, borderRadius: 14, backgroundColor: C.line },
 remove: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white },
 actions: { flexDirection: 'row', gap: 8 },
 action: { flex: 1, minHeight: 50, borderRadius: R.m, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
 actionText: { fontSize: 15, fontWeight: '700', color: C.brand },
 reading: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
});
