import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState as RNAppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C } from './src/ui/theme';
import { HomeScreen } from './src/ui/HomeScreen';
import { WizardScreen } from './src/ui/WizardScreen';
import { ResultScreen } from './src/ui/ResultScreen';
import { ProScreen } from './src/ui/ProScreen';
import { InboxScreen } from './src/ui/InboxScreen';
import { JobScreen } from './src/ui/JobScreen';
import { deleteMedia, deletePhotoFile, loadState, newDraft, persistPhoto, saveState, type AppState, type Draft } from './src/survey/drafts';

type Route = { name: 'home' } | { name: 'wizard'; id: string; step?: string } | { name: 'result'; id: string } | { name: 'pro' } | { name: 'inbox' } | { name: 'job'; id: string };

export default function App() {
 const [state, setState] = useState<AppState | null>(null);
 const [route, setRoute] = useState<Route>({ name: 'home' });
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

 if (!state) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.brand} /></View>;

 const draft = (id: string) => state.drafts.find(d => d.id === id);
 const upsert = (d: Draft) => update(s => ({ ...s, drafts: [d, ...s.drafts.filter(x => x.id !== d.id)] }));
 const replace = (d: Draft) => update(s => ({ ...s, drafts: s.drafts.map(x => (x.id === d.id ? d : x)) }));
 const updateDraft = (id: string, fn: (d: Draft) => Draft) => update(s => ({ ...s, drafts: s.drafts.map(x => (x.id === id ? fn(x) : x)) }));

 let screen: React.ReactNode = null;
 if (route.name === 'home') {
  screen = <HomeScreen state={state}
   onNew={() => { const d = newDraft(); upsert(d); setRoute({ name: 'wizard', id: d.id }); }}
   onOpen={d => setRoute(d.status !== 'bozza' || Object.keys(d.answers).length > 8 ? { name: 'result', id: d.id } : { name: 'wizard', id: d.id })}
   onDelete={d => { deleteMedia(d.id); update(s => ({ ...s, drafts: s.drafts.filter(x => x.id !== d.id) })); }}
   onPro={() => setRoute({ name: 'pro' })} />;
 } else if (route.name === 'wizard' && draft(route.id)) {
  const d = draft(route.id)!;
  screen = <WizardScreen key={`${d.id}-${route.step ?? ''}`} draft={d} startStepId={route.step}
   // Answers/photos of questions that become hidden are kept (the user may switch back); they are
   // excluded when sending.
   onUpdate={fn => updateDraft(d.id, fn)}
   onAddPhoto={(qid, f) => { const ref = persistPhoto(d.id, f); updateDraft(d.id, cur => ({ ...cur, photos: { ...cur.photos, [qid]: [...(cur.photos[qid] ?? []), ref] }, updatedAt: new Date().toISOString() })); return ref; }}
   onRemovePhoto={(qid, p) => { deletePhotoFile(p); updateDraft(d.id, cur => ({ ...cur, photos: { ...cur.photos, [qid]: (cur.photos[qid] ?? []).filter(x => x.uri !== p.uri) } })); }}
   onClose={() => setRoute({ name: 'home' })}
   onFinish={() => setRoute({ name: 'result', id: d.id })} />;
 } else if (route.name === 'result' && draft(route.id)) {
  const d = draft(route.id)!;
  screen = <ResultScreen draft={d} onBack={() => setRoute({ name: 'home' })} onEditStep={step => setRoute({ name: 'wizard', id: d.id, step })} onUpdate={fn => updateDraft(d.id, fn)}
   onDelete={() => { deleteMedia(d.id); update(s => ({ ...s, drafts: s.drafts.filter(x => x.id !== d.id) })); setRoute({ name: 'home' }); }} />;
 } else if (route.name === 'pro') {
  screen = <ProScreen state={state} onBack={() => setRoute({ name: 'home' })} onSaved={pro => update(s => ({ ...s, pro }))} onInbox={() => setRoute({ name: 'inbox' })} />;
 } else if (route.name === 'inbox' && state.pro) {
  screen = <InboxScreen state={state} onBack={() => setRoute({ name: 'pro' })} onOpen={d => setRoute({ name: 'job', id: d.id })} />;
 } else if (route.name === 'job' && state.pro && draft(route.id)) {
  const d = draft(route.id)!;
  screen = <JobScreen draft={d} pro={state.pro.data} onBack={() => setRoute({ name: 'inbox' })} onUpdate={fn => updateDraft(d.id, fn)} />;
 } else {
  screen = <HomeScreen state={state} onNew={() => undefined} onOpen={() => undefined} onDelete={() => undefined} onPro={() => undefined} />;
 }

 return (
  <SafeAreaProvider>
   <StatusBar style={route.name === 'home' ? 'light' : 'dark'} />
   {screen}
  </SafeAreaProvider>
 );
}
