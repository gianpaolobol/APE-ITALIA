/**
 * Outgoing email port. Providers: Brevo HTTP API (MAILER=brevo, BREVO_API_KEY, MAIL_FROM) or a log mailer
 * for local development only (MAILER=log; refused when NODE_ENV=production).
 */
export type Mail = { to: string; subject: string; text: string };
export interface Mailer { send(m: Mail): Promise<void> }
export const MAILER = Symbol('MAILER');

export class BrevoMailer implements Mailer {
 constructor(private readonly apiKey: string, private readonly from: string, private readonly fetchImpl: typeof fetch = fetch) {}
 async send(m: Mail) {
  const res = await this.fetchImpl('https://api.brevo.com/v3/smtp/email', {
   method: 'POST', headers: { 'api-key': this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
   body: JSON.stringify({ sender: { email: this.from, name: 'APE Italia' }, to: [{ email: m.to }], subject: m.subject, textContent: m.text }),
   signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`mailer ${res.status}`);
 }
}

export class LogMailer implements Mailer {
 readonly sent: Mail[] = [];
 async send(m: Mail) { this.sent.push(m); if (process.env.NODE_ENV !== 'test') console.log(`[mail] to=${m.to} subject=${m.subject}\n${m.text}`); }
}

export function mailerFromEnv(env = process.env): Mailer | null {
 if (env.MAILER === 'brevo' && env.BREVO_API_KEY && env.MAIL_FROM) return new BrevoMailer(env.BREVO_API_KEY, env.MAIL_FROM);
 if (env.MAILER === 'log' && env.NODE_ENV !== 'production') return new LogMailer();
 return null;
}
