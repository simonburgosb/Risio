import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {SOLUTE_CATALOG, calculateSoluteState} from '../solute-physiology.js';
import {GlomerulusSimulation} from '../glomerulus-simulation.js';

const urea = calculateSoluteState();
assert.equal(urea.tfg, 125);
assert.equal(urea.filtrateConcentration, 30);
assert.equal(urea.incomingLoad, 187.5);
assert.equal(urea.filteredLoad, 37.5);
assert.equal(urea.efferentLoad, 150);
assert.equal(urea.extraction, .2);
assert.equal(calculateSoluteState({concentration: 60}).filteredLoad, 75);
assert.equal(calculateSoluteState({sieving: .5}).filteredLoad, 18.75);
assert.equal(calculateSoluteState({sieving: 0}).filteredLoad, 0);
assert.equal(calculateSoluteState({sieving: 0}).tfg, 125);
assert.equal(calculateSoluteState({concentration: 0}).inletRate, 0);
assert.equal(calculateSoluteState({concentration: 0}).extraction, null);
assert.equal(calculateSoluteState({soluteId: 'creatinine'}).filteredLoad, 1.5);
assert.equal(calculateSoluteState({soluteId: 'aminoacids'}).filteredLoad, .3125);
assert.equal(calculateSoluteState({kf: 0}).filteredLoad, 0);
assert.equal(calculateSoluteState({pgc: 0}).filteredLoad, 0);
assert.equal(calculateSoluteState({hematocrit: 60}).incomingLoad, 150);
assert.equal(calculateSoluteState({pgc: 80, pbs: 0, pigc: 0, kf: 20}).valid, false);
assert.throws(() => calculateSoluteState({sieving: -1}));
assert.throws(() => calculateSoluteState({sieving: 2}));
assert.throws(() => calculateSoluteState({concentration: -1}));
assert.throws(() => calculateSoluteState({concentration: NaN}));
assert.throws(() => calculateSoluteState({soluteId: 'unknown'}));
for (const solute of SOLUTE_CATALOG) {
  for (const sieving of [0, .5, 1]) {
    const state = calculateSoluteState({soluteId: solute.id, sieving});
    assert.ok(Math.abs(state.incomingLoad - state.filteredLoad - state.efferentLoad) < 1e-9);
    assert.ok(Math.abs(state.extraction - state.fraction * sieving) < 1e-9);
  }
}
const routes = JSON.parse(fs.readFileSync(new URL('../glomerulus-routes.json', import.meta.url)));
for (const sieving of [0, .5, 1]) {
  const state = calculateSoluteState({sieving});
  const sim = new GlomerulusSimulation(new THREE.Group(), routes);
  sim.setState(state);
  for (let i = 0; i < 180 * 30; i++) sim.update(1 / 30);
  const stats = sim.stats;
  assert.equal(stats.absorbed, 0);
  assert.equal(stats.returning, 0);
  assert.equal(stats.filtered, stats.continued + stats.filtrate);
  assert.equal(sim.serial, stats.filtered + stats.unfiltered + stats.blood);
  const fraction = stats.filtered / (stats.filtered + stats.unfiltered);
  assert.ok(Math.abs(fraction - state.filtrationProbability) < .025);
}
console.log('OK: solutos, unidades mg/dL y mmol/L, concentración y filtrabilidad, conservación de cargas, fracciones visuales, límites y ruta glomerular sin reabsorción.');
