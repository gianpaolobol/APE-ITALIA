/**
 * Indicative energy-class estimate (pre-APE). It is a simplified steady-state model inspired by
 * UNI/TS 11300 and by the classification method of the national guidelines (DM 26/06/2015, Annex 1):
 * the class follows from EPgl,nren of the building compared with the same building having reference
 * envelope and systems. It is NOT an APE and must never be presented as one: only an accredited
 * certifier, after the mandatory inspection, can issue the certificate.
 */
import type { Answers } from '../survey/questions';

export type EnergyClass = 'A4' | 'A3' | 'A2' | 'A1' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export const CLASSES: EnergyClass[] = ['A4', 'A3', 'A2', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'];

/** Upper bounds of EPgl,nren / EPgl,nren,rif,standard for each class (DM 26/06/2015, Annex 1, Table 2). */
const CLASS_LIMITS: Array<[EnergyClass, number]> = [
 ['A4', 0.4], ['A3', 0.6], ['A2', 0.8], ['A1', 1.0], ['B', 1.2], ['C', 1.5], ['D', 2.0], ['E', 2.6], ['F', 3.5], ['G', Infinity],
];

/**
 * Heating degree days and climate zone of each provincial capital (DPR 412/1993, Table A). The
 * municipality can differ: the certifier uses the exact value of the municipality.
 */
export const CLIMATE: Record<string, { gg: number; zone: 'D' | 'E' | 'F'; city: string }> = {
 BO: { gg: 2259, zone: 'E', city: 'Bologna' }, MO: { gg: 2258, zone: 'E', city: 'Modena' }, RE: { gg: 2560, zone: 'E', city: 'Reggio Emilia' },
 PR: { gg: 2502, zone: 'E', city: 'Parma' }, PC: { gg: 2715, zone: 'E', city: 'Piacenza' }, FE: { gg: 2326, zone: 'E', city: 'Ferrara' },
 RA: { gg: 2227, zone: 'E', city: 'Ravenna' }, FC: { gg: 2087, zone: 'D', city: 'Forlì' }, RN: { gg: 2139, zone: 'D', city: 'Rimini' },
};

/** Primary non-renewable energy factors (DM 26/06/2015, Annex 1, Table 1). */
const FP = { gas: 1.05, gpl: 1.05, gasolio: 1.07, elettricita: 1.95, biomassa: 0.2, teleriscaldamento: 1.5 } as const;

/** Equivalent conductivity [W/mK] of common Italian wall types (orders of magnitude, UNI/TR 11552 style). */
const WALL_LAMBDA: Record<string, number> = { mattoni_pieni: 0.72, laterizio_forato: 0.4, cassa_vuota: 0.45, pietra: 1.7, cemento: 1.6 };
const PERIOD_WALL: Record<string, string> = { pre1945: 'mattoni_pieni', '1946_1975': 'cassa_vuota', '1976_1991': 'cassa_vuota', '1992_2005': 'laterizio_forato', '2006_2015': 'laterizio_forato', post2015: 'laterizio_forato' };
const PERIOD_ROOF_U: Record<string, number> = { pre1945: 1.8, '1946_1975': 1.6, '1976_1991': 1.0, '1992_2005': 0.7, '2006_2015': 0.35, post2015: 0.24 };
const PERIOD_FLOOR_U: Record<string, number> = { pre1945: 1.6, '1946_1975': 1.4, '1976_1991': 1.0, '1992_2005': 0.8, '2006_2015': 0.4, post2015: 0.28 };

/** Reference envelope for zones D/E from 2019/2021 (DM 26/06/2015, Annex 1, Appendix A). */
const REF_U = { D: { wall: 0.29, roof: 0.26, floor: 0.29, window: 1.8 }, E: { wall: 0.26, roof: 0.22, floor: 0.26, window: 1.4 }, F: { wall: 0.24, roof: 0.2, floor: 0.24, window: 1.1 } } as const;
const REF_ETA_UTIL_H = 0.81;
const REF_ETA_GEN_H = 0.95;
const REF_ETA_W = 0.7 * 0.85;
const REF_EER = 2.5;

const HEATING_DAYS = { D: 166, E: 183, F: 200 } as const;
const COOLING_NEED_KWH_M2 = 18; // indicative sensible cooling need for Emilia-Romagna dwellings
const PV_YIELD_KWH_KWP = 1250;
const PV_SELF_CONSUMPTION = 0.3;

export type Estimate = {
 energyClass: EnergyClass;
 /** Range of plausible classes given the uncertainty of the inputs. */
 classRange: [EnergyClass, EnergyClass];
 epglNren: number;
 epglNrenRef: number;
 ratio: number;
 breakdown: { heating: number; hotWater: number; cooling: number; pvCredit: number };
 /** Heat losses by element, as share of the transmission + ventilation losses. */
 losses: Array<{ key: 'muri' | 'finestre' | 'tetto' | 'pavimento' | 'ventilazione'; share: number }>;
 confidence: 'bassa' | 'media' | 'buona';
 assumptions: string[];
 suggestions: Array<{ title: string; detail: string }>;
};

export type EstimateInput = Answers;

function num(a: Answers, k: string): number | undefined {
 const v = a[k];
 return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function str(a: Answers, k: string): string | undefined {
 const v = a[k];
 return typeof v === 'string' ? v : undefined;
}

export function classFor(ratio: number): EnergyClass {
 for (const [c, lim] of CLASS_LIMITS) if (ratio <= lim) return c;
 return 'G';
}

/** Returns null until the minimum data (province, area, period, property type) is known. */
export function estimate(a: Answers): Estimate | null {
 const province = str(a, 'province');
 const area = num(a, 'floorArea');
 const period = str(a, 'builtPeriod');
 const type = str(a, 'propertyType');
 if (!province || !CLIMATE[province] || !area || !period || !type) return null;
 const climate = CLIMATE[province];
 const assumptions: string[] = [];
 let unknowns = 0;

 const h = num(a, 'ceilingHeight') ?? (assumptions.push('Altezza soffitti 2,70 m'), 2.7);
 const volume = area * h;
 const perimeter = 4 * Math.sqrt(area) * 1.1;

 // Share of the perimeter facing outside.
 const pos = str(a, 'floorPosition');
 let exposed = 0.55; // flat: on average two facades
 if (type === 'casa') exposed = 1;
 else if (type === 'schiera') exposed = str(a, 'rowPosition') === 'testata' ? 0.75 : 0.5;
 const grossWall = perimeter * h * exposed;

 const windowCount = num(a, 'windowCount');
 const windowArea = Math.min(grossWall * 0.6, windowCount ? windowCount * 1.9 : area / 8);
 if (!windowCount) assumptions.push('Superficie finestrata pari a 1/8 della superficie');
 const wallArea = Math.max(0, grossWall - windowArea);
 const roofArea = type === 'casa' || type === 'schiera' || pos === 'ultimo' || pos === 'unico' ? area : 0;
 const floorArea = type === 'casa' || type === 'schiera' || pos === 'terra' || pos === 'unico' ? area : 0;

 // Walls
 let wallType = str(a, 'wallType');
 if (!wallType || wallType === 'non_so') { wallType = PERIOD_WALL[period]; unknowns++; assumptions.push('Tipo di muratura stimato dall’epoca di costruzione'); }
 const thicknessCm = num(a, 'wallThickness') ?? (unknowns++, assumptions.push('Spessore muri 30 cm'), 30);
 let rWall = 0.17 + (thicknessCm / 100) / (WALL_LAMBDA[wallType] ?? 0.6);
 if (a.wallInsulated === true) rWall += ((num(a, 'wallInsulationCm') ?? (assumptions.push('Isolamento a cappotto 6 cm'), 6)) / 100) / 0.035;
 else if (period === '2006_2015' || period === 'post2015') rWall += 0.06 / 0.035; // insulation required by law in that period
 const uWall = 1 / rWall;

 // Windows
 const glazing = str(a, 'glazing');
 const frame = str(a, 'frame');
 let uWin = 2.8;
 if (glazing === 'singolo') uWin = frame === 'metallo' ? 5.7 : 4.9;
 else if (glazing === 'doppio') uWin = frame === 'metallo' ? 3.7 : 2.8;
 else if (glazing === 'basso_emissivo') uWin = frame === 'metallo' ? 2.2 : 1.5;
 else { unknowns++; uWin = period === 'pre1945' || period === '1946_1975' ? 3.6 : period === 'post2015' ? 1.5 : 2.8; assumptions.push('Serramenti stimati dall’epoca'); }

 // Roof and floor
 let uRoof = PERIOD_ROOF_U[period];
 const roofIns = str(a, 'roofInsulated');
 if (roofIns === 'si') uRoof = Math.min(uRoof, 0.45); else if (roofIns === 'no') uRoof = Math.max(uRoof, 1.4); else if (roofArea) unknowns++;
 const uFloor = PERIOD_FLOOR_U[period];
 const bFloor = str(a, 'groundFloorType') === 'porticato' ? 1 : 0.5;

 const hWall = uWall * wallArea, hWin = uWin * windowArea, hRoof = uRoof * roofArea * 0.9, hFloor = uFloor * floorArea * bFloor;
 const hVe = 0.34 * 0.5 * volume * 0.8;
 const hTot = hWall + hWin + hRoof + hFloor + hVe;
 const ref = REF_U[climate.zone];
 const hRef = ref.wall * wallArea + ref.window * windowArea + ref.roof * roofArea * 0.9 + ref.floor * floorArea * bFloor + hVe;

 const days = HEATING_DAYS[climate.zone];
 const gains = (2.5 * area * 24 * days) / 1000 + windowArea * 0.5 * 0.6 * 220;
 const need = (hh: number) => Math.max(0, 0.024 * climate.gg * hh - 0.9 * gains);
 const qH = need(hTot), qHRef = need(hRef);

 // Heating system
 const sys = str(a, 'heatingSystem');
 const g = str(a, 'heatGenerator');
 const year = num(a, 'generatorYear');
 let etaGen = 0.9, fp: number = FP.gas;
 const fuel = str(a, 'fuel');
 const fuelFp = fuel === 'gasolio' ? FP.gasolio : fuel === 'gpl' ? FP.gpl : FP.gas;
 let electricH = 0;
 if (sys === 'nessuno' || !g) { etaGen = 1; fp = FP.elettricita; assumptions.push('Senza impianto si considera un riscaldamento elettrico virtuale, come prevede la norma'); }
 else if (g === 'caldaia_condensazione') { etaGen = year && year < 2010 ? 0.95 : 0.98; fp = fuelFp; }
 else if (g === 'caldaia_tradizionale') { etaGen = year && year < 1996 ? 0.78 : 0.86; fp = fuelFp; }
 else if (g === 'caldaia_non_so') { etaGen = year && year >= 2016 ? 0.98 : year && year < 1996 ? 0.8 : 0.88; fp = fuelFp; unknowns++; assumptions.push('Tipo di caldaia da confermare con la targhetta'); }
 else if (g === 'pompa_calore') { etaGen = year && year < 2012 ? 2.6 : 3.2; fp = FP.elettricita; }
 else if (g === 'biomassa') { etaGen = 0.8; fp = FP.biomassa; }
 else if (g === 'teleriscaldamento') { etaGen = 0.95; fp = FP.teleriscaldamento; assumptions.push('Fattore della rete di teleriscaldamento generico (1,5)'); }
 else if (g === 'elettrico') { etaGen = 1; fp = FP.elettricita; }
 const em = str(a, 'emitters');
 const etaEm = g === 'biomassa' || g === 'elettrico' ? 0.9 : em === 'pavimento' ? 0.97 : em === 'ventilconvettori' ? 0.95 : 0.92;
 const ctl = Array.isArray(a.controls) ? a.controls : [];
 const etaRg = ctl.includes('valvole') ? 0.97 : ctl.includes('cronotermostato') ? 0.92 : 0.86;
 const etaD = sys === 'centralizzato' ? 0.9 : 0.96;
 const etaH = etaGen * etaEm * etaRg * etaD;
 const deliveredH = qH / etaH;
 if (fp === FP.elettricita) electricH = deliveredH;
 const epH = (deliveredH * fp) / area;
 const epHRef = ((qHRef / (REF_ETA_UTIL_H * REF_ETA_GEN_H)) * FP.gas) / area;

 // Domestic hot water (UNI/TS 11300-2 residential volume, 40 °C, cold water 15 °C)
 const litres = Math.max(60, 1.067 * area + 36.5);
 let qW = (1.162 * litres * 25 * 365) / 1000;
 if (a.solarThermal === true) qW *= 0.45;
 const dhw = str(a, 'dhw');
 let epWdel = 0, fpW: number = FP.gas;
 if (dhw === 'boiler_elettrico') { epWdel = qW / 0.75; fpW = FP.elettricita; }
 else if (dhw === 'boiler_gas') { epWdel = qW / 0.7; fpW = FP.gas; }
 else if (dhw === 'pdc_acs') { epWdel = qW / 2.6; fpW = FP.elettricita; }
 else { const eff = g === 'pompa_calore' ? 2.4 : etaGen > 1 ? 2.4 : Math.min(0.85, etaGen * 0.85); epWdel = qW / eff; fpW = g === 'pompa_calore' ? FP.elettricita : fp; }
 const electricW = fpW === FP.elettricita ? epWdel : 0;
 const epW = (epWdel * fpW) / area;
 const epWRef = ((qW / REF_ETA_W) * FP.gas) / area;

 // Cooling (only if a system exists, as in the reference building)
 const cooling = str(a, 'cooling');
 let epC = 0, epCRef = 0, electricC = 0;
 if (cooling && cooling !== 'nessuno') {
  const cy = num(a, 'coolingYear');
  const eer = cy && cy >= 2015 ? 4.5 : cy && cy < 2008 ? 2.5 : 3.3;
  electricC = (COOLING_NEED_KWH_M2 * area) / eer;
  epC = (electricC * FP.elettricita) / area;
  epCRef = ((COOLING_NEED_KWH_M2 * area) / REF_EER / REF_ETA_UTIL_H) * FP.elettricita / area;
 }

 // Photovoltaics: self-consumed share offsets electric uses only.
 let pvCredit = 0;
 const pvKw = a.pv === true ? num(a, 'pvKw') ?? (assumptions.push('Fotovoltaico 3 kWp'), 3) : 0;
 if (pvKw > 0) {
  const selfUsed = Math.min(pvKw * PV_YIELD_KWH_KWP * PV_SELF_CONSUMPTION, electricH + electricW + electricC);
  pvCredit = (selfUsed * FP.elettricita) / area;
 }

 const ep = Math.max(0, epH + epW + epC - pvCredit);
 const epRef = epHRef + epWRef + epCRef;
 const ratio = ep / epRef;
 const energyClass = classFor(ratio);
 const spread = unknowns >= 3 ? 0.3 : unknowns >= 1 ? 0.18 : 0.1;
 const classRange: [EnergyClass, EnergyClass] = [classFor(ratio * (1 - spread)), classFor(ratio * (1 + spread))];
 const lossTotal = hTot || 1;
 const losses = ([['muri', hWall], ['finestre', hWin], ['tetto', hRoof], ['pavimento', hFloor], ['ventilazione', hVe]] as const)
  .filter(([, v]) => v > 0).map(([key, v]) => ({ key, share: v / lossTotal })).sort((x, y) => y.share - x.share);

 const suggestions: Estimate['suggestions'] = [];
 const top = losses[0]?.key;
 if (top === 'muri' && a.wallInsulated !== true) suggestions.push({ title: 'Cappotto termico', detail: 'I muri sono la prima fonte di dispersione: un isolamento di 10–12 cm può ridurre il fabbisogno di riscaldamento del 30–40%.' });
 if (uWin > 2.5) suggestions.push({ title: 'Sostituire i serramenti', detail: 'Vetri basso emissivi e telai a taglio termico riducono dispersioni e spifferi.' });
 if (g === 'caldaia_tradizionale' || (g === 'caldaia_non_so' && (!year || year < 2010))) suggestions.push({ title: 'Caldaia a condensazione o pompa di calore', detail: 'Il generatore è poco efficiente: sostituirlo è spesso l’intervento più rapido da ripagare.' });
 if (!ctl.includes('valvole') && sys !== 'nessuno' && em !== 'pavimento') suggestions.push({ title: 'Valvole termostatiche', detail: 'Costano poco e fanno guadagnare efficienza di regolazione.' });
 if (a.pv !== true && (type === 'casa' || type === 'schiera')) suggestions.push({ title: 'Fotovoltaico', detail: 'Riduce l’energia non rinnovabile, soprattutto con pompa di calore.' });

 return {
  energyClass, classRange, epglNren: round(ep), epglNrenRef: round(epRef), ratio: Math.round(ratio * 100) / 100,
  breakdown: { heating: round(epH), hotWater: round(epW), cooling: round(epC), pvCredit: round(pvCredit) },
  losses, confidence: unknowns >= 3 ? 'bassa' : unknowns >= 1 ? 'media' : 'buona', assumptions, suggestions: suggestions.slice(0, 3),
 };
}

const round = (x: number) => Math.round(x * 10) / 10;

export const CLASS_COLORS: Record<EnergyClass, string> = {
 A4: '#0B7A3E', A3: '#1E8F45', A2: '#3BA34A', A1: '#62B64E', B: '#9CC63F', C: '#D6D22B', D: '#F2B32A', E: '#EE8A2A', F: '#E25A2B', G: '#C9302C',
};
