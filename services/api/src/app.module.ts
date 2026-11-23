import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './prisma.service';
import { CasesController } from './cases.controller';
import { AuthService } from './auth.service';
import { MeController } from './me.controller';
import { MembersController } from './members.controller';
import { EVIDENCE_STORAGE, EvidenceController, MALWARE_SCANNER } from './evidence/evidence.controller';
import { storageFromEnv } from './evidence/storage';
import { CertifierController } from './certifiers/certifier.controller';
import { ExtractionController } from './extraction/extraction.controller';
import { CertificateController } from './certificates/certificate.controller';
import { LifecycleController } from './lifecycle/lifecycle.controller';
import { EXTRACTION_PROVIDER } from './extraction/provider';
import { notConfiguredScanner } from './evidence/file-policy';

@Controller()
class HealthController { @Get('health') health() { return { status: 'ok', service: 'ape-italia-api', mode: 'development' }; } }

/** Default: 120 requests/minute per client IP (in-memory, per instance; use a shared store when scaling out). */
@Module({ imports: [ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120) }] })],
 controllers: [HealthController, MeController, MembersController, CasesController, EvidenceController, CertifierController, ExtractionController, CertificateController, LifecycleController],
 providers: [
  PrismaService,
  AuthService,
  { provide: EVIDENCE_STORAGE, useFactory: () => storageFromEnv() },
  { provide: MALWARE_SCANNER, useValue: notConfiguredScanner },
  // No AI provider until a DPA and explicit authorization exist: extraction endpoints answer 503.
  { provide: EXTRACTION_PROVIDER, useValue: null },
  { provide: APP_GUARD, useClass: ThrottlerGuard },
 ] })
export class AppModule {}
