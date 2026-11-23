import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Chips, Label } from './kit';
import { C, F } from './theme';

/** Next 14 days and half-hour slots 8:00–19:30; returns an ISO date-time. */
export function SlotPicker({ label, value, onChange }: { label: string; value?: string; onChange: (iso: string) => void }) {
 const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i + 1); return d; }), []);
 const init = value ? new Date(value) : undefined;
 const [day, setDay] = useState<string | undefined>(init ? init.toDateString() : undefined);
 const [time, setTime] = useState<string | undefined>(init ? `${String(init.getHours()).padStart(2, '0')}:${String(init.getMinutes()).padStart(2, '0')}` : undefined);
 const times = Array.from({ length: 24 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
 const emit = (d?: string, t?: string) => {
  if (!d || !t) return;
  const base = days.find(x => x.toDateString() === d)!;
  const [h, m] = t.split(':').map(Number);
  const out = new Date(base); out.setHours(h, m, 0, 0);
  onChange(out.toISOString());
 };
 return (
  <View style={{ marginBottom: 14 }}>
   <Label>{label}</Label>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
    <Chips options={days.map(d => ({ value: d.toDateString(), label: d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) }))}
     value={day} onChange={v => { setDay(v); emit(v, time); }} />
   </ScrollView>
   {day ? <Chips options={times.map(t => ({ value: t, label: t }))} value={time} onChange={v => { setTime(v); emit(day, v); }} /> : <Text style={[F.small, { color: C.muted }]}>Scegli prima il giorno</Text>}
  </View>
 );
}
