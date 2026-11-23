import type { PrismaClient } from '@prisma/client';
import type { Mailer } from './mailer';

type Db = Pick<PrismaClient, 'platformUser' | 'membership' | 'certifier' | 'assignment'>;
const APP = 'Apri l’app APE Italia per i dettagli.';

/** Email of a platform account subject (usr_<id>); OIDC subjects have no stored email. */
async function emailOf(db: Db, subject: string): Promise<string | null> {
 if (!subject.startsWith('usr_')) return null;
 const u = await db.platformUser.findUnique({ where: { id: subject.slice(4) }, select: { email: true, deletedAt: true } });
 return u && !u.deletedAt ? u.email : null;
}

/** Best effort: notifications never make the business operation fail. */
async function send(mailer: Mailer | null, to: (string | null)[], subject: string, text: string) {
 if (!mailer) return;
 for (const t of [...new Set(to.filter((x): x is string => !!x))]) await mailer.send({ to: t, subject, text: `${text}\n\n${APP}` }).catch(() => undefined);
}

export async function notifyCustomer(db: Db, mailer: Mailer | null, organizationId: string, subject: string, text: string) {
 const owners = await db.membership.findMany({ where: { organizationId, active: true, role: { in: ['owner', 'admin'] } }, select: { userSubject: true } });
 await send(mailer, await Promise.all(owners.map(o => emailOf(db, o.userSubject))), subject, text);
}

export async function notifyNewOffer(db: Db, mailer: Mailer | null, caseId: string) {
 const a = await db.assignment.findFirst({ where: { caseId, status: 'OFFERED' }, orderBy: { offeredAt: 'desc' }, include: { certifier: { select: { userSubject: true } }, case: { include: { property: { select: { city: true } } } } } });
 if (!a) return;
 await send(mailer, [await emailOf(db, a.certifier.userSubject)], `Nuova richiesta APE a ${a.case.property.city}`,
  `Hai una nuova proposta di incarico a ${a.case.property.city}. Accettala o rifiutala entro ${a.expiresAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}.`);
}
