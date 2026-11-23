import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F, R, S, shadow } from './theme';
import { CLASSES, CLASS_COLORS, type EnergyClass } from '../energy/estimate';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export const tap = () => { Haptics.selectionAsync().catch(() => undefined); };

export function Button({ title, onPress, kind = 'primary', icon, disabled, busy, style }: {
 title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>;
}) {
 const bg = kind === 'primary' ? C.brand : kind === 'secondary' ? C.brandSoft : kind === 'danger' ? C.dangerSoft : 'transparent';
 const fg = kind === 'primary' ? C.white : kind === 'danger' ? C.danger : C.brand;
 return (
  <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled, busy: !!busy }} disabled={disabled || busy}
   onPress={() => { tap(); onPress(); }}
   style={({ pressed }) => [st.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}>
   {busy ? <ActivityIndicator color={fg} /> : <>
    {icon ? <Ionicons name={icon} size={19} color={fg} style={{ marginRight: 8 }} /> : null}
    <Text style={[st.btnText, { color: fg }]}>{title}</Text>
   </>}
  </Pressable>
 );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
 if (!onPress) return <View style={[st.card, style]}>{children}</View>;
 return <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => [st.card, style, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}>{children}</Pressable>;
}

export function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
 return <Text style={st.qLabel}>{children}{required ? <Text style={{ color: C.accent }}> •</Text> : null}</Text>;
}

export function Help({ children }: { children: React.ReactNode }) {
 return <Text style={[F.small, { marginTop: 4 }]}>{children}</Text>;
}

export function ChoiceCards({ options, value, onChange }: { options: Array<{ value: string; label: string; hint?: string; icon?: string }>; value?: string; onChange: (v: string) => void }) {
 return (
  <View style={st.grid}>
   {options.map(o => {
    const on = value === o.value;
    return (
     <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { tap(); onChange(o.value); }}
      style={({ pressed }) => [st.choice, on && st.choiceOn, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={[st.choiceIcon, on && { backgroundColor: C.brand }]}>
       <Ionicons name={(o.icon ?? 'ellipse-outline') as IconName} size={20} color={on ? C.white : C.brand} />
      </View>
      <Text style={[st.choiceTitle, on && { color: C.brandDeep }]} numberOfLines={2}>{o.label}</Text>
      {o.hint ? <Text style={st.choiceHint} numberOfLines={2}>{o.hint}</Text> : null}
      {on ? <Ionicons name="checkmark-circle" size={20} color={C.brand} style={st.check} /> : null}
     </Pressable>
    );
   })}
  </View>
 );
}

export function Chips({ options, value, onChange, multi }: { options: Array<{ value: string; label: string }>; value?: string | string[]; onChange: (v: string) => void; multi?: boolean }) {
 return (
  <View style={st.chips}>
   {options.map(o => {
    const on = Array.isArray(value) ? value.includes(o.value) : value === o.value;
    return (
     <Pressable key={o.value} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={{ selected: on, checked: on }} onPress={() => { tap(); onChange(o.value); }}
      style={({ pressed }) => [st.chip, on && st.chipOn, pressed && { opacity: 0.85 }]}>
      {on && multi ? <Ionicons name="checkmark" size={15} color={C.white} style={{ marginRight: 4 }} /> : null}
      <Text style={[st.chipText, on && { color: C.white }]}>{o.label}</Text>
     </Pressable>
    );
   })}
  </View>
 );
}

export function Field({ value, onChangeText, placeholder, unit, keyboard, autoCapitalize, maxLength, error, onBlur, secure }: {
 value: string; onChangeText: (t: string) => void; placeholder?: string; unit?: string; keyboard?: 'default' | 'email' | 'phone' | 'numeric' | 'decimal';
 autoCapitalize?: 'none' | 'words' | 'sentences'; maxLength?: number; error?: string | null; onBlur?: () => void; secure?: boolean;
}) {
 const kt = keyboard === 'email' ? 'email-address' : keyboard === 'phone' ? 'phone-pad' : keyboard === 'numeric' ? 'number-pad' : keyboard === 'decimal' ? 'decimal-pad' : 'default';
 return (
  <View>
   <View style={[st.field, !!error && { borderColor: C.danger }]}>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#A3AEA9" keyboardType={kt} secureTextEntry={secure}
     autoCapitalize={autoCapitalize ?? 'sentences'} autoCorrect={false} maxLength={maxLength} onBlur={onBlur} style={st.input} />
    {unit ? <Text style={st.unit}>{unit}</Text> : null}
   </View>
   {error ? <Text style={st.err}>{error}</Text> : null}
  </View>
 );
}

export function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
 return (
  <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => { tap(); onChange(!value); }} style={st.toggleRow}>
   <Text style={[F.body, { flex: 1, color: C.ink }]}>{label}</Text>
   <View style={[st.switch, value && { backgroundColor: C.brand }]}>
    <View style={[st.knob, value && { transform: [{ translateX: 20 }] }]} />
   </View>
  </Pressable>
 );
}

export function ProgressBar({ ratio, color = C.accent, track = C.line }: { ratio: number; color?: string; track?: string }) {
 const w = useRef(new Animated.Value(ratio)).current;
 useEffect(() => { Animated.timing(w, { toValue: ratio, duration: 350, useNativeDriver: false }).start(); }, [ratio, w]);
 return (
  <View style={[st.track, { backgroundColor: track }]}>
   <Animated.View style={[st.fill, { backgroundColor: color, width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
  </View>
 );
}

export function ClassBadge({ value, size = 64 }: { value: EnergyClass; size?: number }) {
 return (
  <View style={{ width: size * 1.25, height: size, borderRadius: size * 0.22, backgroundColor: CLASS_COLORS[value], alignItems: 'center', justifyContent: 'center' }}>
   <Text style={{ color: C.white, fontWeight: '900', fontSize: size * 0.46, letterSpacing: -1 }}>{value}</Text>
  </View>
 );
}

/** Horizontal A4…G scale with the estimated class highlighted and the uncertainty range underlined. */
export function ClassScale({ value, range }: { value: EnergyClass; range: [EnergyClass, EnergyClass] }) {
 const lo = CLASSES.indexOf(range[0]), hi = CLASSES.indexOf(range[1]);
 return (
  <View>
   <View style={{ flexDirection: 'row', gap: 3 }}>
    {CLASSES.map((c, i) => {
     const on = c === value; const inRange = i >= lo && i <= hi;
     return (
      <View key={c} style={{ flex: 1, alignItems: 'center' }}>
       <View style={{ height: on ? 40 : 28, alignSelf: 'stretch', borderRadius: 7, backgroundColor: CLASS_COLORS[c], opacity: on ? 1 : inRange ? 0.75 : 0.28, alignItems: 'center', justifyContent: 'center', marginTop: on ? 0 : 6 }}>
        <Text style={{ color: C.white, fontWeight: '800', fontSize: on ? 14 : 11 }}>{c}</Text>
       </View>
       <View style={{ height: 3, alignSelf: 'stretch', marginTop: 6, borderRadius: 2, backgroundColor: inRange ? C.ink : 'transparent' }} />
      </View>
     );
    })}
   </View>
   <Text style={[F.small, { marginTop: 6 }]}>Linea nera: intervallo plausibile con i dati inseriti</Text>
  </View>
 );
}

export function Pill({ text, tone = 'brand', icon }: { text: string; tone?: 'brand' | 'warn' | 'danger' | 'muted'; icon?: IconName }) {
 const map = { brand: [C.brandSoft, C.brandDeep], warn: [C.warnSoft, '#8A5A00'], danger: [C.dangerSoft, C.danger], muted: [C.surfaceAlt, C.inkSoft] } as const;
 const [bg, fg] = map[tone];
 return (
  <View style={[st.pill, { backgroundColor: bg }]}>
   {icon ? <Ionicons name={icon} size={13} color={fg} style={{ marginRight: 4 }} /> : null}
   <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{text}</Text>
  </View>
 );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: { label: string; onPress: () => void } }) {
 return (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: S.l, marginBottom: S.s }}>
   <Text style={[F.label, { flex: 1 }]}>{children}</Text>
   {action ? <Pressable onPress={action.onPress} hitSlop={10}><Text style={{ color: C.brand, fontWeight: '700' }}>{action.label}</Text></Pressable> : null}
  </View>
 );
}

export function IconCircle({ name, color = C.brand, bg = C.brandSoft, size = 40 }: { name: IconName; color?: string; bg?: string; size?: number }) {
 return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={name} size={size * 0.5} color={color} /></View>;
}

const st = StyleSheet.create({
 btn: { minHeight: 54, borderRadius: R.m, paddingHorizontal: S.l, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
 btnText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.1 },
 card: { backgroundColor: C.surface, borderRadius: R.l, padding: S.m, ...shadow },
 qLabel: { fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: S.s },
 grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
 choice: { width: '48.4%', minHeight: 118, backgroundColor: C.surface, borderRadius: R.m, padding: 14, borderWidth: 1.5, borderColor: C.line },
 choiceOn: { borderColor: C.brand, backgroundColor: '#F3FAF6' },
 choiceIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
 choiceTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
 choiceHint: { fontSize: 12, lineHeight: 16, color: C.muted, marginTop: 3 },
 check: { position: 'absolute', top: 10, right: 10 },
 chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
 chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.pill, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.line },
 chipOn: { backgroundColor: C.brand, borderColor: C.brand },
 chipText: { fontSize: 14, fontWeight: '600', color: C.ink },
 field: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.m, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: 14, minHeight: 54 },
 input: { flex: 1, fontSize: 17, color: C.ink, paddingVertical: 12 },
 unit: { fontSize: 15, fontWeight: '700', color: C.muted, marginLeft: 8 },
 err: { color: C.danger, fontSize: 13, marginTop: 5, fontWeight: '600' },
 toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.m, padding: 14, borderWidth: 1.5, borderColor: C.line },
 switch: { width: 50, height: 30, borderRadius: 15, backgroundColor: '#CBD5D0', padding: 3 },
 knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.white },
 track: { height: 6, borderRadius: 3, overflow: 'hidden' },
 fill: { height: 6, borderRadius: 3 },
 pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill },
});
