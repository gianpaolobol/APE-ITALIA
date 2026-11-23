import { describe, expect, it } from 'vitest';
import { videoBudgetSeconds } from './video';
describe('walkthrough video budget', () => {
 it('grows with size and type, capped at 6 minutes', () => {
  expect(videoBudgetSeconds({ propertyType: 'appartamento', floorArea: 45 })).toBe(90);
  expect(videoBudgetSeconds({ propertyType: 'appartamento', floorArea: 90 })).toBe(120);
  expect(videoBudgetSeconds({ propertyType: 'appartamento', floorArea: 140 })).toBe(180);
  expect(videoBudgetSeconds({ propertyType: 'casa', floorArea: 200 })).toBe(300);
  expect(videoBudgetSeconds({ propertyType: 'casa', floorArea: 600 })).toBe(360);
 });
});
