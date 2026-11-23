import { Controller, Get, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CasesController } from './cases.controller';
import { AuthService } from './auth.service';
import { MeController } from './me.controller';

@Controller()
class HealthController { @Get('health') health() { return { status: 'ok', service: 'ape-italia-api', mode: 'development' }; } }

@Module({ controllers: [HealthController, MeController, CasesController], providers: [PrismaService, AuthService] })
export class AppModule {}
