import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R, S } from './theme';
import { Button, Field, IconCircle } from './kit';
import { ServerError, startLogin, verifyLogin, type Session } from '../server';

/** Passwordless login: email, then the 6-digit code received by email. */
export function LoginSheet({ visible, initialEmail, title, onClose, onDone }: { visible: boolean; initialEmail?: string; title?: string; onClose: () => void; onDone: (s: Session) => void }) {
 const [email, setEmail] = useState(initialEmail ?? '');
 const [code, setCode] = useState('');
 const [step, setStep] = useState<'email' | 'code'>('email');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const send = async () => {
  setError(null);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setError('Email non valida'); return; }
  setBusy(true);
  try { await startLogin(email.trim()); setStep('code'); }
  catch (e) { setError(e instanceof ServerError && e.status === 429 ? 'Troppi tentativi: riprova tra un minuto.' : 'Non riesco a inviare il codice. Controlla la connessione.'); }
  finally { setBusy(false); }
 };
 const verify = async () => {
  setError(null); setBusy(true);
  try { onDone(await verifyLogin(email.trim(), code.trim())); setCode(''); setStep('email'); }
  catch { setError('Codice non valido o scaduto.'); }
  finally { setBusy(false); }
 };
 return (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
   <KeyboardAvoidingView style={st.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={st.sheet}>
     <Pressable onPress={onClose} hitSlop={12} style={{ alignSelf: 'flex-end' }}><Ionicons name="close" size={24} color={C.muted} /></Pressable>
     <IconCircle name={step === 'email' ? 'mail-outline' : 'keypad-outline'} size={52} />
     <Text style={[F.title, { marginTop: 12 }]}>{step === 'email' ? title ?? 'Accedi con la tua email' : 'Inserisci il codice'}</Text>
     <Text style={[F.body, { marginTop: 6, marginBottom: 16 }]}>{step === 'email' ? 'Ti mandiamo un codice di 6 cifre. Niente password da ricordare.' : `L’abbiamo inviato a ${email.trim()}. Controlla anche lo spam.`}</Text>
     {step === 'email'
      ? <Field value={email} onChangeText={setEmail} placeholder="nome@email.it" keyboard="email" autoCapitalize="none" />
      : <Field value={code} onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))} placeholder="123456" keyboard="numeric" maxLength={6} />}
     {error ? <Text style={st.err}>{error}</Text> : null}
     <Button title={step === 'email' ? 'Invia il codice' : 'Accedi'} icon={step === 'email' ? 'paper-plane-outline' : 'log-in-outline'} busy={busy}
      disabled={step === 'code' && code.length !== 6} onPress={step === 'email' ? send : verify} style={{ marginTop: S.m }} />
     {step === 'code' ? <Pressable onPress={() => { setStep('email'); setCode(''); }} style={{ marginTop: 14, alignSelf: 'center' }}><Text style={{ color: C.brand, fontWeight: '700' }}>Cambia email o rinvia il codice</Text></Pressable> : null}
    </View>
   </KeyboardAvoidingView>
  </Modal>
 );
}

const st = StyleSheet.create({
 backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8,30,25,0.45)' },
 sheet: { backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, padding: S.l, paddingBottom: 40 },
 err: { color: C.danger, fontWeight: '600', marginTop: 8 },
});
