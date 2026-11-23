import {
 BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Inject,
 NotFoundException, Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from './prisma.service';
import { AuthService } from './auth.service';
import { ROLES, canGrantRole, canManageMembers, canModifyMember } from './tenant-policy';

class UpdateMemberDto {
 @IsOptional() @IsIn(ROLES as unknown as string[]) role?: string;
 @IsOptional() @IsBoolean() active?: boolean;
}
class CreateInvitationDto {
 @IsIn(ROLES as unknown as string[]) role!: string;
 @IsOptional() @IsInt() @Min(1) @Max(168) ttlHours?: number;
}
class AcceptInvitationDto {
 @IsString() @Length(43, 43) @Matches(/^[A-Za-z0-9_-]+$/) code!: string;
}
function validated<T extends object>(cls: new () => T, body: unknown): T {
 const dto = plainToInstance(cls, body);
 const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
 if (errors.length) throw new BadRequestException('Invalid request body');
 return dto;
}
export function hashInvitationCode(code: string): string {
 return createHash('sha256').update(code, 'utf8').digest('hex');
}

/** Tenant-scoped membership administration and invitation-based onboarding. No public organization creation. */
@Controller('v1')
export class MembersController {
 constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(AuthService) private readonly auth: AuthService) {}

 private async manager(token?: string, org?: string) {
  const s = await this.auth.authorize(token, org);
  if (!canManageMembers(s.role)) throw new ForbiddenException('Member management requires owner or admin');
  return s;
 }

 @Get('members')
 async list(@Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.manager(token, org);
  return this.db.membership.findMany({
   where: { organizationId: s.organizationId },
   select: { id: true, userSubject: true, role: true, active: true, createdAt: true },
   orderBy: { createdAt: 'asc' },
  });
 }

 @Patch('members/:id')
 async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.manager(token, org);
  const dto = validated(UpdateMemberDto, body);
  if (dto.role === undefined && dto.active === undefined) throw new BadRequestException('Nothing to update');
  return this.db.$transaction(async tx => {
   const target = await tx.membership.findFirst({ where: { id, organizationId: s.organizationId } });
   if (!target) throw new NotFoundException('Membership not found');
   if (!canModifyMember(s.role, target.role)) throw new ForbiddenException('Cannot modify this member');
   if (dto.role !== undefined && !canGrantRole(s.role, dto.role)) throw new ForbiddenException('Cannot grant this role');
   const nextRole = dto.role ?? target.role;
   const nextActive = dto.active ?? target.active;
   if (target.role === 'owner' && target.active && (nextRole !== 'owner' || !nextActive)) {
    // Row locks serialize concurrent owner demotions without relying on SERIALIZABLE isolation.
    const owners = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Membership" WHERE "organizationId" = ${s.organizationId} AND "role" = 'owner' AND "active" = true FOR UPDATE`;
    if (owners.length <= 1) throw new ConflictException('An organization must keep at least one active owner');
   }
   const updated = await tx.membership.update({
    where: { id: target.id },
    data: { role: nextRole, active: nextActive },
    select: { id: true, userSubject: true, role: true, active: true, createdAt: true },
   });
   await tx.auditEvent.create({ data: { organizationId: s.organizationId, actorId: s.actorId, action: nextActive ? 'membership.update' : 'membership.revoke', resourceId: target.id } });
   return updated;
  });
 }

 @Post('invitations')
 async createInvitation(@Body() body: unknown, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.manager(token, org);
  const dto = validated(CreateInvitationDto, body);
  if (!canGrantRole(s.role, dto.role)) throw new ForbiddenException('Cannot grant this role');
  const code = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + (dto.ttlHours ?? 72) * 3600_000);
  const inv = await this.db.$transaction(async tx => {
   const created = await tx.invitation.create({ data: { organizationId: s.organizationId, codeHash: hashInvitationCode(code), role: dto.role, createdBy: s.actorId, expiresAt } });
   await tx.auditEvent.create({ data: { organizationId: s.organizationId, actorId: s.actorId, action: 'invitation.create', resourceId: created.id } });
   return created;
  });
  // The plaintext code is returned once and never stored.
  return { id: inv.id, code, role: inv.role, expiresAt: inv.expiresAt };
 }

 @Get('invitations')
 async listInvitations(@Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.manager(token, org);
  return this.db.invitation.findMany({
   where: { organizationId: s.organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
   select: { id: true, role: true, createdBy: true, expiresAt: true, createdAt: true },
   orderBy: { createdAt: 'desc' },
  });
 }

 @Delete('invitations/:id')
 @HttpCode(204)
 async revokeInvitation(@Param('id', new ParseUUIDPipe()) id: string, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.manager(token, org);
  await this.db.$transaction(async tx => {
   const res = await tx.invitation.updateMany({ where: { id, organizationId: s.organizationId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
   if (res.count !== 1) throw new NotFoundException('Invitation not found');
   await tx.auditEvent.create({ data: { organizationId: s.organizationId, actorId: s.actorId, action: 'invitation.revoke', resourceId: id } });
  });
 }

 /** Any authenticated user may redeem a valid code; errors are uniform to avoid an oracle. */
 @Post('invitations/accept')
 @Throttle({ default: { limit: 10, ttl: 60_000 } })
 async accept(@Body() body: unknown, @Headers('authorization') token?: string) {
  const { subject } = await this.auth.verify(token);
  const dto = validated(AcceptInvitationDto, body);
  const now = new Date();
  return this.db.$transaction(async tx => {
   const inv = await tx.invitation.findUnique({ where: { codeHash: hashInvitationCode(dto.code) } });
   if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= now) throw new NotFoundException('Invitation not valid');
   const claimed = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: now, acceptedBy: subject } });
   if (claimed.count !== 1) throw new NotFoundException('Invitation not valid');
   const existing = await tx.membership.findUnique({ where: { organizationId_userSubject: { organizationId: inv.organizationId, userSubject: subject } } });
   if (existing?.active) throw new ConflictException('Already a member of this organization');
   const membership = existing
    ? await tx.membership.update({ where: { id: existing.id }, data: { active: true, role: inv.role } })
    : await tx.membership.create({ data: { organizationId: inv.organizationId, userSubject: subject, role: inv.role } });
   await tx.auditEvent.create({ data: { organizationId: inv.organizationId, actorId: subject, action: 'invitation.accept', resourceId: membership.id } });
   return { organizationId: inv.organizationId, role: membership.role };
  });
 }
}
