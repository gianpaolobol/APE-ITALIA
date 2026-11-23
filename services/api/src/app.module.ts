import { Controller, Get, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CasesController } from './cases.controller';
import { AuthService } from './auth.service';
import { MeController } from './me.controller';
import { MembersController } from './members.controller';
import { EVIDENCE_STORAGE, EvidenceController, MALWARE_SCANNER } from './evidence/evidence.controller';
import { storageFromEnv } from './evidence/storage';
import { CertifierController } from './certifiers/certifier.controller';
import { notConfiguredScanner } from './evidence/file-policy';

@Controller()
class HealthController { @Get('health') health() { return { status: 'ok', service: 'ape-italia-api', mode: 'development' }; } }

@Module({ controllers: [HealthController, MeController, MembersController, CasesController, EvidenceController, CertifierController],
 providers: [
  PrismaService,
  AuthService,
  { provide: EVIDENCE_STORAGE, useFactory: () => storageFromEnv() },
  { provide: MALWARE_SCANNER, useValue: notConfiguredScanner },
 ] })
export class AppModule {}
