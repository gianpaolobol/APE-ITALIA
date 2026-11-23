import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MembersController, hashInvitationCode } from './members.controller';
import type { AuthService } from './auth.service';
import type { PrismaService } from './prisma.service';

const ORG = '123e4567-e89b-42d3-a456-426614174000';
const MID = '223e4567-e89b-42d3-a456-426614174000';
function setup(role: string) {
 const tx = {
  $queryRaw: vi.fn(),
  membership: { findFirst: vi.fn(), update: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  invitation: { create: vi.fn().mockResolvedValue({ id: 'inv-1', role: 'member', expiresAt: new Date() }), updateMany: vi.fn(), findUnique: vi.fn() },
  auditEvent: { create: vi.fn() },
 };
 const db = { membership: { findMany: vi.fn().mockResolvedValue([]) }, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } as unknown as PrismaService;
 const auth = {
  authorize: vi.fn().mockResolvedValue({ organizationId: ORG, actorId: 'actor', role }),
  verify: vi.fn().mockResolvedValue({ subject: 'invitee' }),
 } as unknown as AuthService;
 return { c: new MembersController(db, auth), db, tx };
}

describe('member management authorization', () => {
 for (const role of ['member', 'viewer']) {
  it(`${role} cannot list, invite or modify members`, async () => {
   const { c, tx } = setup(role);
   await expect(c.list('Bearer t', ORG)).rejects.toBeInstanceOf(ForbiddenException);
   await expect(c.createInvitation({ role: 'viewer' }, 'Bearer t', ORG)).rejects.toBeInstanceOf(ForbiddenException);
   await expect(c.update(MID, { active: false }, 'Bearer t', ORG)).rejects.toBeInstanceOf(ForbiddenException);
   expect(tx.membership.update).not.toHaveBeenCalled();
   expect(tx.invitation.create).not.toHaveBeenCalled();
  });
 }
 it('admin cannot invite an admin or owner', async () => {
  const { c, tx } = setup('admin');
  await expect(c.createInvitation({ role: 'admin' }, 'Bearer t', ORG)).rejects.toBeInstanceOf(ForbiddenException);
  await expect(c.createInvitation({ role: 'owner' }, 'Bearer t', ORG)).rejects.toBeInstanceOf(ForbiddenException);
  expect(tx.invitation.create).not.toHaveBeenCalled();
 });
 it('admin cannot demote an owner', async () => {
  const { c, tx } = setup('admin');
  tx.membership.findFirst.mockResolvedValue({ id: MID, organizationId: ORG, role: 'owner', active: true });
  await expect(c.update(MID, { role: 'viewer' }, 'Bearer t', ORG)).rejects.toBeInstanceOf(ForbiddenException);
  expect(tx.membership.update).not.toHaveBeenCalled();
 });
 it('looks up the target only inside the caller tenant', async () => {
  const { c, tx } = setup('owner');
  tx.membership.findFirst.mockResolvedValue(null);
  await expect(c.update(MID, { active: false }, 'Bearer t', ORG)).rejects.toThrow('Membership not found');
  expect(tx.membership.findFirst).toHaveBeenCalledWith({ where: { id: MID, organizationId: ORG } });
 });
 it('refuses to remove the last active owner', async () => {
  const { c, tx } = setup('owner');
  tx.membership.findFirst.mockResolvedValue({ id: MID, organizationId: ORG, role: 'owner', active: true });
  tx.$queryRaw.mockResolvedValue([{ id: MID }]);
  await expect(c.update(MID, { active: false }, 'Bearer t', ORG)).rejects.toThrow('at least one active owner');
  expect(tx.membership.update).not.toHaveBeenCalled();
 });
 it('rejects unknown roles and extra fields', async () => {
  const { c } = setup('owner');
  await expect(c.createInvitation({ role: 'superuser' }, 'Bearer t', ORG)).rejects.toBeInstanceOf(BadRequestException);
  await expect(c.update(MID, { active: false, organizationId: 'x' }, 'Bearer t', ORG)).rejects.toBeInstanceOf(BadRequestException);
 });
});

describe('invitations', () => {
 it('returns a 256-bit code once and stores only its SHA-256 hash', async () => {
  const { c, tx } = setup('owner');
  const res = await c.createInvitation({ role: 'member', ttlHours: 24 }, 'Bearer t', ORG);
  expect(res.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const data = tx.invitation.create.mock.calls[0][0].data;
  expect(data.codeHash).toBe(hashInvitationCode(res.code));
  expect(JSON.stringify(data)).not.toContain(res.code);
  expect(data.organizationId).toBe(ORG);
  expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'invitation.create', actorId: 'actor' }) });
 });
 it('rejects excessive lifetimes', async () => {
  const { c } = setup('owner');
  await expect(c.createInvitation({ role: 'member', ttlHours: 24 * 30 }, 'Bearer t', ORG)).rejects.toBeInstanceOf(BadRequestException);
 });
 it('uses a uniform error for unknown, expired, revoked or used codes', async () => {
  const code = 'A'.repeat(43);
  const cases = [null, { acceptedAt: new Date() }, { revokedAt: new Date() }, { expiresAt: new Date(Date.now() - 1000) }];
  for (const inv of cases) {
   const { c, tx } = setup('viewer');
   tx.invitation.findUnique.mockResolvedValue(inv && { id: 'i', organizationId: ORG, role: 'member', acceptedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 1000), ...inv });
   await expect(c.accept({ code }, 'Bearer t')).rejects.toThrow('Invitation not valid');
   expect(tx.membership.create).not.toHaveBeenCalled();
  }
 });
 it('rejects malformed codes before any database access', async () => {
  const { c, tx } = setup('viewer');
  await expect(c.accept({ code: 'short' }, 'Bearer t')).rejects.toBeInstanceOf(BadRequestException);
  expect(tx.invitation.findUnique).not.toHaveBeenCalled();
 });
});
