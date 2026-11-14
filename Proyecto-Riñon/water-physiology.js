// Whole-kidney volume model based on chapter 2 of Fisiología renal,
// Elsi Olaya Estefan, PDF pages 27–30. Pressures are mean values.
// Bowman oncotic pressure is assumed negligible, with an intact barrier.
export const DEFAULT_WATER = Object.freeze({
  pgc: 60, pbs: 18, pigc: 32, kf: 12.5, bloodFlow: 1250, hematocrit: 50
});

export function calculateWaterState(input = {}) {
  const p = {...DEFAULT_WATER, ...input};
  for (const key of Object.keys(DEFAULT_WATER)) {
    if (!Number.isFinite(p[key]) || p[key] < 0) throw new Error('Parámetro de agua inválido: ' + key);
  }
  if (p.hematocrit >= 100) throw new Error('El hematocrito debe ser menor que 100 %.');
  const pnf = p.pgc - p.pbs - p.pigc;
  const tfg = p.kf * Math.max(0, pnf);
  const plasmaFlow = p.bloodFlow * (1 - p.hematocrit / 100);
  const fraction = plasmaFlow > 0 ? tfg / plasmaFlow : null;
  const valid = tfg <= plasmaFlow;
  return Object.freeze({
    ...p, pnf, tfg, plasmaFlow, fraction, valid,
    litersPerDay: tfg * 1440 / 1000,
    efferentPlasma: valid ? plasmaFlow - tfg : null,
    // Reuse the measured glomerular paths. Water in this view leaves through
    // the proximal outlet; the downstream tubular water balance is not modeled.
    inletRate: valid ? plasmaFlow / 100 : 0,
    filtrationProbability: valid ? fraction ?? 0 : 0,
    reabsorptionFraction: 0,
    filtrateSpeed: valid && tfg > 0 ? .38 * tfg / 125 : 0
  });
}
