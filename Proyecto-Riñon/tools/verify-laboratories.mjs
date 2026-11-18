import assert from 'node:assert/strict';
import {laboratories, initialProgress, stateFor, experimentReady, validProgress, gradeLaboratory} from '../renal-laboratories.js';
for(const lab of laboratories) {
  const initial=stateFor(lab),target=stateFor(lab,lab.target);
  assert.equal(initial.tfg,125);
  assert.equal(experimentReady(lab,initial),false);
  assert.equal(experimentReady(lab,target),true);
  for(const key of ['pgc','pbs','pigc','kf','bloodFlow','hematocrit']) {
    if(key!==lab.parameter) assert.equal(experimentReady(lab,{...target,[key]:target[key]+1}),false,key+' must remain fixed');
  }
  assert.equal(experimentReady(lab,{...target,valid:false}),false);
  assert.equal(validProgress(lab,initialProgress()),true);
  assert.equal(validProgress(lab,{...initialProgress(),stage:2}),false);
  assert.equal(validProgress(lab,{...initialProgress(),stage:3,prediction:'same'}),false);
  const complete={stage:4,prediction:lab.correctPrediction,experimentValue:lab.target,explanationChoice:lab.correctExplanation,reflection:'La variable cambió el resultado como indica la ecuación y mantuve las otras constantes.'};
  assert.equal(gradeLaboratory(lab,complete).percent,100);
  assert.equal(gradeLaboratory(lab,{...complete,prediction:'same'}).percent,50);
  assert.equal(gradeLaboratory(lab,{...complete,prediction:'same',explanationChoice:lab.options.find(([key])=>key!==lab.correctExplanation)[0]}).percent,0);
  assert.throws(()=>gradeLaboratory(lab,{...complete,reflection:' '.repeat(40)}));
  assert.equal(validProgress(lab,{...complete,reflection:'x'.repeat(2001)}),false);
  assert.equal(validProgress(lab,{...complete,experimentValue:-1}),false);
  assert.equal(validProgress(lab,{...complete,explanationChoice:'forged'}),false);
  assert.equal(validProgress(lab,{...complete,prediction:'forged'}),false);
}
assert.equal(stateFor(laboratories[0],24).tfg,50);
assert.equal(stateFor(laboratories[1],6).tfg,60);
assert.equal(stateFor(laboratories[2],60).filteredLoad,75);
assert.equal(stateFor(laboratories[2],60).tfg,125);
console.log('OK: tres laboratorios, valores de referencia, aislamiento de variables, secuencia, validación y puntajes 0/50/100.');
