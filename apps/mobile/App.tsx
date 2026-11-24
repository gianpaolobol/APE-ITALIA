import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState as RNAppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C } from './src/ui/theme';
import { HomeScreen } from './src/ui/HomeScreen';
import { WizardScreen } from './src/ui/WizardScreen';
import { ResultScreen } from './src/ui/ResultScreen';
import { ProScreen } from './src/ui/ProScreen';
import { InboxScreen } from './src/ui/InboxScreen';
import { JobScreen } from './src/ui/JobScreen';
import { RemoteCertifier } from './src/ui/RemoteCertifier';
import { getSession, logout, serverEnabled, subscribeSession } from './src/server';
import { canViewDraft, type DraftOwner, deleteMedia, deleteDraftPhotoFile, removeDraftPhoto, loadState, newDraft, persistPhoto, saveState, saveStateNow, type AppState, type Draft } from './src/survey/drafts';

type Route = { name: 'home' } | { name: 'wizard'; id: string; step?: string } | { name: 'result'; id: string } | { name: 'pro' } | { name: 'inbox' } | { name: 'job'; id: string } | { name: 'remote'; me: { name: string; sace: string } };

export default function App() {
 const [state, setState] = useState<AppState | null>(null);
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
   if (previous && (!s || previous.subject !== s.subject || previous.organizationId !== s.organizationId)) setRoute({ name: 'home' });
   else if (!s) setRoute(r => r.name === 'remote' ? { name: 'home' } : r);
  };
  const unsubscribe = subscribeSession(s => { observed = true; apply(s); });
  if (serverEnabled()) void getSession().then(s => { if (!observed) apply(s); });
  else apply(null);
  return () => { active = false; unsubscribe(); };
 }, []);
 const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

 useEffect(() => { loadState().then(s => { latest.current = s; setState(s); }); }, []);
 // Flush pending writes when the app goes to background (the debounce must not lose the last edit).
 useEffect(() => {
  const sub = RNAppState.addEventListener('change', st => {
   if (st !== 'active' && latest.current) { if (saveTimer.current) clearTimeout(saveTimer.current); saveState(latest.current).catch(() => undefined); }
  });
  return () => sub.remove();
 }, []);

 const latest = useRef<AppState | null>(null);
 /** Functional updates against the latest state: async photo reads never overwrite newer edits. */
 const update = useCallback((fn: (s: AppState) => AppState) => {
  const cur = latest.current; if (!cur) return;
  const next = fn(cur);
  latest.current = next;
  setState(next);
  if (saveTimer.current) clearTimeout(saveTimer.current);
  saveTimer.current = setTimeout(() => { saveState(next).catch(() => undefined); }, 300);
 }, []);

 if (!state || owner === undefined) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.brand} /></View>;

 const visibleState = { ...state, drafts: state.drafts.filter(d => canViewDraft(d, owner)) };
 const draft = (id: string) => visibleState.drafts.find(d => d.id === id);
 const permitted = (id: string) => latest.current?.drafts.some(d => d.id === id && canViewDraft(d, ownerRef.current)) ?? false;
 const upsert = (d: Draft) => update(s => ({ ...s, drafts: [d, ...s.drafts.filter(x => x.id !== d.id)] }));
 const replace = (d: Draft) => update(s => ({ ...s, drafts: s.drafts.map(x => (x.id === d.id ? d : x)) }));
 const updateDraft = (id: string, fn: (d: Draft) => Draft) => update(s => ({ ...s, drafts: s.drafts.map(x => (x.id === id && canViewDraft(x, ownerRef.current) ? fn(x) : x)) }));

 // Do not acknowledge a deletion while an older snapshot can still be restored.
 const removeDraft = (id: string): boolean => {
  const cur = latest.current;
  if (!cur || !permitted(id)) return false;
  const next = { ...cur, drafts: cur.drafts.filter(x => x.id !== id) };
  try { saveStateNow(next); }
  catch { Alert.alert('Eliminazione non riuscita', 'Non è stato possibile salvare la modifica. Riprova.'); return false; }
  if (saveTimer.current) clearTimeout(saveTimer.current);
  latest.current = next; setState(next);
  deleteMedia(id);
  return true;
 };

 let screen: React.ReactNode = null;
 if (route.name === 'home') {
  screen = <HomeScreen state={visibleState}
   onNew={() => { const d = { ...newDraft(), ...(ownerRef.current ? { localOwner: { subject: ownerRef.current.subject, organizationId: ownerRef.current.organizationId } } : {}) }; upsert(d); setRoute({ name: 'wizard', id: d.id }); }}
   onOpen={d => setRoute(d.status !== 'bozza' || Object.keys(d.answers).length > 8 ? { name: 'result', id: d.id } : { name: 'wizard', id: d.id })}
   onDelete={d => { removeDraft(d.id); }}
   onPro={() => setRoute({ name: 'pro' })} />;
 } else if (route.name === 'wizard' && draft(route.id)) {
  const d = draft(route.id)!;
  screen = <WizardScreen key={`${d.id}-${route.step ?? ''}`} draft={d} startStepId={route.step}
   // Answers/photos of questions that become hidden are kept (the user may switch back); they are
   // excluded when sending.
   onUpdate={fn => updateDraft(d.id, fn)}
   onAddPhoto={(qid, f) => { if (!permitted(d.id)) throw new Error('Richiesta non disponibile'); const ref = persistPhoto(d.id, f); updateDraft(d.id, cur => ({ ...cur, photos: { ...cur.photos, [qid]: [...(cur.photos[qid] ?? []), ref] }, updatedAt: new Date().toISOString() })); return ref; }}
   onRemovePhoto={(qid, p) => {
    const cur = latest.current;
    const current = cur?.drafts.find(x => x.id === d.id);
    if (!cur || !current || !canViewDraft(current, ownerRef.current)) return;
    const removal = removeDraftPhoto(current, qid, p.uri);
    if (!removal) return;
    const next = { ...cur, drafts: cur.drafts.map(x => x.id === d.id ? removal.draft : x) };
    try { saveStateNow(next); }
    catch { Alert.alert('Rimozione non riuscita', 'Non è stato possibile salvare la modifica. Riprova.'); return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    latest.current = next; setState(next);
    if (removal.unreferenced) deleteDraftPhotoFile(d.id, removal.removed);
   }}
   onClose={() => setRoute({ name: 'home' })}
   onFinish={() => setRoute({ name: 'result', id: d.id })} />;
 } else if (route.name === 'result' && draft(route.id)) {
  const d = draft(route.id)!;
  screen = <ResultScreen draft={d} onBack={() => setRoute({ name: 'home' })} onEditStep={step => setRoute({ name: 'wizard', id: d.id, step })} onUpdate={fn => updateDraft(d.id, fn)}
   onCheckpoint={async cp => {
    const cur = latest.current;
    if (!cur || !permitted(d.id) || (cp.remoteOwner && !canViewDraft({ ...d, ...cp }, ownerRef.current))) throw new Error('Richiesta non più disponibile.');
    const next = { ...cur, drafts: cur.drafts.map(x => x.id === d.id ? { ...x, ...cp } : x) };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    latest.current = next; setState(next);
    await saveState(next);
   }}
   onDelete={() => { if (removeDraft(d.id)) setRoute({ name: 'home' }); }} />;
 } else if (route.name === 'pro') {
  screen = <ProScreen state={visibleState} onBack={() => setRoute({ name: 'home' })} onSaved={pro => update(s => ({ ...s, pro }))} onInbox={() => setRoute({ name: 'inbox' })} onRemote={me => setRoute({ name: 'remote', me })} />;
 } else if (route.name === 'remote') {
  screen = <RemoteCertifier me={route.me} onBack={() => setRoute({ name: 'pro' })} onLogout={() => { logout().finally(() => setRoute({ name: 'home' })); }} />;
 } else if (route.name === 'inbox' && state.pro) {
  screen = <InboxScreen state={visibleState} onBack={() => setRoute({ name: 'pro' })} onOpen={d => setRoute({ name: 'job', id: d.id })} />;
 } else if (route.name === 'job' && state.pro && draft(route.id)) {
  const d = draft(route.id)!;
  screen = <JobScreen draft={d} pro={state.pro.data} onBack={() => setRoute({ name: 'inbox' })} onUpdate={fn => updateDraft(d.id, fn)} />;
 } else {
  screen = <HomeScreen state={visibleState}
   onNew={() => { const d = { ...newDraft(), ...(ownerRef.current ? { localOwner: { subject: ownerRef.current.subject, organizationId: ownerRef.current.organizationId } } : {}) }; upsert(d); setRoute({ name: 'wizard', id: d.id }); }}
   onOpen={d => setRoute({ name: 'result', id: d.id })} onDelete={d => { removeDraft(d.id); }} onPro={() => setRoute({ name: 'pro' })} />;
 }

 return (
  <SafeAreaProvider>
   <StatusBar style={route.name === 'home' ? 'light' : 'dark'} />
   {screen}
  </SafeAreaProvider>
 );
}
