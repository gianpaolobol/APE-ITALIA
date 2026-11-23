import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from './prisma.service';
import { CasesController } from './cases.controller';
import { AuthService } from './auth.service';
@Controller()
class HealthController { @Get('health') health() { return { status: 'ok', service: 'ape-italia-api', mode: 'development' }; } }
@Module({ controllers: [HealthController, CasesController], providers: [PrismaService, AuthService] })
class AppModule {}
async function bootstrap() { const app = await NestFactory.create(AppModule); await app.listen(process.env.PORT || 3001); }
bootstrap();
