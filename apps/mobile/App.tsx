import React, { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { REQUEST_STEPS, STEP_LABELS, validateProperty } from './src/workflow';
import { getVerifiedSession } from './src/session';
import { submitApeRequest } from './src/submit-request';

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
 const input={address:address.trim(),city:city.trim(),region:region.trim(),...(area.trim()?{floorAreaM2:Number(area.replace(',','.'))}:{})};
 const advance=()=>{
  if(step===0 && validateProperty(input).length){Alert.alert('Dati mancanti','Inserisci indirizzo, comune e regione; la superficie deve essere positiva.');return;}
  setStep(v=>Math.min(REQUEST_STEPS.length-1,v+1));
 };
 const submit=async()=>{
  if(busy)return;
  setBusy(true);
  try {
   const session=await getVerifiedSession();
   if(!session){Alert.alert('Accesso necessario','Il login sicuro non è ancora disponibile. Questa demo non invia dati al server.');return;}
   const created=await submitApeRequest(session,input);
   setResult('Pratica creata: '+created.id);
  } catch(e){Alert.alert('Richiesta non inviata',e instanceof Error?e.message:'Errore imprevisto');}
  finally{setBusy(false);}
 };
 return <SafeAreaView style={s.root}><ScrollView contentContainerStyle={s.page}>
  <Text style={s.brand}>APE Italia</Text>
  <Text style={s.subtitle}>Richiesta APE assistita · {role==='privato'?'Privati':'Professionisti'}</Text>
  <Text style={s.warning}>Prototipo: nessuna certificazione ufficiale. Il login e il caricamento documenti non sono ancora attivi.</Text>
  <View style={s.row}>{(['privato','professionista'] as Role[]).map(r=><TouchableOpacity key={r} accessibilityRole="button" onPress={()=>setRole(r)} style={[s.tab,role===r&&s.active]}><Text style={role===r?s.white:s.dark}>{r==='privato'?'Privati':'Professionisti'}</Text></TouchableOpacity>)}</View>
  <Text style={s.heading}>{STEP_LABELS[REQUEST_STEPS[step]]} · {step+1}/{REQUEST_STEPS.length}</Text>
  {step===0?<><Text style={s.label}>Indirizzo *</Text><TextInput style={s.input} value={address} onChangeText={setAddress} placeholder="Via e civico"/><Text style={s.label}>Comune *</Text><TextInput style={s.input} value={city} onChangeText={setCity} placeholder="Es. Bologna"/><Text style={s.label}>Regione *</Text><TextInput style={s.input} value={region} onChangeText={setRegion}/><Text style={s.label}>Superficie indicativa (m²)</Text><TextInput style={s.input} value={area} onChangeText={setArea} keyboardType="decimal-pad" placeholder="Es. 85"/></>:
   <Text style={s.body}>{step===1?'Fotografie di caldaia, targhetta e terminali: caricamento in sviluppo.':step===2?'Documentazione di pareti, serramenti e stratigrafie: caricamento in sviluppo.':step===3?'Planimetria e libretto impianto: caricamento in sviluppo.':'Verifica i dati. Un certificatore dovrà effettuare sopralluogo, calcolo e deposito. Il login è necessario per inviare la pratica.'}</Text>}
  <View style={s.row}><TouchableOpacity accessibilityRole="button" onPress={()=>setStep(v=>Math.max(0,v-1))} style={s.tab}><Text>Indietro</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={step===4?submit:advance} style={[s.tab,s.active]}><Text style={s.white}>{step===4?(busy?'Attendere':'Invia richiesta'): 'Avanti'}</Text></TouchableOpacity></View>
  {result?<Text style={s.body}>{result}</Text>:null}
  <Text style={s.foot}>I dati rimangono temporaneamente nella memoria dell'app fino all'attivazione di autenticazione e salvataggio sicuro.</Text>
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#f6faf7'},page:{padding:24,gap:16},brand:{fontSize:30,fontWeight:'800',color:'#176344'},subtitle:{fontSize:16},warning:{backgroundColor:'#fff4d6',padding:12,borderRadius:8},row:{flexDirection:'row',gap:10},tab:{flex:1,padding:13,alignItems:'center',borderRadius:9,backgroundColor:'#e5ece8'},active:{backgroundColor:'#176344'},dark:{color:'#18352b'},white:{color:'#fff',fontWeight:'700'},heading:{fontSize:23,fontWeight:'700',marginTop:12},label:{fontWeight:'600'},input:{backgroundColor:'#fff',borderColor:'#cad8d0',borderWidth:1,padding:12,borderRadius:8},body:{fontSize:16,lineHeight:24},foot:{fontSize:12,color:'#586b61',marginTop:24}});
