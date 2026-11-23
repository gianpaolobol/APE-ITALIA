import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PrismaService } from './prisma.service';
import { hasTenantAccess } from './tenant-policy';
@Injectable()
export class AuthService {
 constructor(private readonly db: PrismaService) {}
 async authorize(authorization?: string, organizationId?: string) {
  const issuer=process.env.OIDC_ISSUER;
  const audience=process.env.OIDC_AUDIENCE;
  const jwksUrl=process.env.OIDC_JWKS_URL;
  if(!issuer || !audience || !jwksUrl) throw new UnauthorizedException('Authentication provider not configured');
  if(!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Bearer token required');
  if(!organizationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) throw new ForbiddenException('Valid organization required');
  try {
   const jwks=createRemoteJWKSet(new URL(jwksUrl));
   const {payload}=await jwtVerify(authorization.slice(7),jwks,{issuer,audience,algorithms:['RS256']});
   if(!payload.sub) throw new UnauthorizedException('Missing subject');
   const membership=await this.db.membership.findUnique({where:{organizationId_userSubject:{organizationId,userSubject:payload.sub}}});
   if(!hasTenantAccess(membership,organizationId,payload.sub)) throw new ForbiddenException('Organization access denied');
   return {organizationId,actorId:payload.sub,role:membership.role};
  } catch(e) {
   if(e instanceof ForbiddenException || e instanceof UnauthorizedException) throw e;
   throw new UnauthorizedException('Invalid access token');
  }
 }
}
