import {DEFAULT_WATER, calculateWaterState} from './water-physiology.js';
import {calculateSoluteState} from './solute-physiology.js';

export const laboratories = Object.freeze([
  {id:'bowman-v1', number:'01', title:'Una presión que se opone', topic:'Agua · presión en Bowman', minutes:8,
    question:'Si la presión en Bowman aumenta de 18 a 24 mmHg, ¿qué pasará con la TFG?',
    objective:'Relacionar la presión capsular con la presión neta y el volumen filtrado.',
    module:'4', prefix:'water', parameter:'pbs', parameterName:'Presión en Bowman', initial:18, target:24, unit:'mmHg', metric:'tfg', metricName:'TFG', metricUnit:'mL/min', correctPrediction:'decrease', correctExplanation:'opposes',
    options:[['opposes','La presión en Bowman se opone a la salida de líquido del capilar.'],['promotes','La presión en Bowman impulsa el filtrado hacia la cápsula.'],['reabsorbs','El glomérulo reabsorbe el agua que ya pasó al túbulo.']],
    equation:'PNF = PGC − PBS − πGC · TFG = Kf × máx(0, PNF)',
    feedback:'Al subir PBS, la PNF baja de 10 a 4 mmHg. Con Kf constante, la TFG pasa de 125 a 50 mL/min. Se filtra menos líquido hacia Bowman.',
    prompt:'Explica por qué cambió la TFG. Usa la presión neta y tus mediciones.',
    transfer:'¿Qué pasaría si PBS llegara a 28 mmHg, sin cambiar las demás variables?',
    transferAnswer:'PNF = 60 − 28 − 32 = 0 mmHg; el modelo muestra TFG = 0.',
    source:'Fisiología renal · Elsi Olaya Estefan · capítulo 2, presiones de filtración.'},
  {id:'kf-v1', number:'02', title:'La capacidad del filtro', topic:'Agua · coeficiente Kf', minutes:8,
    question:'Con las mismas presiones, ¿qué pasará con la TFG si Kf baja de 12,5 a 6 mL/min/mmHg?',
    objective:'Distinguir el efecto de Kf del efecto de las presiones.',
    module:'4', prefix:'water', parameter:'kf', parameterName:'Coeficiente de filtración', initial:12.5, target:6, unit:'mL/min/mmHg', metric:'tfg', metricName:'TFG', metricUnit:'mL/min', correctPrediction:'decrease', correctExplanation:'capacity',
    options:[['pressure','La presión neta aumenta automáticamente al bajar Kf.'],['capacity','Con la misma PNF, un Kf menor produce un volumen filtrado menor.'],['urine','Kf mide directamente el volumen final de orina.']],
    equation:'TFG = Kf × PNF',
    feedback:'La PNF se mantiene en 10 mmHg. Al bajar Kf de 12,5 a 6, la TFG pasa de 125 a 60 mL/min. Kf representa el área y la conductividad hidráulica del filtro.',
    prompt:'Explica qué cambió y qué se mantuvo constante. Relaciona Kf, PNF y TFG.',
    transfer:'Si Kf fuera cero y las presiones siguieran iguales, ¿habría filtración?',
    transferAnswer:'No. TFG = 0 × 10 = 0 mL/min, aunque exista presión neta positiva.',
    source:'Fisiología renal · Elsi Olaya Estefan · capítulo 2, Kf y tasa de filtración.'},
  {id:'solute-v1', number:'03', title:'Más soluto, ¿más filtración?', topic:'Urea · carga filtrada', minutes:10,
    question:'Si la urea plasmática sube de 30 a 60 mg/dL y la TFG permanece igual, ¿qué pasará con la carga filtrada de urea?',
    objective:'Diferenciar volumen de ultrafiltrado y cantidad de soluto filtrado.',
    module:'5', prefix:'solutes', parameter:'concentration', parameterName:'Concentración de urea', initial:30, target:60, unit:'mg/dL', metric:'filteredLoad', metricName:'Carga filtrada', metricUnit:'mg/min', correctPrediction:'increase', correctExplanation:'load',
    options:[['volume','La TFG necesariamente se duplica al duplicar cualquier concentración.'],['load','La carga filtrada aumenta con la concentración, aunque la TFG sea igual.'],['excretion','Toda la urea filtrada se excreta sin manejo tubular posterior.']],
    equation:'Carga filtrada = TFG × Purea × θ / 100',
    feedback:'Con TFG = 125 mL/min y θ = 1, la carga pasa de 37,5 a 75 mg/min. La TFG sigue en 125 mL/min. El factor 100 convierte mg/dL a mg/mL.',
    prompt:'Compara las cargas y la TFG. Explica por qué filtrar más urea no significa producir más orina.',
    transfer:'¿Qué carga se filtraría con 60 mg/dL si θ bajara a 0,5?',
    transferAnswer:'125 × 60 × 0,5 / 100 = 37,5 mg/min. Es un escenario de filtrabilidad ajustable.',
    source:'Fisiología renal · Elsi Olaya Estefan · capítulos 2 y 4, carga filtrada y urea.'}
]);
export const predictionLabels = {decrease:'Disminuye', same:'Se mantiene', increase:'Aumenta'};
export function initialProgress() { return {stage:1, prediction:'', experimentValue:-1, explanationChoice:'', reflection:''}; }
export function stateFor(lab, value = lab.initial) {
  const parameters = {...DEFAULT_WATER, [lab.parameter]:value};
  return lab.module === '5' ? calculateSoluteState({...parameters, soluteId:'urea', sieving:1}) : calculateWaterState(parameters);
}
export function experimentReady(lab, state) {
  if (!state?.valid) return false;
  const expected = stateFor(lab, lab.target);
  const keys = [...Object.keys(DEFAULT_WATER), ...(lab.module === '5' ? ['concentration','sieving','soluteId'] : [])];
  return keys.every(key => typeof expected[key] === 'number' ? Math.abs(expected[key] - state[key]) < 1e-6 : expected[key] === state[key]);
}
export function validProgress(lab, p, complete = false) {
  return !!p && [1,2,3,4].includes(p.stage) && typeof p.reflection === 'string' && p.reflection.length <= 2000 &&
    (p.prediction === '' || Object.hasOwn(predictionLabels,p.prediction)) &&
    (p.explanationChoice === '' || lab.options.some(([key]) => key === p.explanationChoice)) &&
    [lab.target,-1].includes(p.experimentValue) &&
    (p.stage === 1 || p.prediction !== '') && (p.stage < 3 || p.experimentValue === lab.target) &&
    (p.stage < 4 || (p.explanationChoice !== '' && p.reflection.trim().length >= 30)) && (!complete || p.stage === 4);
}
export function gradeLaboratory(lab, p) {
  if (!validProgress(lab,p,true)) throw new Error('Completa los tres pasos antes de entregar.');
  const predictionCorrect = p.prediction === lab.correctPrediction;
  const explanationCorrect = p.explanationChoice === lab.correctExplanation;
  return {predictionCorrect, explanationCorrect, percent:50 * (Number(predictionCorrect) + Number(explanationCorrect))};
}
