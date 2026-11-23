import { randomInt } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ApplicationsController } from './applications.controller';
import type { PrismaService } from '../prisma.service';

const enabled = process.env.RUN_DB_INTEGRATION === '1';

describe.skipIf(!enabled)('PostgreSQL: certifier applications', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const ctrl = new ApplicationsController(db as unknown as PrismaService);
 const sace = String(randomInt(1, 99999));
 const email = `cert-${sace}-${Date.now()}@example.test`;
 const body = { firstName: 'Anna', lastName: 'Bianchi', email, phone: '3331234567', vatNumber: '01114601006', taxCode: 'BNCHNN80A41A944X',
  profession: 'architetto', professionalOrder: 'Bologna', orderNumber: '1234', region: 'Emilia-Romagna', saceNumber: sace, provinces: ['BO'], declaresAccreditation: true, acceptsTerms: true };
 afterAll(async () => { await db.certifierApplication.deleteMany({ where: { email: { endsWith: '@example.test' } } }); await db.$disconnect(); });

 it('stores a pending application with the zero-padded SACE number', async () => {
  const r = await ctrl.apply(body);
  expect(r.status).toBe('PENDING');
  const row = await db.certifierApplication.findUniqueOrThrow({ where: { id: r.id } });
  expect(row.saceNumber).toBe(sace.padStart(5, '0'));
 });
 it('rejects duplicates and invalid input', async () => {
  await expect(ctrl.apply({ ...body, email: `other-${email}` })).rejects.toBeInstanceOf(ConflictException);
  await expect(ctrl.apply({ ...body, saceNumber: '' })).rejects.toBeInstanceOf(BadRequestException);
 });
});
