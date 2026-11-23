import { PrismaClient } from '@prisma/client';
import { createOrganizationWithOwner, parseArgs, registerVerifiedCertifier } from './provisioning';
import { expireStaleOffers } from '../certifiers/assignment.service';
import { extractionMetrics } from '../extraction/metrics';
import { exportSubjectData, purgeExpiredEvidence, retentionPolicyFromEnv } from '../privacy/privacy';
import { storageFromEnv } from '../evidence/storage';

/** Operator CLI. Run from a trusted shell: `node dist/admin/provision-cli.js <command> ...` */
async function main() {
 const [command, ...rest] = process.argv.slice(2);
 const usage = [
  'provision-cli create-organization --name <name> --owner-subject <oidc-sub> --operator <operator-id>',
  'provision-cli register-certifier --subject <oidc-sub> --name <display name> --registration-id <regional id> --regions "Emilia-Romagna[,...]" --operator <operator-id> [--max-active <n>]',
  'provision-cli approve-application --id <application id> [--subject <oidc-sub>] --operator <operator-id>   (after checking the SACE number on the public list)',
 'provision-cli expire-offers',
  'provision-cli extraction-metrics',
  'provision-cli export-subject-data --subject <oidc-sub>',
  'provision-cli purge-expired-evidence [--apply yes]   (dry run unless --apply yes)',
 ].join('\n');
 if (!['create-organization', 'register-certifier', 'approve-application', 'expire-offers', 'extraction-metrics', 'export-subject-data', 'purge-expired-evidence'].includes(command)) {
  console.error('Usage:\n' + usage);
  process.exit(2);
 }
 const args = parseArgs(rest);
 const db = new PrismaClient();
 try {
  if (command === 'create-organization') {
   console.log(JSON.stringify(await createOrganizationWithOwner(db, { name: args.name ?? '', ownerSubject: args['owner-subject'] ?? '', operator: args.operator ?? '' })));
  } else if (command === 'register-certifier') {
   const c = await registerVerifiedCertifier(db, {
    subject: args.subject ?? '', displayName: args.name ?? '', registrationId: args['registration-id'] ?? '',
    regions: (args.regions ?? '').split(','), operator: args.operator ?? '',
    ...(args['max-active'] ? { maxActiveAssignments: Number(args['max-active']) } : {}),
   });
   console.log(JSON.stringify({ certifierId: c.id }));
  } else if (command === 'approve-application') {
   const app = await db.certifierApplication.findUniqueOrThrow({ where: { id: args.id ?? '' } });
   if (app.status !== 'PENDING') throw new Error('Application is not pending');
   // Without --subject the certifier logs in with the email of the application (email-code login).
   const user = args.subject ? null : (await db.platformUser.findUnique({ where: { email: app.email } })) ?? (await db.platformUser.create({ data: { email: app.email, pushTokens: [] } }));
   const c = await registerVerifiedCertifier(db, { subject: args.subject ?? `usr_${user!.id}`, displayName: `${app.firstName} ${app.lastName}`, registrationId: app.saceNumber, regions: [app.region], operator: args.operator ?? '' });
   await db.certifier.update({ where: { id: c.id }, data: { provinces: app.provinces } });
   await db.certifierApplication.update({ where: { id: app.id }, data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: args.operator ?? '' } });
   console.log(JSON.stringify({ certifierId: c.id }));
  } else if (command === 'export-subject-data') {
   console.log(JSON.stringify(await exportSubjectData(db, args.subject ?? ''), null, 1));
  } else if (command === 'purge-expired-evidence') {
   console.log(JSON.stringify(await purgeExpiredEvidence(db, storageFromEnv(), retentionPolicyFromEnv(), { apply: args.apply === 'yes' }), null, 1));
  } else if (command === 'extraction-metrics') {
   console.log(JSON.stringify(await extractionMetrics(db), null, 1));
  } else {
   console.log(JSON.stringify({ expired: await db.$transaction(tx => expireStaleOffers(tx)) }));
  }
 } finally {
  await db.$disconnect();
 }
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Provisioning failed'); process.exit(1); });
