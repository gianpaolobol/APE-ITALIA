import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState as RNAppState, Button, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { C } from './src/ui/theme';
import { HomeScreen } from './src/ui/HomeScreen';
import { WizardScreen } from './src/ui/WizardScreen';
import { ResultScreen } from './src/ui/ResultScreen';
import { ProScreen } from './src/ui/ProScreen';
import { InboxScreen } from './src/ui/InboxScreen';
import { JobScreen } from './src/ui/JobScreen';
import { RemoteCertifier } from './src/ui/RemoteCertifier';
import { getSession, logout, serverEnabled, subscribeSession } from './src/server';
import { canViewDraft, sameOwner, visiblePro, storePro, type DraftOwner, type ProProfile, enqueueMediaCleanup, retryMediaCleanup, removeDraftPhoto, loadState, newScopedDraft, addDraftPhoto, deliverDraftApe, saveStateNow, type AppState, type Draft } from './src/survey/drafts';

import { createAutosave } from './src/survey/autosave';
import { preparePrivateMediaCache } from './src/survey/media-native-storage';

type Route = { name: 'home' } | { name: 'wizard'; id: string; step?: string } | { name: 'result'; id: string } | { name: 'pro' } | { name: 'inbox' } | { name: 'job'; id: string } | { name: 'remote'; me: { name: string; sace: string } };

export default function App() {
 const [state, setState] = useState<AppState | null>(null);
 const [loadFailed, setLoadFailed] = useState(false);
 const [loadAttempt, setLoadAttempt] = useState(0);
 const [route, setRoute] = useState<Route>({ name: 'home' });
 const [owner, setOwner] = useState<DraftOwner | null | undefined>(undefined);
 const ownerRef = useRef<DraftOwner | null>(null);
 useEffect(() => {
  let active = true, observed = false;
  const apply = (s: DraftOwner | null) => {
   if (!active) return;
   const previous = ownerRef.current;
   ownerRef.current = s;
   setOwner(s);
   if (!sameOwner(previous, s)) setRoute({ name: 'home' });
   else if (!s) setRoute(r => r.name === 'remote' ? { name: 'home' } : r);
  };
  const unsubscribe = subscribeSession(s => { observed = true; apply(s); });
  if (serverEnabled()) void getSession().then(s => { if (!observed) apply(s); });
  else apply(null);
  return () => { active = false; unsubscribe(); };
 }, []);
 const [saveFailed, setSaveFailed] = useState(false);
 const autosave = useMemo(() => createAutosave(saveStateNow, setSaveFailed), []);

 useEffect(() => {
  let active = true;
  void Promise.resolve().then(() => preparePrivateMediaCache()).then(() => loadState()).then(s => {
   if (!active) return;
   // A committed deletion may have been interrupted before unlinking its files.
   // Keep the pending intent visible if retry or its checkpoint fails.
   let recovered = s;
   try { recovered = retryMediaCleanup(s); } catch { /* pending queue remains visible */ }
   latest.current = recovered; setState(recovered);
  }).catch(() => { if (active) setLoadFailed(true); });
  return () => { active = false; };
 }, [loadAttempt]);
 // Flush pending writes when the app goes to background (the debounce must not lose the last edit).
 useEffect(() => {
  const sub = RNAppState.addEventListener('change', st => {
   if (st !== 'active') autosave.flush();
  });
  return () => { sub.remove(); autosave.cancelTimer(); };
 }, [autosave]);

 const latest = useRef<AppState | null>(null);
 /** Functional updates against the latest state: async photo reads never overwrite newer edits. */
 const update = useCallback((fn: (s: AppState) => AppState) => {
  const cur = latest.current; if (!cur) return;
  const next = fn(cur);
  latest.current = next;
  setState(next);
  autosave.schedule(next);
 }, [autosave]);

 if (loadFailed) return (
  <SafeAreaProvider>
   <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: C.bg }}>
    <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 12 }}>Archivio locale non disponibile</Text>
    <Text style={{ fontSize: 16, marginBottom: 20 }}>Non è stato possibile recuperare le pratiche salvate. Per evitare di sovrascrivere i dati, l'app non inizializza un nuovo archivio. Non disinstallare l'app né cancellarne i dati. Riprova o contatta l'assistenza.</Text>
    <Button title="Riprova" onPress={() => { setLoadFailed(false); setLoadAttempt(n => n + 1); }} />
   </View>
  </SafeAreaProvider>
 );
 if (!state || owner === undefined) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.brand} /></View>;

 const demo = !serverEnabled();
 const scopeKey = JSON.stringify([owner?.subject ?? null, owner?.organizationId ?? null, demo]);
 const visibleState: AppState = { version: 1, drafts: state.drafts.filter(d => canViewDraft(d, owner, demo)), pro: visiblePro(state, owner, demo) };
 const savePro = (profile: ProProfile): boolean => {
  const cur = latest.current;
  if (!cur || !sameOwner(owner, ownerRef.current) || (!owner && !demo)) return false;
  const next = storePro(cur, owner, demo, profile);
  try { saveStateNow(next); }
  catch { Alert.alert('Salvataggio non riuscito', 'Non è stato possibile salvare la candidatura sul telefono.'); return false; }
  autosave.committed();
  latest.current = next; setState(next);
  return true;
 };
 const draft = (id: string) => visibleState.drafts.find(d => d.id === id);
 const permitted = (id: string) => latest.current?.drafts.some(d => d.id === id && canViewDraft(d, ownerRef.current, demo)) ?? false;
 const publishCapture = (next: AppState, committed: boolean): boolean => {
  if (committed) autosave.committed();
  latest.current = next; setState(next);
  if (committed) return true;
  autosave.schedule(next);
  return autosave.flush();
 };
 const upsert = (d: Draft) => update(s => ({ ...s, drafts: [d, ...s.drafts.filter(x => x.id !== d.id)] }));
 const replace = (d: Draft) => update(s => ({ ...s, drafts: s.drafts.map(x => (x.id === d.id ? d : x)) }));
 const updateDraft = (id: string, fn: (d: Draft) => Draft) => update(s => ({ ...s, drafts: s.drafts.map(x => (x.id === id && canViewDraft(x, ownerRef.current, demo) ? fn(x) : x)) }));

 // Retry only the latest archive; a failed checkpoint leaves the pending
 // intents available for another attempt. No file paths or other account data in the UI.
 const retryCleanup = () => {
  const cur = latest.current;
  if (!cur?.pendingMediaCleanup?.length) return;
  try {
   const next = retryMediaCleanup(cur);
   autosave.committed();
   latest.current = next; setState(next);
  } catch {
   Alert.alert('Pulizia locale incompleta', 'Non è stato possibile completare la pulizia. Riprova.');
  }
 };

 // Do not acknowledge a deletion while an older snapshot can still be restored.
 const removeDraft = (id: string): boolean => {
  const cur = latest.current;
  if (!cur || !permitted(id)) return false;
  const logical = { ...cur, drafts: cur.drafts.filter(x => x.id !== id) };
  const queued = enqueueMediaCleanup(logical, id);
  const next = queued ?? logical;
  try { saveStateNow(next); }
  catch { Alert.alert('Eliminazione non riuscita', 'Non è stato possibile salvare la modifica. Riprova.'); return false; }
  autosave.committed();
  latest.current = next; setState(next);
  if (queued) retryCleanup();
  else Alert.alert('Pulizia locale incompleta', 'Non è stato possibile registrare la pulizia degli allegati. Contatta l’assistenza.');
  return true;
 };

 const startDraft = () => {
  if (!sameOwner(owner, ownerRef.current)) return;
  const d = newScopedDraft(ownerRef.current, demo);
  if (!d) return;
  upsert(d); setRoute({ name: 'wizard', id: d.id });
 };

 let screen: React.ReactNode = null;
 if (route.name === 'home') {
  screen = <HomeScreen key={scopeKey} state={visibleState} canStartDraft={demo || !!owner}
   onNew={startDraft}
   onOpen={d => setRoute(d.status !== 'bozza' || Object.keys(d.answers).length > 8 ? { name: 'result', id: d.id } : { name: 'wizard', id: d.id })}
   onDelete={d => { removeDraft(d.id); }}
   onPro={() => setRoute({ name: 'pro' })} />;
 } else if (route.name === 'wizard' && draft(route.id)) {
  const d = draft(route.id)!;
  screen = <WizardScreen key={`${d.id}-${route.step ?? ''}`} draft={d} startStepId={route.step}
   // Answers/photos of questions that become hidden are kept (the user may switch back); they are
   // excluded when sending.
   onUpdate={fn => updateDraft(d.id, fn)}
   onAddPhoto={(qid, f) => {
    const cur = latest.current;
    if (!cur || !permitted(d.id)) throw new Error('Richiesta non disponibile');
    return addDraftPhoto(cur, d.id, qid, f, publishCapture);
   }}
   onRemovePhoto={(qid, p) => {
    const cur = latest.current;
    const current = cur?.drafts.find(x => x.id === d.id);
    if (!cur || !current || !canViewDraft(current, ownerRef.current, demo)) return;
    const removal = removeDraftPhoto(current, qid, p.uri);
    if (!removal) return;
    const logical = { ...cur, drafts: cur.drafts.map(x => x.id === d.id ? removal.draft : x) };
    const queued = removal.unreferenced ? enqueueMediaCleanup(logical, d.id, removal.removed.uri) : logical;
    const next = queued ?? logical;
    try { saveStateNow(next); }
    catch { Alert.alert('Rimozione non riuscita', 'Non è stato possibile salvare la modifica. Riprova.'); return; }
    autosave.committed();
    latest.current = next; setState(next);
    if (removal.unreferenced) {
     if (queued) retryCleanup();
     else Alert.alert('Pulizia locale incompleta', 'Il riferimento è stato rimosso, ma il file non ha un percorso locale verificabile. Contatta l’assistenza.');
    }
   }}
   onClose={() => setRoute({ name: 'home' })}
   onFinish={() => setRoute({ name: 'result', id: d.id })} />;
 } else if (route.name === 'result' && draft(route.id)) {
  const d = draft(route.id)!;
  screen = <ResultScreen draft={d} onBack={() => setRoute({ name: 'home' })} onEditStep={step => setRoute({ name: 'wizard', id: d.id, step })} onUpdate={fn => updateDraft(d.id, fn)}
   onCheckpoint={async cp => {
    const cur = latest.current;
    if (!cur || !permitted(d.id) || (cp.remoteOwner && !canViewDraft({ ...d, ...cp }, ownerRef.current, demo))) throw new Error('Richiesta non più disponibile.');
    const next = { ...cur, drafts: cur.drafts.map(x => x.id === d.id ? { ...x, ...cp } : x) };
    latest.current = next; setState(next);
    autosave.schedule(next);
    if (!autosave.flush()) throw new Error('Salvataggio locale non riuscito. Riprova.');
   }}
   onDelete={() => { if (removeDraft(d.id)) setRoute({ name: 'home' }); }} />;
 } else if (route.name === 'pro') {
  screen = <ProScreen key={scopeKey} state={visibleState} canSaveLocally={!!owner || demo} onBack={() => setRoute({ name: 'home' })} onSaved={savePro} onInbox={() => { if (demo && sameOwner(owner, ownerRef.current)) setRoute({ name: 'inbox' }); }} onRemote={me => { if (ownerRef.current) setRoute(r => r.name === 'pro' ? { name: 'remote', me } : r); }} />;
 } else if (route.name === 'remote') {
  screen = <RemoteCertifier me={route.me} onBack={() => setRoute({ name: 'pro' })} onLogout={() => { void logout().catch(() => Alert.alert('Uscita incompleta', 'La sessione locale è stata chiusa, ma non è stato possibile confermare la rimozione delle credenziali dal dispositivo. Riprova a uscire o contatta l’assistenza.')); }} />;
 } else if (route.name === 'inbox' && demo && visibleState.pro) {
  screen = <InboxScreen state={visibleState} onBack={() => setRoute({ name: 'pro' })} onOpen={d => setRoute({ name: 'job', id: d.id })} />;
 } else if (route.name === 'job' && demo && visibleState.pro && draft(route.id)) {
  const d = draft(route.id)!;
  screen = <JobScreen draft={d} pro={visibleState.pro.data} onBack={() => setRoute({ name: 'inbox' })} onUpdate={fn => updateDraft(d.id, fn)}
   onLocalDeliver={async (code, cls, pdf) => {
    const cur = latest.current;
    if (!demo || !cur || !permitted(d.id)) throw new Error('Richiesta non disponibile');
    deliverDraftApe(cur, d.id, code, cls, pdf, publishCapture);
   }} />;
 } else {
  screen = <HomeScreen key={scopeKey} state={visibleState} canStartDraft={demo || !!owner}
   onNew={startDraft}
   onOpen={d => setRoute({ name: 'result', id: d.id })} onDelete={d => { removeDraft(d.id); }} onPro={() => setRoute({ name: 'pro' })} />;
 }

 return (
  <SafeAreaProvider>
   <StatusBar style={route.name === 'home' ? 'light' : 'dark'} />
   {saveFailed && (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#fff4d6', paddingHorizontal: 16, paddingBottom: 8 }}>
     <Text accessibilityRole="alert" style={{ color: '#422006', fontWeight: '600' }}>Modifiche non salvate sul dispositivo. Non chiudere l'app prima di aver riprovato.</Text>
     <Button title="Riprova salvataggio" onPress={() => { autosave.flush(); }} />
    </SafeAreaView>
   )}
   {!!state.pendingMediaCleanup?.length && (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#fff4d6', paddingHorizontal: 16, paddingBottom: 8 }}>
     <Text accessibilityRole="alert" style={{ color: '#422006', fontWeight: '600' }}>Pulizia locale in attesa. Alcuni file potrebbero essere ancora necessari o non rimossi.</Text>
     <Button title="Riprova pulizia locale" onPress={retryCleanup} />
    </SafeAreaView>
   )}
   {screen}
  </SafeAreaProvider>
 );
}
