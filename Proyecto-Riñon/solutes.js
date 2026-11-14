import * as THREE from './vendor/three.module.js';
import {GlomerulusSimulation} from './glomerulus-simulation.js';
import {prepareGlomerulusMesh, alignGlomerulusModel} from './glomerulus-structures.js';
import {DEFAULT_WATER} from './water-physiology.js';
import {SOLUTE_CATALOG, calculateSoluteState} from './solute-physiology.js';
import {setControlLabel} from './icons.js';

export class SolutesModule {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'Solutos · filtración glomerular';
    this.root.scale.setScalar(.18);
    this.root.visible = false;
    scene.add(this.root);
    this.active = false;
    this.paused = false;
    this.materials = [];
    this.state = calculateSoluteState();
    this.inputs = Object.fromEntries(Object.keys(DEFAULT_WATER).map(key =>
      [key, document.querySelector('#solutes-' + key)]));
    this.select = document.querySelector('#solutes-kind');
    for (const solute of SOLUTE_CATALOG) {
      const option = document.createElement('option');
      option.value = solute.id;
      option.textContent = solute.name;
      this.select.append(option);
    }
    this.select.addEventListener('change', () => this.selectSolute());
    for (const input of Object.values(this.inputs)) input.addEventListener('input', () => this.readParameters());
    for (const id of ['concentration', 'sieving']) {
      document.querySelector('#solutes-' + id).addEventListener('input', () => this.readParameters());
    }
    document.querySelector('#solutes-defaults').addEventListener('click', () => {
      for (const [key, input] of Object.entries(this.inputs)) input.value = DEFAULT_WATER[key];
      this.selectSolute();
    });
    document.querySelector('#solutes-pause').addEventListener('click', () => {
      this.paused = !this.paused;
      this.refresh();
    });
    document.querySelector('#solutes-restart').addEventListener('click', () => {
      this.simulation?.reset();
    });
    document.querySelector('#solutes-opacity').addEventListener('input', () => this.refreshOpacity());
    this.selectSolute();
  }

  selectSolute() {
    const solute = SOLUTE_CATALOG.find(item => item.id === this.select.value);
    const input = document.querySelector('#solutes-concentration');
    input.max = solute.max;
    input.step = solute.step;
    input.value = solute.concentration;
    document.querySelector('#solutes-sieving').value = 1;
    this.simulation?.reset();
    this.readParameters();
  }

  readParameters() {
    this.state = calculateSoluteState({
      ...Object.fromEntries(Object.entries(this.inputs).map(([key, input]) => [key, Number(input.value)])),
      soluteId: this.select.value,
      concentration: Number(document.querySelector('#solutes-concentration').value),
      sieving: Number(document.querySelector('#solutes-sieving').value)
    });
    this.syncSimulation();
    this.refresh();
  }

  syncSimulation() {
    if (!this.simulation) return;
    this.simulation.setState(this.state);
    this.simulation.bloodSpeed = .45 * this.state.plasmaFlow / 625;
  }

  async load(loader) {
    const [gltf, response] = await Promise.all([
      loader.loadAsync('./Models/Glomerulo.glb'), fetch('./glomerulus-routes.json')
    ]);
    if (!response.ok) throw new Error('No se pudieron cargar las rutas de los solutos.');
    const routes = await response.json();
    this.anatomy = gltf.scene;
    alignGlomerulusModel(this.anatomy);
    this.anatomy.traverse(node => {
      if (node.isMesh) prepareGlomerulusMesh(node, this.materials);
    });
    this.root.add(this.anatomy);
    this.simulation = new GlomerulusSimulation(this.root, routes);
    this.simulation.group.name = 'Soluto del plasma y del filtrado';
    this.simulation.glucose.material.color.set('#b35fe8');
    this.simulation.glucose.material.emissive.set('#6c269c');
    this.simulation.filtrateFluid.visible = false;
    this.simulation.transferFluids.forEach(mesh => mesh.visible = false);
    this.simulation.reabsorptionFluids.forEach(mesh => mesh.visible = false);
    this.syncSimulation();
    this.refreshOpacity();
    this.refresh();
    return this.root;
  }

  refreshOpacity() {
    const value = Number(document.querySelector('#solutes-opacity').value);
    for (const material of this.materials) {
      material.opacity = Math.min(.85, material.userData.baseOpacity * value / .2);
    }
    document.querySelector('#solutes-opacity-value').textContent = Math.round(value * 100) + ' %';
  }

  setActive(active) {
    this.active = active;
    this.root.visible = active;
    this.refresh();
  }

  update(dt) {
    if (!this.active || !this.simulation || this.paused || !this.state.valid) return;
    this.simulation.update(dt);
  }

  refresh() {
    const p = this.state;
    const solute = SOLUTE_CATALOG.find(item => item.id === p.soluteId);
    const text = (id, value) => document.querySelector('#solutes-' + id).textContent = value;
    const quantity = value => value.toFixed(solute.amountUnit === 'mmol' ? 4 : 2) + ' ' + solute.amountUnit + '/min';
    text('description', solute.description);
    text('legend-name', solute.name);
    text('value-concentration', p.concentration.toFixed(1) + ' ' + solute.unit);
    text('value-sieving', (p.sieving * 100).toFixed(0) + ' %');
    for (const key of ['pgc', 'pbs', 'pigc']) text('value-' + key, p[key].toFixed(1) + ' mmHg');
    text('value-kf', p.kf.toFixed(1) + ' mL/min/mmHg');
    text('value-bloodFlow', p.bloodFlow.toFixed(0) + ' mL/min');
    text('value-hematocrit', p.hematocrit.toFixed(0) + ' %');
    text('result-pnf', p.pnf.toFixed(1) + ' mmHg');
    text('result-tfg', p.tfg.toFixed(1) + ' mL/min');
    text('result-plasma', p.plasmaFlow.toFixed(1) + ' mL/min');
    text('result-concentration', p.filtrateConcentration.toFixed(2) + ' ' + solute.unit);
    text('result-load', quantity(p.filteredLoad));
    text('result-extraction', p.extraction === null ? 'Sin carga de entrada' : (p.extraction * 100).toFixed(1) + ' %');
    text('load-equation', 'CF = TFG × Cfiltrado / ' + solute.divisor);
    text('summary-incoming', quantity(p.incomingLoad));
    text('summary-filtered', quantity(p.filteredLoad));
    text('summary-efferent', p.efferentLoad === null ? 'Fuera del modelo' : quantity(p.efferentLoad));
    text('status', !p.valid ? 'Combinación fuera del modelo'
      : p.filteredLoad > 0 ? 'Filtración de ' + solute.name.toLowerCase() : 'Sin paso de soluto al filtrado');
    text('status-detail', !p.valid
      ? 'La TFG supera el plasma disponible. Ajusta las presiones, Kf o el flujo para recuperar un balance posible.'
      : 'El soluto llega por la aferente. La parte filtrada pasa a Bowman y al proximal; el resto sigue por la eferente.');
    document.querySelector('#solutes-invalid-note').hidden = p.valid;
    setControlLabel(document.querySelector('#solutes-pause'), this.paused ? 'play' : 'pause', this.paused ? 'Continuar' : 'Pausar');
    document.querySelector('#solutes-pause-notice').hidden = !this.active || !this.paused;
    document.querySelector('#solutes-legend').hidden = !this.active;
  }
}
