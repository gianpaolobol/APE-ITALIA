import { describe, expect, it } from 'vitest';
import { quote } from './pricing';
import { priceFor } from '../../../services/api/src/payments/pricing';

describe('client and server prices match', () => {
 const cases = [
  { propertyType: 'appartamento', floorArea: 45 }, { propertyType: 'appartamento', floorArea: 100, urgency: 'urgente' }, { propertyType: 'appartamento', floorArea: 160, hasPlan: 'no' },
  { propertyType: 'ufficio', floorArea: 70 }, { propertyType: 'schiera', floorArea: 130 }, { propertyType: 'casa', floorArea: 420, urgency: 'urgente', hasPlan: 'no' },
 ];
 for (const a of cases) it(JSON.stringify(a), () => { expect(Math.round(quote(a)!.total * 100)).toBe(priceFor(a)!.totalCents); });
});
