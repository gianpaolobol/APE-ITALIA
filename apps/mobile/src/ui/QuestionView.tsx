import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R, S } from './theme';
import { ChoiceCards, Chips, Field, Help, Label, ToggleRow, tap } from './kit';
import { questionError, type AnswerValue, type Answers, type NumberQuestion, type PhotoQuestion, type VideoQuestion, type PhotoRef, type Question } from '../survey/questions';
import { PermissionDeniedError, pickDocument, pickImage, pickVideo, recordVideo, takePhoto } from '../pickers';
import { VIDEO_MAX_CLIPS, fmtDuration, videoBudgetSeconds } from '../survey/video';
import { readPhoto } from '../ai';

type Props = {
 q: Question;
 answers: Answers;
 photos: PhotoRef[];
 onAnswer: (id: string, v: AnswerValue | undefined) => void;
 onAddPhoto: (id: string, file: { uri: string; name: string; mimeType: string; durationSec?: number }) => PhotoRef;
 onReadPhoto: (id: string, p: PhotoRef, use: (uri: string) => Promise<void>) => Promise<void>;
 onRemovePhoto: (id: string, p: PhotoRef) => void;
 onAutoFill: (fields: Answers, summary: string, source: PhotoRef) => void;
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
  case 'video': return <VideoQ {...p} q={q} />;
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

/** Accepts "1.200" (thousands) and "2,70" (decimals). */
export function parseItalianNumber(t: string): number | undefined {
 const clean = t.trim();
 if (!clean) return undefined;
 const v = Number((/^\d{1,3}(\.\d{3})+$/.test(clean) ? clean.replace(/\./g, '') : clean).replace(',', '.'));
 return Number.isFinite(v) ? v : undefined;
}

function NumberQ({ q, answers, onAnswer, showErrors }: Props & { q: NumberQuestion }) {
 const [touched, setTouched] = useState(false);
 const [text, setText] = useState(fmt(answers[q.id], q.decimals));
 useEffect(() => { setText(fmt(answers[q.id], q.decimals)); }, [answers[q.id]]); // eslint-disable-line react-hooks/exhaustive-deps
 const err = questionError(q, answers);
 return (
  <Block q={q} warn={showErrors && q.required && answers[q.id] === undefined}>
   <Field value={text} unit={q.unit} placeholder={q.placeholder} keyboard={q.decimals ? 'decimal' : 'numeric'} error={touched || showErrors ? err : null}
    onBlur={() => setTouched(true)}
    onChangeText={t => {
     const clean = t.replace(/[^0-9.,]/g, '');
     setText(clean);
     setTouched(false);
     onAnswer(q.id, parseItalianNumber(clean));
    }} />
  </Block>
 );
}

function PhotoQ(p: Props & { q: PhotoQuestion }) {
 const { q, photos, onAddPhoto, onRemovePhoto, onAutoFill, showErrors } = p;
 const [reading, setReading] = useState(false);
 const max = q.max ?? 3;
 const full = photos.length >= max;
 const add = async (source: 'camera' | 'library' | 'file') => {
  try {
   const f = source === 'camera' ? await takePhoto() : source === 'library' ? await pickImage() : await pickDocument();
   if (!f) return;
   if (f.size !== undefined && f.size > 15 * 1024 * 1024) { Alert.alert('File troppo grande', 'Massimo 15 MB.'); return; }
   const ref = onAddPhoto(q.id, f);
   if (q.extract && p.answers.aiConsent === true) {
    setReading(true);
    try {
     const kind = q.extract;
     const box: { result?: Awaited<ReturnType<typeof readPhoto>> } = {};
     await p.onReadPhoto(q.id, ref, async uri => { box.result = await readPhoto(kind, { ...ref, uri }); });
     const r = box.result;
     if (r && Object.keys(r.fields).length) onAutoFill(r.fields, r.summary, ref);
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
       <Pressable accessibilityLabel="Rimuovi" hitSlop={10} onPress={() => { tap(); onRemovePhoto(q.id, ph); }} style={st.remove}><Ionicons name="close" size={14} color={C.white} /></Pressable>
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

function VideoQ({ q, answers, photos, onAddPhoto, onRemovePhoto, showErrors }: Props & { q: VideoQuestion }) {
 const budget = videoBudgetSeconds(answers);
 const used = photos.reduce((s, v) => s + (v.durationSec ?? 0), 0);
 const left = Math.max(0, budget - used);
 const canAdd = photos.length < VIDEO_MAX_CLIPS && left >= 10;
 const add = async (source: 'camera' | 'library') => {
  try {
   const v = source === 'camera' ? await recordVideo(left) : await pickVideo(left);
   if (!v) return;
   if (v.durationSec > left + 2) { Alert.alert('Video troppo lungo', `Hai ancora ${fmtDuration(left)} disponibili. Accorcia il video o registrane uno nuovo.`); return; }
   if (v.size !== undefined && v.size > 300 * 1024 * 1024) { Alert.alert('File troppo grande', 'Massimo 300 MB: registra a qualità standard (720p).'); return; }
   onAddPhoto(q.id, v);
  } catch (e) {
   if (e instanceof PermissionDeniedError) Alert.alert('Permesso negato', 'Consenti l’accesso alla fotocamera dalle Impostazioni di iOS.');
   else Alert.alert('Errore', 'Non è stato possibile aggiungere il video.');
  }
 };
 return (
  <View style={st.block}>
   <Label required={q.required}>{q.label}</Label>
   <View style={st.budget}>
    <Ionicons name="time-outline" size={20} color={C.brandDeep} />
    <Text style={[F.body, { flex: 1, marginLeft: 8, color: C.brandDeep }]}>Durata massima <Text style={{ fontWeight: '800' }}>{fmtDuration(budget)}</Text> per questo immobile, anche in {VIDEO_MAX_CLIPS} parti (per esempio una per piano).</Text>
   </View>
   <View style={st.script}>
    {q.guide.map((g, i) => (
     <View key={i} style={{ flexDirection: 'row', marginBottom: 8 }}>
      <View style={st.num}><Text style={{ color: C.white, fontWeight: '800', fontSize: 12 }}>{i + 1}</Text></View>
      <Text style={[F.small, { flex: 1, color: C.inkSoft }]}>{g}</Text>
     </View>
    ))}
   </View>
   {photos.map((v, i) => (
    <View key={v.uri} style={st.clip}>
     <Ionicons name="film-outline" size={22} color={C.brand} />
     <Text style={[F.body, { flex: 1, marginLeft: 10, color: C.ink, fontWeight: '600' }]}>Parte {i + 1} · {fmtDuration(v.durationSec ?? 0)}</Text>
     <Pressable accessibilityLabel="Rimuovi video" hitSlop={10} onPress={() => { tap(); onRemovePhoto(q.id, v); }}><Ionicons name="trash-outline" size={20} color={C.danger} /></Pressable>
    </View>
   ))}
   {photos.length ? <Text style={[F.small, { marginBottom: 10 }]}>Tempo ancora disponibile: {fmtDuration(left)}</Text> : null}
   {canAdd ? (
    <View style={st.actions}>
     <Action icon="videocam" label={photos.length ? 'Registra un’altra parte' : 'Registra il video'} primary onPress={() => add('camera')} />
     <Action icon="images-outline" label="Dalla galleria" onPress={() => add('library')} />
    </View>
   ) : <Text style={F.small}>Hai usato tutto il tempo disponibile.</Text>}
   {showErrors && q.required && photos.length === 0 ? <Text style={st.warn}>Serve il video dell’immobile</Text> : null}
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
 remove: { position: 'absolute', top: -8, right: -8, width: 30, height: 30, borderRadius: 15, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white },
 actions: { flexDirection: 'row', gap: 8 },
 action: { flex: 1, minHeight: 50, borderRadius: R.m, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
 actionText: { fontSize: 15, fontWeight: '700', color: C.brand },
 reading: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
 budget: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.brandSoft, borderRadius: R.m, padding: 12, marginBottom: 10 },
 script: { backgroundColor: C.surface, borderRadius: R.m, padding: 14, borderWidth: 1.5, borderColor: C.line, marginBottom: 12 },
 num: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
 clip: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.m, padding: 14, borderWidth: 1.5, borderColor: C.line, marginBottom: 8 },
});
