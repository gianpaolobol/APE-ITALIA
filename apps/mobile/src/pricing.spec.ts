import { describe, expect, it } from 'vitest';
import { quote } from './pricing';
describe('regional price list', () => {
 it('tiers by type and size', () => {
  expect(quote({ propertyType: 'appartamento', floorArea: 55 })!.total).toBe(179);
  expect(quote({ propertyType: 'appartamento', floorArea: 90 })!.total).toBe(219);
  expect(quote({ propertyType: 'appartamento', floorArea: 140 })!.total).toBe(269);
  expect(quote({ propertyType: 'schiera', floorArea: 140 })!.total).toBe(299);
  expect(quote({ propertyType: 'casa', floorArea: 200, urgency: 'urgente' })!.total).toBe(398);
 });
 it('certifier keeps the regional fee and 85% of the taxable amount', () => {
  const q = quote({ propertyType: 'appartamento', floorArea: 90 })!;
  expect(q.certifierPayout).toBe(Math.round(((219 - 15) / 1.22) * 0.85 + 15));
 });
});
