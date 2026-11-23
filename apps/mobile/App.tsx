import React, { useCallback, useEffect, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { REQUEST_STEPS, STEP_LABELS, validateProperty } from './src/workflow';
import { resolveApiSession } from './src/session';
import { submitApeRequest } from './src/submit-request';
import { appAuthConfig, oidcClient } from './src/auth/runtime';
import { AuthError } from './src/auth/oidc';
import { ApeApi, ApiError, type ApiSession, type MembershipInfo } from './src/api';
import { STEP_EVIDENCE, type EvidenceRecord } from './src/evidence';
import { EvidenceStep } from './src/ui/EvidenceStep';
import { CaseList } from './src/ui/CaseList';

type Role = 'privato' | 'professionista';
export default function App() {
 const [role,setRole]=useState<Role>('privato');
 const [step,setStep]=useState(0);
 const [address,setAddress]=useState('');
 const [city,setCity]=useState('');
 const [region,setRegion]=useState('Emilia-Romagna');
 const [area,setArea]=useState('');
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState('');
 const [signedIn,setSignedIn]=useState(false);
 const [memberships,setMemberships]=useState<MembershipInfo[]>([]);
 const [orgId,setOrgId]=useState<string|undefined>();
 const [authBusy,setAuthBusy]=useState(false);
 const [api,setApi]=useState<ApeApi|null>(null);
 const [caseId,setCaseId]=useState<string|undefined>();
 const [submitted,setSubmitted]=useState(false);
 const [consentVersion,setConsentVersion]=useState<string|undefined>();
 const [consented,setConsented]=useState(false);
 const [evidence,setEvidence]=useState<EvidenceRecord[]>([]);
 const [view,setView]=useState<'new'|'cases'>('new');
 const input={address:address.trim(),city:city.trim(),region:region.trim(),...(area.trim()?{floorAreaM2:Number(area.replace(',','.'))}:{})};

 /** Builds a fresh API client from the current verified session (tokens are refreshed transparently). */
 const freshApi=useCallback(async():Promise<{api:ApeApi;session:ApiSession}|null>=>{
  if(!oidcClient||!appAuthConfig)return null;
  const r=await resolveApiSession(oidcClient,appAuthConfig.apiBaseUrl,orgId);
  setMemberships(r.memberships);
  if(!orgId&&r.session)setOrgId(r.session.organizationId);
  const next=r.session?new ApeApi(r.session):null;
  setApi(next);
  return next&&r.session?{api:next,session:r.session}:null;
 },[orgId]);

 const refreshIdentity=useCallback(async()=>{
  if(!oidcClient){setSignedIn(false);return;}
  const s=await oidcClient.getSession();
  setSignedIn(!!s);
  if(!s){setMemberships([]);setApi(null);return;}
  await freshApi();
 },[freshApi]);
 useEffect(()=>{refreshIdentity().catch(()=>setSignedIn(false));},[refreshIdentity]);
 useEffect(()=>{if(signedIn&&step>0)freshApi().catch(()=>setApi(null));},[step,signedIn,freshApi]);

 const login=async()=>{
  if(!oidcClient||authBusy)return;
  setAuthBusy(true);
  try{await oidcClient.login();await refreshIdentity();}
  catch(e){if(!(e instanceof AuthError&&e.code==='cancelled'))Alert.alert('Accesso non riuscito',e instanceof AuthError?'Verifica non superata ('+e.code+'). Riprova.':'Errore imprevisto');}
  finally{setAuthBusy(false);}
 };
 const logout=async()=>{
  if(!oidcClient)return;
  setAuthBusy(true);
  try{await oidcClient.logout();}finally{
   setSignedIn(false);setMemberships([]);setOrgId(undefined);setApi(null);setCaseId(undefined);setConsented(false);setEvidence([]);setSubmitted(false);setAuthBusy(false);
  }
 };

 const advance=async()=>{
  if(step===0){
   if(validateProperty(input).length){Alert.alert('Dati mancanti','Inserisci indirizzo, comune e regione; la superficie deve essere positiva.');return;}
   if(signedIn&&!caseId){
    setBusy(true);
    try{
     const ctx=await freshApi();
     if(!ctx){Alert.alert('Organizzazione richiesta',memberships.length>1?'Seleziona l\'organizzazione.':'Il tuo account non è ancora abilitato per alcuna organizzazione.');return;}
     const created=await submitApeRequest(ctx.session,input);
     setCaseId(created.id);
     const notices=await ctx.api.getNotices();
     setConsentVersion(notices.evidence_processing);
    }catch(e){Alert.alert('Bozza non creata',e instanceof ApiError?e.message:e instanceof Error?e.message:'Errore imprevisto');return;}
    finally{setBusy(false);}
   }
  }
  setStep(v=>Math.min(REQUEST_STEPS.length-1,v+1));
 };
 const giveConsent=async()=>{
  if(!api||!caseId||!consentVersion)throw new Error('missing context');
  await api.giveConsent(caseId,consentVersion);
  setConsented(true);
 };
 const submit=async()=>{
  if(busy)return;
  if(!oidcClient||!appAuthConfig){Alert.alert('Accesso non configurato','Questa build non ha un provider di identità configurato: nessun dato viene inviato.');return;}
  if(!signedIn||!caseId){Alert.alert('Accesso necessario','Accedi e crea la bozza al primo passaggio per inviare la richiesta.');return;}
  setBusy(true);
  try{
   const ctx=await freshApi();
   if(!ctx){Alert.alert('Sessione scaduta','Accedi di nuovo.');return;}
   const c=await ctx.api.submitCase(caseId);
   setSubmitted(true);
   setResult('Richiesta inviata (pratica '+c.id.slice(0,8)+'). Un certificatore abilitato la prenderà in carico per verifica e sopralluogo.');
  }catch(e){Alert.alert('Richiesta non inviata',e instanceof ApiError?e.message:'Errore imprevisto');}
  finally{setBusy(false);}
 };

 const current=REQUEST_STEPS[step];
 const kinds=STEP_EVIDENCE[current];
 return <SafeAreaView style={s.root}><ScrollView contentContainerStyle={s.page}>
  <Text style={s.brand}>APE Italia</Text>
  <Text style={s.subtitle}>Richiesta APE assistita · {role==='privato'?'Privati':'Professionisti'}</Text>
  <Text style={s.warning}>Prototipo: nessuna certificazione ufficiale. L'APE è redatto, firmato e depositato solo da un certificatore abilitato dopo il sopralluogo.</Text>
  {!oidcClient?<Text style={s.body}>Accesso non configurato in questa build (modalità dimostrativa senza invio dati).</Text>:
   <View style={s.row}><TouchableOpacity accessibilityRole="button" disabled={authBusy} onPress={signedIn?logout:login} style={[s.tab,s.active]}><Text style={s.white}>{authBusy?'Attendere':signedIn?'Esci':'Accedi'}</Text></TouchableOpacity></View>}
  {signedIn&&memberships.length>1&&!caseId?<View style={s.row}>{memberships.map(m=><TouchableOpacity key={m.organizationId} accessibilityRole="button" onPress={()=>setOrgId(m.organizationId)} style={[s.tab,orgId===m.organizationId&&s.active]}><Text style={orgId===m.organizationId?s.white:s.dark}>{m.organizationName}</Text></TouchableOpacity>)}</View>:null}
  {signedIn?<View style={s.row}>{([['new','Nuova richiesta'],['cases','Le mie pratiche']] as const).map(([k,l])=><TouchableOpacity key={k} accessibilityRole="button" onPress={()=>{setView(k);if(k==='cases')freshApi().catch(()=>setApi(null));}} style={[s.tab,view===k&&s.active]}><Text style={view===k?s.white:s.dark}>{l}</Text></TouchableOpacity>)}</View>:null}
  {view==='cases'&&signedIn?<CaseList api={api}/>:<>
  <View style={s.row}>{(['privato','professionista'] as Role[]).map(r=><TouchableOpacity key={r} accessibilityRole="button" onPress={()=>setRole(r)} style={[s.tab,role===r&&s.active]}><Text style={role===r?s.white:s.dark}>{r==='privato'?'Privati':'Professionisti'}</Text></TouchableOpacity>)}</View>
  <Text style={s.heading}>{STEP_LABELS[current]} · {step+1}/{REQUEST_STEPS.length}</Text>
  {step===0?<>
   {caseId?<Text style={s.body}>Bozza creata: i dati dell'immobile sono stati salvati.</Text>:null}
   <Text style={s.label}>Indirizzo *</Text><TextInput editable={!caseId} style={s.input} value={address} onChangeText={setAddress} placeholder="Via e civico"/>
   <Text style={s.label}>Comune *</Text><TextInput editable={!caseId} style={s.input} value={city} onChangeText={setCity} placeholder="Es. Bologna"/>
   <Text style={s.label}>Regione *</Text><TextInput editable={!caseId} style={s.input} value={region} onChangeText={setRegion}/>
   <Text style={s.label}>Superficie indicativa (m²)</Text><TextInput editable={!caseId} style={s.input} value={area} onChangeText={setArea} keyboardType="decimal-pad" placeholder="Es. 85"/>
  </>:kinds?<EvidenceStep api={api} caseId={caseId} kinds={kinds} consented={consented} consentVersion={consentVersion} onConsent={giveConsent} items={evidence} onUploaded={i=>setEvidence(v=>[...v,i])}/>:
   <Text style={s.body}>{caseId?`Allegati caricati: ${evidence.length}. `:''}Verifica i dati. Un certificatore abilitato dovrà effettuare sopralluogo, calcolo, firma e deposito. L'accesso è necessario per inviare la pratica.</Text>}
  <View style={s.row}>
   <TouchableOpacity accessibilityRole="button" onPress={()=>setStep(v=>Math.max(0,v-1))} style={s.tab}><Text>Indietro</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" disabled={busy||submitted} onPress={step===REQUEST_STEPS.length-1?submit:advance} style={[s.tab,s.active]}><Text style={s.white}>{busy?'Attendere':step===REQUEST_STEPS.length-1?(submitted?'Inviata':'Invia richiesta'):step===0&&signedIn&&!caseId?'Crea bozza':'Avanti'}</Text></TouchableOpacity>
  </View>
  {result?<Text style={s.body}>{result}</Text>:null}
  </>}
  <Text style={s.foot}>Le credenziali di sessione sono custodite nell'archivio sicuro del dispositivo. Le foto vengono inviate cifrate in transito e conservate cifrate.</Text>
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#f6faf7'},page:{padding:24,gap:16},brand:{fontSize:30,fontWeight:'800',color:'#176344'},subtitle:{fontSize:16},warning:{backgroundColor:'#fff4d6',padding:12,borderRadius:8},row:{flexDirection:'row',gap:10},tab:{flex:1,padding:13,alignItems:'center',borderRadius:9,backgroundColor:'#e5ece8'},active:{backgroundColor:'#176344'},dark:{color:'#18352b'},white:{color:'#fff',fontWeight:'700'},heading:{fontSize:23,fontWeight:'700',marginTop:12},label:{fontWeight:'600'},input:{backgroundColor:'#fff',borderColor:'#cad8d0',borderWidth:1,padding:12,borderRadius:8},body:{fontSize:16,lineHeight:24},foot:{fontSize:12,color:'#586b61',marginTop:24}});
