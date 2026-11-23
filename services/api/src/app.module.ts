import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { PgThrottlerStorage } from './rate-limit/pg-throttler-storage';
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
import { SurveyController } from './survey/survey.controller';
import { PHOTO_READER, photoReaderFromEnv } from './survey/photo-reader';
import { VIDEO_ANALYZER, videoAnalyzerFromEnv } from './survey/video-analysis';
import { ApplicationsController } from './applications/applications.controller';
import { PlatformAuthController } from './platform-auth/auth.controller';
import { PaymentsController } from './payments/payments.controller';
import { LegalController } from './legal/legal.controller';
import { STRIPE_CONFIG, stripeFromEnv } from './payments/stripe';
import { MAILER, mailerFromEnv } from './platform-auth/mailer';
import { platformAuthFromEnv } from './platform-auth/tokens';
import { PLATFORM_AUTH } from './auth.service';
import { notConfiguredScanner } from './evidence/file-policy';
import { scannerFromEnv } from './evidence/clamav';

@Controller()
class HealthController { @Get('health') health() { return { status: 'ok', service: 'ape-italia-api', mode: 'development' }; } }

/** Default: 120 requests/minute per client IP (in-memory, per instance; use a shared store when scaling out). */
/** RATE_LIMIT_STORE=postgres shares counters across API instances (own small connection pool). */
const sharedStorage = process.env.RATE_LIMIT_STORE === 'postgres' ? new PgThrottlerStorage(new PrismaClient()) : undefined;

@Module({ imports: [ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120) }], ...(sharedStorage ? { storage: sharedStorage } : {}) })],
 controllers: [HealthController, MeController, MembersController, CasesController, EvidenceController, CertifierController, ExtractionController, CertificateController, LifecycleController, SurveyController, ApplicationsController, PlatformAuthController, PaymentsController, LegalController],
 providers: [
  PrismaService,
  AuthService,
  { provide: EVIDENCE_STORAGE, useFactory: () => storageFromEnv() },
  { provide: MALWARE_SCANNER, useFactory: () => scannerFromEnv() ?? notConfiguredScanner },
  // No AI provider until a DPA and explicit authorization exist: extraction endpoints answer 503.
  { provide: EXTRACTION_PROVIDER, useValue: null },
  // Survey photo reader: off unless SURVEY_PHOTO_READER=anthropic and ANTHROPIC_API_KEY are set.
  { provide: PHOTO_READER, useFactory: () => photoReaderFromEnv() },
  { provide: VIDEO_ANALYZER, useFactory: () => videoAnalyzerFromEnv() },
  // Email-code login: requires PLATFORM_JWT_SECRET (>= 32 chars) and a mailer (MAILER=brevo|log).
  { provide: PLATFORM_AUTH, useFactory: () => platformAuthFromEnv() },
  { provide: MAILER, useFactory: () => mailerFromEnv() },
  // Payments: STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET + PUBLIC_API_URL.
  { provide: STRIPE_CONFIG, useFactory: () => stripeFromEnv() },
  { provide: APP_GUARD, useClass: ThrottlerGuard },
 ] })
export class AppModule {}
