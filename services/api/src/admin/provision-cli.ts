import { PrismaClient } from '@prisma/client';
import { createOrganizationWithOwner, parseArgs } from './provisioning';

/** Usage: npm run admin:create-org -w @ape/api -- --name "Studio" --owner-subject "<sub>" --operator "<operator-id>" */
async function main() {
 const [command, ...rest] = process.argv.slice(2);
 if (command !== 'create-organization') {
  console.error('Usage: provision-cli create-organization --name <name> --owner-subject <oidc-sub> --operator <operator-id>');
  process.exit(2);
 }
 const args = parseArgs(rest);
 const db = new PrismaClient();
 try {
  const res = await createOrganizationWithOwner(db, { name: args.name ?? '', ownerSubject: args['owner-subject'] ?? '', operator: args.operator ?? '' });
  console.log(JSON.stringify(res));
 } finally {
  await db.$disconnect();
 }
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Provisioning failed'); process.exit(1); });
