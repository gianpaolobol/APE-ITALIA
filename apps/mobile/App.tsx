import React, { useState } from 'react';
import { SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';

type Role = 'privato' | 'professionista';
const steps = ['Immobile', 'Impianto', 'Involucro', 'Documenti', 'Riepilogo'];
export default function App() {
  const [role, setRole] = useState<Role>('privato');
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  return <SafeAreaView style={s.root}><ScrollView contentContainerStyle={s.page}>
    <Text style={s.brand}>APE Italia</Text>
    <Text style={s.subtitle}>Richiedi una certificazione energetica assistita</Text>
    <Text style={s.warning}>Demo: nessun APE ufficiale viene emesso da questa applicazione.</Text>
    <View style={s.row}>{(['privato','professionista'] as Role[]).map(r=><TouchableOpacity key={r} accessibilityRole="button" onPress={()=>setRole(r)} style={[s.tab,role===r&&s.active]}><Text style={role===r?s.white:s.dark}>{r==='privato'?'Privati':'Professionisti'}</Text></TouchableOpacity>)}</View>
    <Text style={s.heading}>{steps[step]} · {step+1}/5</Text>
    {step===0 ? <><Text style={s.label}>Indirizzo immobile</Text><TextInput style={s.input} value={address} onChangeText={setAddress} placeholder="Via, civico, comune" /><Text style={s.label}>Superficie indicativa (m²)</Text><TextInput style={s.input} value={area} onChangeText={setArea} keyboardType="decimal-pad" placeholder="Es. 85" /></> :
      <Text style={s.body}>{step===1?'Raccogli foto della caldaia, della targhetta e dei terminali.':step===2?'Documenta pareti, serramenti e stratigrafie note.':step===3?'Carica planimetria, libretto impianto e schede tecniche.':'Controlla i dati: il certificatore dovrà verificarli e svolgere il sopralluogo.'}</Text>}
    <View style={s.row}><TouchableOpacity accessibilityRole="button" onPress={()=>setStep(Math.max(0,step-1))} style={s.tab}><Text>Indietro</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={()=>setStep(Math.min(4,step+1))} style={[s.tab,s.active]}><Text style={s.white}>{step===4?'Fine demo':'Avanti'}</Text></TouchableOpacity></View>
    <Text style={s.foot}>I dati inseriti restano in memoria locale durante questa demo: backend e caricamenti sono ancora da implementare.</Text>
  </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#f6faf7'},page:{padding:24,gap:16},brand:{fontSize:30,fontWeight:'800',color:'#176344'},subtitle:{fontSize:16},warning:{backgroundColor:'#fff4d6',padding:12,borderRadius:8},row:{flexDirection:'row',gap:10},tab:{flex:1,padding:13,alignItems:'center',borderRadius:9,backgroundColor:'#e5ece8'},active:{backgroundColor:'#176344'},white:{color:'#fff',fontWeight:'700'},dark:{color:'#18352b'},heading:{fontSize:23,fontWeight:'700',marginTop:12},label:{fontWeight:'600'},input:{backgroundColor:'#fff',borderColor:'#cad8d0',borderWidth:1,padding:12,borderRadius:8},body:{fontSize:16,lineHeight:24},foot:{fontSize:12,color:'#586b61',marginTop:24}});
