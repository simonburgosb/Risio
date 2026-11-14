import {calculateWaterState} from './water-physiology.js';

// Teaching examples from Fisiología renal, Elsi Olaya Estefan.
// PDF p. 30 (filtered load, creatinine), p. 50 (amino acids), p. 61 (urea).
// The custom example is an adjustable scenario in mg/dL.
export const SOLUTE_CATALOG = Object.freeze([
  Object.freeze({id: 'urea', name: 'Urea', concentration: 30, max: 100, step: 1,
    unit: 'mg/dL', amountUnit: 'mg', divisor: 100,
    description: 'La urea se filtra libremente. Más adelante puede reabsorberse y secretarse en diferentes segmentos tubulares.'}),
  Object.freeze({id: 'creatinine', name: 'Creatinina', concentration: 1.2, max: 6, step: .1,
    unit: 'mg/dL', amountUnit: 'mg', divisor: 100,
    description: 'La creatinina se filtra libremente. La secreción tubular posterior también contribuye a su eliminación.'}),
  Object.freeze({id: 'aminoacids', name: 'Aminoácidos totales', concentration: 2.5, max: 10, step: .1,
    unit: 'mmol/L', amountUnit: 'mmol', divisor: 1000,
    description: 'Los aminoácidos libres se filtran y normalmente se recuperan en el túbulo proximal mediante transportadores.'}),
  Object.freeze({id: 'custom', name: 'Soluto X', concentration: 50, max: 200, step: 1,
    unit: 'mg/dL', amountUnit: 'mg', divisor: 100,
    description: 'Escenario ajustable. Explora cómo la concentración y la filtrabilidad cambian la cantidad de soluto que pasa a Bowman.'})
]);

export function calculateSoluteState(input = {}) {
  const solute = SOLUTE_CATALOG.find(item => item.id === (input.soluteId ?? 'urea'));
  if (!solute) throw new Error('Soluto desconocido.');
  const water = calculateWaterState(input);
  const concentration = input.concentration ?? solute.concentration;
  const sieving = input.sieving ?? 1;
  if (!Number.isFinite(concentration) || concentration < 0) throw new Error('Concentración inválida.');
  if (!Number.isFinite(sieving) || sieving < 0 || sieving > 1) throw new Error('Filtrabilidad inválida.');
  const filtrateConcentration = concentration * sieving;
  const incomingLoad = water.plasmaFlow * concentration / solute.divisor;
  const filteredLoad = water.tfg * filtrateConcentration / solute.divisor;
  const extraction = incomingLoad > 0 ? filteredLoad / incomingLoad : null;
  return Object.freeze({
    ...water, soluteId: solute.id, concentration, sieving, filtrateConcentration,
    incomingLoad, filteredLoad, extraction,
    efferentLoad: water.valid ? incomingLoad - filteredLoad : null,
    filtrationProbability: water.valid ? (water.fraction ?? 0) * sieving : 0,
    // Visual density varies monotonically with supply. Particles are illustrative
    // packets, with a separate reference scale for each preset and unit.
    inletRate: water.valid ? 6.25 * Math.sqrt(water.plasmaFlow / 625 * concentration / solute.concentration) : 0
  });
}
