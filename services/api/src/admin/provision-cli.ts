import { PrismaClient } from '@prisma/client';
import { createOrganizationWithOwner, parseArgs, registerVerifiedCertifier } from './provisioning';
import { expireStaleOffers } from '../certifiers/assignment.service';

/** Operator CLI. Run from a trusted shell: `node dist/admin/provision-cli.js <command> ...` */
async function main() {
 const [command, ...rest] = process.argv.slice(2);
 const usage = [
  'provision-cli create-organization --name <name> --owner-subject <oidc-sub> --operator <operator-id>',
  'provision-cli register-certifier --subject <oidc-sub> --name <display name> --registration-id <regional id> --regions "Emilia-Romagna[,...]" --operator <operator-id> [--max-active <n>]',
  'provision-cli expire-offers',
 ].join('\n');
 if (!['create-organization', 'register-certifier', 'expire-offers'].includes(command)) {
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
  } else {
   console.log(JSON.stringify({ expired: await db.$transaction(tx => expireStaleOffers(tx)) }));
  }
 } finally {
  await db.$disconnect();
 }
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Provisioning failed'); process.exit(1); });
