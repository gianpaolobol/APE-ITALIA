/** Converts an HTML datetime-local value ("YYYY-MM-DDTHH:mm") interpreted in Europe/Rome to ISO UTC. */
export function romeLocalToIso(local: string): string {
 if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Invalid date/time');
 const asUtc = new Date(local + ':00Z');
 // Offset of Rome at that instant (+1 in winter, +2 in summer); one refinement pass handles DST edges.
 let offset = romeOffsetMinutes(asUtc);
 offset = romeOffsetMinutes(new Date(asUtc.getTime() - offset * 60_000));
 return new Date(asUtc.getTime() - offset * 60_000).toISOString();
}
function romeOffsetMinutes(at: Date): number {
 const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', timeZoneName: 'shortOffset' }).formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+1';
 const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
 if (!m) return 0;
 return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}
