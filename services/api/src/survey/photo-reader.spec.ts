import { describe, expect, it } from 'vitest';
import { AnthropicPhotoReader, photoReaderFromEnv, sanitizeReaderFields } from './photo-reader';
import { validateApplication, validVat } from '../applications/validation';

describe('photo reader', () => {
 it('is disabled by default', () => {
  expect(photoReaderFromEnv({})).toBeNull();
  expect(photoReaderFromEnv({ SURVEY_PHOTO_READER: 'anthropic' })).toBeNull();
  expect(photoReaderFromEnv({ SURVEY_PHOTO_READER: 'anthropic', ANTHROPIC_API_KEY: 'k' })).not.toBeNull();
 });
 it('sanitizes untrusted provider output', () => {
  expect(sanitizeReaderFields({ type: 'boiler', brand: ' Vaillant ', nominalPowerKw: 24.04, year: 2015.2, condensing: true, fuel: 'metano', evil: 'x' }))
   .toEqual({ type: 'boiler', brand: 'Vaillant', nominalPowerKw: 24, year: 2015, condensing: true, fuel: 'metano' });
  expect(sanitizeReaderFields({ nominalPowerKw: 99999, year: 1800, type: 'rocket', fuel: 'nuclear' })).toEqual({});
  expect(sanitizeReaderFields('nope')).toEqual({});
 });
 it('parses the model JSON answer and sends the image', async () => {
  let sent: any;
  const fake = (async (_url: string, init: any) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ecco {"type":"boiler","brand":"Baxi","nominalPowerKw":24,"summary":"Caldaia Baxi 24 kW"}' }] }), { status: 200 }); }) as unknown as typeof fetch;
  const r = await new AnthropicPhotoReader('k', 'm', fake).read('boiler_nameplate', 'image/jpeg', Buffer.from([1, 2, 3]));
  expect(r.fields).toEqual({ type: 'boiler', brand: 'Baxi', nominalPowerKw: 24 });
  expect(r.summary).toBe('Caldaia Baxi 24 kW');
  expect(sent.messages[0].content[0].source.data).toBe('AQID');
 });
});

describe('certifier application validation', () => {
 const ok = { firstName: 'Anna', lastName: 'Bianchi', email: 'Anna@Studio.it', phone: '333 1234567', vatNumber: '01114601006', taxCode: 'bnchnn80a41a944x',
  profession: 'architetto', professionalOrder: 'Bologna', orderNumber: '1234', region: 'Emilia-Romagna', saceNumber: '5990', provinces: ['BO', 'MO'], declaresAccreditation: true, acceptsTerms: true };
 it('accepts and normalizes', () => {
  const r = validateApplication(ok);
  expect(r.ok).toBe(true);
  if (r.ok) { expect(r.value.saceNumber).toBe('05990'); expect(r.value.email).toBe('anna@studio.it'); expect(r.value.taxCode).toBe('BNCHNN80A41A944X'); }
 });
 it('requires a valid SACE number, region and declarations', () => {
  for (const patch of [{ saceNumber: '' }, { saceNumber: '123456' }, { region: 'Lombardia' }, { declaresAccreditation: false }, { provinces: ['MI'] }, { vatNumber: '01114601007' }]) {
   expect(validateApplication({ ...ok, ...patch }).ok).toBe(false);
  }
 });
 it('VAT check digit', () => { expect(validVat('01114601006')).toBe(true); });
});
