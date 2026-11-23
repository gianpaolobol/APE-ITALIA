import { Controller, Get, Headers, Inject } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthService } from './auth.service';

/** Identity of the verified caller and their active memberships (from the database only). */
@Controller('v1')
export class MeController {
 constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(AuthService) private readonly auth: AuthService) {}

 @Get('me')
 async me(@Headers('authorization') authorization?: string) {
  const { subject } = await this.auth.verify(authorization);
  const rows = await this.db.membership.findMany({
   where: { userSubject: subject, active: true },
   include: { organization: { select: { id: true, name: true } } },
   orderBy: { createdAt: 'asc' },
  });
  return {
   subject,
   memberships: rows.map(m => ({ organizationId: m.organization.id, organizationName: m.organization.name, role: m.role })),
  };
 }
}
