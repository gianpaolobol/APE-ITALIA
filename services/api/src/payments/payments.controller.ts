import { BadRequestException, Body, ConflictException, Controller, Get, Header, Headers, HttpCode, Inject, NotFoundException, Optional, Param, ParseUUIDPipe, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthService } from '../auth.service';
import { priceFor } from './pricing';
import { STRIPE_CONFIG, createCheckoutSession, stripeFromEnv, verifyWebhook, type StripeConfig } from './stripe';

const PAYABLE = ['INSPECTION_DONE', 'DEPOSITED', 'DELIVERED'];

/** Pay after the on-site inspection: Stripe Checkout page opened from the app, confirmed by webhook. */
@Controller('v1')
export class PaymentsController {
 private readonly cfg: StripeConfig | null;
 constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(AuthService) private readonly auth: AuthService,
  @Optional() @Inject(STRIPE_CONFIG) cfg?: StripeConfig | null) { this.cfg = cfg === undefined ? stripeFromEnv() : cfg; }

 @Get('cases/:id/payment')
 async status(@Param('id', new ParseUUIDPipe()) id: string, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  const c = await this.db.apeCase.findFirst({ where: { id, organizationId: s.organizationId }, select: { status: true, survey: true } });
  if (!c) throw new NotFoundException('Case not found');
  const paid = await this.db.payment.findFirst({ where: { caseId: id, status: 'PAID' } });
  const price = priceFor(((c.survey as { answers?: Record<string, unknown> } | null)?.answers) ?? {});
  return { enabled: !!this.cfg, payable: PAYABLE.includes(c.status), paid: !!paid, amountCents: paid?.amountCents ?? price?.totalCents ?? null };
 }

 @Post('cases/:id/payment')
 async checkout(@Param('id', new ParseUUIDPipe()) id: string, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  if (!this.cfg) throw new ServiceUnavailableException('Payments not enabled');
  const s = await this.auth.authorize(token, org);
  const c = await this.db.apeCase.findFirst({ where: { id, organizationId: s.organizationId }, select: { status: true, survey: true } });
  if (!c) throw new NotFoundException('Case not found');
  if (!PAYABLE.includes(c.status)) throw new ConflictException('Payment is due after the on-site inspection');
  if (await this.db.payment.findFirst({ where: { caseId: id, status: 'PAID' } })) throw new ConflictException('Already paid');
  const price = priceFor(((c.survey as { answers?: Record<string, unknown> } | null)?.answers) ?? {});
  if (!price) throw new BadRequestException('Price not available for this request');
  const email = s.actorId.startsWith('usr_') ? (await this.db.platformUser.findUnique({ where: { id: s.actorId.slice(4) }, select: { email: true } }))?.email : null;
  const p = await this.db.payment.create({ data: { caseId: id, organizationId: s.organizationId, amountCents: price.totalCents, createdBy: s.actorId } });
  const session = await createCheckoutSession(this.cfg, { caseId: id, paymentId: p.id, email, lines: price.lines });
  await this.db.payment.update({ where: { id: p.id }, data: { stripeSessionId: session.id } });
  await this.db.auditEvent.create({ data: { organizationId: s.organizationId, actorId: s.actorId, action: 'payment.checkout', resourceId: p.id } });
  return { url: session.url, amountCents: price.totalCents };
 }

 /** Stripe webhook (raw body). Only checkout.session.completed with payment_status=paid marks a payment as paid. */
 @Post('payments/webhook')
 @HttpCode(200)
 async webhook(@Body() raw: Buffer, @Headers('stripe-signature') sig?: string) {
  if (!this.cfg) throw new ServiceUnavailableException('Payments not enabled');
  if (!Buffer.isBuffer(raw) || !verifyWebhook(this.cfg.webhookSecret, sig, raw)) throw new BadRequestException('Invalid signature');
  const event = JSON.parse(raw.toString('utf8')) as { type?: string; data?: { object?: { id?: string; payment_status?: string; client_reference_id?: string } } };
  const o = event.data?.object;
  if (event.type === 'checkout.session.completed' && o?.payment_status === 'paid' && o.id) {
   const p = await this.db.payment.findUnique({ where: { stripeSessionId: o.id } });
   if (p && p.status !== 'PAID' && o.client_reference_id === p.id) {
    await this.db.payment.update({ where: { id: p.id }, data: { status: 'PAID', paidAt: new Date() } });
    await this.db.auditEvent.create({ data: { organizationId: p.organizationId, actorId: 'stripe', action: 'payment.paid', resourceId: p.id } });
   }
  }
  return { received: true };
 }

 /** Landing page after Checkout: the app polls the payment status when it comes back to the foreground. */
 @Get('payments/return')
 @Header('Content-Type', 'text/html; charset=utf-8')
 @Header('Cache-Control', 'no-store')
 paymentReturn(@Query('status') status?: string) {
  const ok = status === 'ok';
  return `<!doctype html><html lang="it"><meta name="viewport" content="width=device-width,initial-scale=1"><title>APE Italia</title><body style="font-family:-apple-system,system-ui;padding:40px;text-align:center;color:#0E1A16"><h1 style="color:#0D5B4A">${ok ? 'Pagamento completato' : 'Pagamento annullato'}</h1><p>${ok ? 'Grazie! Torna all’app APE Italia: l’attestato è disponibile appena confermato.' : 'Nessun addebito. Torna all’app per riprovare.'}</p></body></html>`;
 }
}
