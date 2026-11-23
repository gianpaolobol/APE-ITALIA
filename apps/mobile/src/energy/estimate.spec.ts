import { describe, expect, it } from 'vitest';
import { CLASSES, classFor, estimate } from './estimate';
import type { Answers } from '../survey/questions';

const idx = (c: string) => CLASSES.indexOf(c as never);

const sixties: Answers = {
 province: 'BO', floorArea: 80, builtPeriod: '1946_1975', propertyType: 'appartamento', floorPosition: 'intermedio',
 wallType: 'cassa_vuota', wallThickness: 30, windowCount: 6, glazing: 'doppio', frame: 'legno',
 heatingSystem: 'autonomo', heatGenerator: 'caldaia_tradizionale', fuel: 'metano', generatorYear: 2001, emitters: 'radiatori', controls: ['cronotermostato'],
 dhw: 'stesso_generatore', cooling: 'nessuno',
};

describe('energy estimate', () => {
 it('class thresholds follow DM 26/06/2015', () => {
  expect(classFor(0.39)).toBe('A4'); expect(classFor(1.0)).toBe('A1'); expect(classFor(1.21)).toBe('C');
  expect(classFor(2.6)).toBe('E'); expect(classFor(3.49)).toBe('F'); expect(classFor(9)).toBe('G');
 });

 it('needs province, area, period and type', () => {
  expect(estimate({ province: 'BO', floorArea: 80 })).toBeNull();
 });

 it('a 1960s flat with an old boiler lands in the low classes', () => {
  const e = estimate(sixties)!;
  expect(idx(e.energyClass)).toBeGreaterThanOrEqual(idx('E'));
  expect(e.epglNren).toBeGreaterThan(100);
  expect(e.confidence).toBe('buona');
 });

 it('a recent insulated house with heat pump and PV is far better', () => {
  const e = estimate({
   ...sixties, propertyType: 'casa', builtPeriod: 'post2015', wallType: 'laterizio_forato', wallThickness: 40, wallInsulated: true, wallInsulationCm: 12,
   glazing: 'basso_emissivo', frame: 'pvc', roofInsulated: 'si', groundFloorType: 'terreno', heatGenerator: 'pompa_calore', generatorYear: 2020,
   emitters: 'pavimento', controls: ['cronotermostato', 'valvole'], pv: true, pvKw: 6,
  })!;
  expect(idx(e.energyClass)).toBeLessThanOrEqual(idx('A2'));
 });

 it('improvements never make the class worse', () => {
  const base = estimate(sixties)!;
  const better = estimate({ ...sixties, wallInsulated: true, wallInsulationCm: 12, glazing: 'basso_emissivo', heatGenerator: 'caldaia_condensazione', generatorYear: 2022, controls: ['valvole'] })!;
  expect(better.epglNren).toBeLessThan(base.epglNren);
  expect(idx(better.energyClass)).toBeLessThanOrEqual(idx(base.energyClass));
 });

 it('unknown answers widen the range and lower confidence', () => {
  const e = estimate({ ...sixties, wallType: 'non_so', glazing: 'non_so', heatGenerator: 'caldaia_non_so' })!;
  expect(e.confidence).toBe('bassa');
  expect(idx(e.classRange[1]) - idx(e.classRange[0])).toBeGreaterThanOrEqual(1);
 });

 it('loss shares add up to 1', () => {
  const e = estimate(sixties)!;
  expect(e.losses.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 5);
 });
});
