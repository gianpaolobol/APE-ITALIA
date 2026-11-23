import { Platform } from 'react-native';

export const C = {
 bg: '#F5F6F2',
 surface: '#FFFFFF',
 surfaceAlt: '#EEF2EE',
 ink: '#0E1A16',
 inkSoft: '#3E4C47',
 muted: '#6C7A75',
 line: '#E1E7E2',
 brand: '#0D5B4A',
 brandDeep: '#083D32',
 brandSoft: '#DDEFE7',
 accent: '#25B07A',
 sun: '#F4B740',
 danger: '#C9302C',
 dangerSoft: '#FBE9E8',
 warnSoft: '#FFF4DB',
 white: '#FFFFFF',
};

export const R = { s: 10, m: 16, l: 22, xl: 28, pill: 999 };
export const S = { xs: 6, s: 10, m: 16, l: 22, xl: 32 };

export const F = {
 display: { fontSize: 32, lineHeight: 38, fontWeight: '800' as const, letterSpacing: -0.6, color: C.ink },
 title: { fontSize: 24, lineHeight: 30, fontWeight: '800' as const, letterSpacing: -0.4, color: C.ink },
 h3: { fontSize: 17, lineHeight: 22, fontWeight: '700' as const, color: C.ink },
 body: { fontSize: 15, lineHeight: 21, color: C.inkSoft },
 small: { fontSize: 13, lineHeight: 18, color: C.muted },
 label: { fontSize: 13, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 0.3, color: C.muted, textTransform: 'uppercase' as const },
};

export const shadow = Platform.select({
 ios: { shadowColor: '#0B2A22', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
 android: { elevation: 3 },
 default: {},
});
