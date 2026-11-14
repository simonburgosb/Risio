import * as THREE from './vendor/three.module.js';
import {GlomerulusSimulation} from './glomerulus-simulation.js';
import {prepareGlomerulusMesh, alignGlomerulusModel} from './glomerulus-structures.js';
import {calculateWaterState, DEFAULT_WATER} from './water-physiology.js';
import {setControlLabel} from './icons.js';

export class WaterModule {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'Agua · filtración glomerular';
    this.root.scale.setScalar(.18);
    this.root.visible = false;
    scene.add(this.root);
    this.active = false;
    this.paused = false;
    this.materials = [];
    this.state = calculateWaterState();
    this.inputs = Object.fromEntries(Object.keys(DEFAULT_WATER).map(key =>
      [key, document.querySelector('#water-' + key)]));
    for (const input of Object.values(this.inputs)) input.addEventListener('input', () => this.readParameters());
    document.querySelector('#water-defaults').addEventListener('click', () => {
      for (const [key, input] of Object.entries(this.inputs)) input.value = DEFAULT_WATER[key];
      this.readParameters();
    });
    document.querySelector('#water-pause').addEventListener('click', () => {
      this.paused = !this.paused;
      this.refresh();
    });
    document.querySelector('#water-restart').addEventListener('click', () => {
      this.simulation?.reset();
      this.refresh();
    });
    document.querySelector('#water-opacity').addEventListener('input', () => this.refreshOpacity());
    this.refresh();
  }

  readParameters() {
    this.state = calculateWaterState(Object.fromEntries(
      Object.entries(this.inputs).map(([key, input]) => [key, Number(input.value)])));
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
    if (!response.ok) throw new Error('No se pudieron cargar las rutas del agua.');
    const routes = await response.json();
    this.anatomy = gltf.scene;
    alignGlomerulusModel(this.anatomy);
    this.anatomy.traverse(node => {
      if (node.isMesh) prepareGlomerulusMesh(node, this.materials);
    });
    this.root.add(this.anatomy);
    this.simulation = new GlomerulusSimulation(this.root, routes);
    this.simulation.group.name = 'Agua del plasma y ultrafiltrado';
    this.simulation.glucose.material.color.set('#329bfa');
    this.simulation.glucose.material.emissive.set('#1661aa');
    this.simulation.filtrateFluid.material.uniforms.color.value.set('#329bfa');
    this.simulation.transferFluids.forEach(mesh => mesh.material.uniforms.color.value.set('#329bfa'));
    this.simulation.reabsorptionFluids.forEach(mesh => mesh.visible = false);
    this.syncSimulation();
    this.refreshOpacity();
    this.refresh();
    return this.root;
  }

  refreshOpacity() {
    const value = Number(document.querySelector('#water-opacity').value);
    for (const material of this.materials) {
      material.opacity = Math.min(.85, material.userData.baseOpacity * value / .2);
    }
    document.querySelector('#water-opacity-value').textContent = Math.round(value * 100) + ' %';
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
    const format = (value, unit) => value.toFixed(1) + ' ' + unit;
    for (const key of ['pgc', 'pbs', 'pigc']) {
      document.querySelector('#water-value-' + key).textContent = format(p[key], 'mmHg');
    }
    document.querySelector('#water-value-kf').textContent = format(p.kf, 'mL/min/mmHg');
    document.querySelector('#water-value-bloodFlow').textContent = format(p.bloodFlow, 'mL/min');
    document.querySelector('#water-value-hematocrit').textContent = format(p.hematocrit, '%');
    document.querySelector('#water-result-pnf').textContent = format(p.pnf, 'mmHg');
    document.querySelector('#water-result-tfg').textContent = format(p.tfg, 'mL/min');
    document.querySelector('#water-result-plasma').textContent = format(p.plasmaFlow, 'mL/min');
    document.querySelector('#water-result-fraction').textContent = p.fraction === null ? 'Sin flujo plasmático' : format(p.fraction * 100, '%');
    document.querySelector('#water-result-daily').textContent = format(p.litersPerDay, 'L/día');
    document.querySelector('#water-summary-tfg').textContent = format(p.tfg, 'mL/min');
    document.querySelector('#water-summary-efferent').textContent = p.efferentPlasma === null ? 'Fuera del modelo' : format(p.efferentPlasma, 'mL/min');
    document.querySelector('#water-status').textContent = !p.valid ? 'Combinación fuera del modelo'
      : p.tfg > 0 ? 'Filtración activa' : 'Filtración detenida';
    document.querySelector('#water-status-detail').textContent = !p.valid
      ? 'La TFG calculada supera el plasma disponible. Ajusta las presiones, Kf o el flujo. La animación se detiene hasta recuperar un balance posible.'
      : p.tfg === 0
        ? 'Con PNF menor o igual a cero, o Kf igual a cero, se detiene el paso de agua al filtrado. La sangre continúa por los vasos.'
        : 'El agua entra por la aferente. Una parte pasa a Bowman y al proximal; la que permanece en el plasma sale por la eferente.';
    document.querySelector('#water-zero-note').hidden = p.pnf > 0;
    document.querySelector('#water-invalid-note').hidden = p.valid;
    setControlLabel(document.querySelector('#water-pause'), this.paused ? 'play' : 'pause', this.paused ? 'Continuar' : 'Pausar');
    document.querySelector('#water-pause-notice').hidden = !this.active || !this.paused;
    document.querySelector('#water-legend').hidden = !this.active;
  }
}
