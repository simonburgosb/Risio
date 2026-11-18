import {auth, database, withTimeout} from './firebase-client.js';
import {ref, get, set, update, push, query, limitToLast, serverTimestamp, onAuthStateChanged} from './vendor/firebase-sdk.js';
import {laboratories, predictionLabels, initialProgress, stateFor, experimentReady, validProgress, gradeLaboratory} from './renal-laboratories.js';

const $ = id => document.getElementById(id);
let current = null, busy = false, launchId = 0, simulationOpen = false;
const dock = document.createElement('section');
dock.className = 'lab-dock'; dock.hidden = true; dock.setAttribute('aria-label','Experimento guiado');
dock.innerHTML = '<strong id="lab-dock-title"></strong><p id="lab-dock-task"></p><p id="lab-dock-reading" role="status"></p><button id="lab-capture" class="assessment-button" type="button">Registrar medición y continuar</button><button id="lab-reset-simulation" class="assessment-button secondary" type="button">Restablecer experimento</button><button id="lab-return" class="assessment-button secondary" type="button">Volver al laboratorio</button>';
$('water-controls-panel').prepend(dock);

function node(tag,text,className) { const el=document.createElement(tag); if(text!==undefined) el.textContent=text; if(className) el.className=className; return el; }
function owned(c=current) { return c && current===c && auth.currentUser?.uid===c.uid; }
function message(text) { $('lab-status').textContent=text; }
function focus(id) { if(document.body.classList.contains('library-screen-open')) $(id).focus(); }
function date(value) { return new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }
function number(value) { return new Intl.NumberFormat('es-CO',{maximumFractionDigits:2}).format(value); }
function measured(lab,state) { return `${number(state[lab.metric])} ${lab.metricUnit}`; }
function library() {
  simulationOpen=false; dock.hidden=true; document.querySelectorAll('.lab-target-slider').forEach(el=>el.classList.remove('lab-target-slider'));
  $('btn-home').click();
  $('btn-library').click(); $('library-area-labs').click();
}
function option(container,name,value,text,checked=false) {
  const label=node('label',undefined,'assessment-option'), input=node('input');
  input.type='radio'; input.name=name; input.value=value; input.checked=checked;
  label.append(input,node('span',text)); container.append(label);
}
function disable(value) {
  busy=value;
  for(const el of [...$('lab-detail').querySelectorAll('button,input,textarea'),...dock.querySelectorAll('button')]) el.disabled=value;
  if(!value) refreshDock();
}
function getDraft() {
  const p={...current.progress};
  if(p.stage===1) p.prediction=$('lab-form').querySelector('[name=lab-prediction]:checked')?.value || '';
  if(p.stage===3) {
    p.explanationChoice=$('lab-form').querySelector('[name=lab-cause]:checked')?.value || '';
    p.reflection=$('lab-reflection').value;
  }
  return p;
}
function accessError(error) {
  return /permission.denied/i.test(error.code||error.message||'')
    ? 'No se pudo guardar o leer. Publica el database.rules.json actualizado en Firebase y vuelve a intentar.'
    : 'No se pudo confirmar la conexión. Tus respuestas siguen aquí; vuelve a intentar.';
}
async function saveProgress(next, success='Borrador guardado en tu cuenta.') {
  const c=current;
  if(busy||!owned(c)||!validProgress(c.lab,next)) return false;
  disable(true); message('Guardando tu avance…');
  try {
    await withTimeout(set(ref(database,`laboratoryProgress/${c.uid}/${c.lab.id}`),{...next,updatedAt:serverTimestamp()}));
    if(!owned(c)) return false;
    c.progress=next; render(); message(success); return true;
  } catch(error) { if(owned(c)) message(accessError(error)); return false; }
  finally { disable(false); }
}
function renderMeasurements() {
  const {lab,progress:p}=current, baseline=stateFor(lab), recorded=p.experimentValue===lab.target ? stateFor(lab,p.experimentValue) : null;
  const rows=[[lab.parameterName,`${number(lab.initial)} ${lab.unit}`,recorded?`${number(p.experimentValue)} ${lab.unit}`:'Por registrar'],
    [lab.metricName,measured(lab,baseline),recorded?measured(lab,recorded):'Por registrar']];
  if(lab.module==='5') rows.push(['TFG',`${number(baseline.tfg)} mL/min`,recorded?`${number(recorded.tfg)} mL/min`:'Por registrar']);
  else rows.push(['Presión neta',`${number(baseline.pnf)} mmHg`,recorded?`${number(recorded.pnf)} mmHg`:'Por registrar']);
  $('lab-measurements').replaceChildren(...rows.map(row=>{const tr=node('tr');row.forEach((v,i)=>tr.append(node(i?'td':'th',v)));return tr;}));
}
function renderHistory() {
  const c=current;
  $('lab-history-section').hidden=!c.history.length;
  $('lab-history').replaceChildren(...c.history.map(attempt=>{
    const item=node('div',undefined,'lab-history-item');
    const score=gradeLaboratory(c.lab,attempt).percent;
    item.append(node('span',`${date(attempt.submittedAt)} · ${score} %`));
    const view=node('button','Revisar intento','assessment-button secondary');view.type='button';
    view.addEventListener('click',()=>{ if(busy) return; if(!c.reviewing && c.progress.stage!==4) c.progress=getDraft(); c.reviewing=attempt; render();focus('lab-result-title'); });
    item.append(view);return item;
  }));
}
function renderResult(p) {
  const {lab}=current, grade=gradeLaboratory(lab,p);
  $('lab-score').textContent=`${grade.percent} %`;
  const rows=[['Predicción',grade.predictionCorrect,`Elegiste «${predictionLabels[p.prediction]}». El resultado esperado era «${predictionLabels[lab.correctPrediction]}».`],
    ['Explicación elegida',grade.explanationCorrect,lab.options.find(([key])=>key===p.explanationChoice)[1] + (grade.explanationCorrect ? '' : ' Explicación esperada: ' + lab.options.find(([key])=>key===lab.correctExplanation)[1])]];
  $('lab-review').replaceChildren(...rows.map(([title,right,text])=>{const el=node('div',undefined,'lab-verdict');el.append(node('b',`${title} · ${right?'Correcta':'Por revisar'}`),node('p',text));return el;}));
  $('lab-equation').textContent=lab.equation;
  $('lab-feedback').textContent=lab.feedback;
  $('lab-saved-reflection').textContent=p.reflection;
  $('lab-transfer-question').textContent='Un paso más · '+lab.transfer;
  $('lab-transfer-answer').textContent=lab.transferAnswer;
  const details=$('lab-transfer-question').parentElement;details.open=false;
  $('lab-repeat').textContent=current.reviewing && current.progress.stage!==4 ? 'Volver a mi borrador' : 'Realizar un nuevo intento';
}
function render() {
  if(!owned()) return;
  const {lab,progress:p}=current, result=current.reviewing||p;
  const complete=result.stage===4;
  $('lab-form').hidden=complete; $('lab-result').hidden=!complete;
  ['predict','experiment','explain'].forEach((key,i)=>$('lab-'+key).hidden=p.stage!==i+1);
  [...$('lab-steps').children].forEach((el,i)=>{
    const stage=complete?4:p.stage; el.dataset.complete=String(stage>i+1);
    if(stage===i+1) el.setAttribute('aria-current','step'); else el.removeAttribute('aria-current');
  });
  $('lab-question').textContent=lab.question;
  $('lab-predictions').querySelectorAll('label').forEach(el=>el.remove());
  Object.entries(predictionLabels).forEach(([key,label])=>option($('lab-predictions'),'lab-prediction',key,label,p.prediction===key));
  $('lab-instruction').textContent=`Lleva «${lab.parameterName}» de ${number(lab.initial)} a ${number(lab.target)} ${lab.unit}. Mantén las otras variables en su valor inicial para comparar el efecto de un solo cambio.`;
  $('lab-prediction-summary').textContent=`Tu predicción guardada: ${predictionLabels[p.prediction]||'—'}.`;
  renderMeasurements();
  $('lab-explain-next').hidden=p.experimentValue!==lab.target;
  $('lab-evidence').textContent=p.experimentValue===lab.target?`${lab.metricName}: ${measured(lab,stateFor(lab))} al inicio → ${measured(lab,stateFor(lab,p.experimentValue))} al terminar.`:'';
  $('lab-causes').querySelectorAll('label').forEach(el=>el.remove());
  lab.options.forEach(([key,text])=>option($('lab-causes'),'lab-cause',key,text,p.explanationChoice===key));
  $('lab-reflection-label').textContent=lab.prompt;
  $('lab-reflection').value=p.reflection;
  if(complete) renderResult(result);
  renderHistory();
}
async function open(lab) {
  if(busy||!auth.currentUser) return;
  const id=++launchId, uid=auth.currentUser.uid;
  current=null;simulationOpen=false;dock.hidden=true;
  $('lab-catalog').hidden=true; $('lab-detail').hidden=false;
  $('lab-title').textContent=lab.title; $('lab-topic').textContent=lab.topic;
  $('lab-objective').textContent=lab.objective; $('lab-source').textContent=lab.source;
  $('lab-form').hidden=true;$('lab-result').hidden=true;$('lab-history-section').hidden=true;$('lab-retry').hidden=true;
  $('lab-steps').hidden=true;message('Cargando tu avance y tus últimos intentos…');focus('lab-title');
  $('lab-retry').onclick=()=>open(lab);
  try {
    const [progressSnap,attemptSnap]=await withTimeout(Promise.all([
      get(ref(database,`laboratoryProgress/${uid}/${lab.id}`)),
      get(query(ref(database,`laboratoryAttempts/${uid}/${lab.id}`),limitToLast(10)))
    ]));
    if(id!==launchId||auth.currentUser?.uid!==uid) return;
    const stored=progressSnap.val(), history=Object.entries(attemptSnap.val()||{}).map(([key,p])=>({...p,key})).filter(p=>validProgress(lab,p,true)).reverse();
    if(stored&&!validProgress(lab,stored)) throw new Error('invalid-progress');
    current={uid,lab,progress:stored||initialProgress(),history,pendingKey:null,reviewing:null};
    $('lab-steps').hidden=false;render();message(stored?'Avance recuperado de tu cuenta.':'Tu predicción se guardará antes de abrir el experimento.');
  } catch(error) {
    if(id!==launchId||auth.currentUser?.uid!==uid) return;
    message(error.message==='invalid-progress'?'No se pudo interpretar el avance guardado. Contacta al responsable del curso.':accessError(error));$('lab-retry').hidden=false;
  }
}
function simulationState() {
  if(!owned()||!window.atlasRenal) return null;
  return current.lab.module==='5'?window.atlasRenal.solutesModule.state:window.atlasRenal.waterModule.state;
}
function refreshDock() {
  if(!simulationOpen||!owned()) return;
  const {lab}=current, state=simulationState();
  const ready=experimentReady(lab,state);
  $('lab-dock-reading').textContent=state?`${lab.parameterName}: ${number(state[lab.parameter])} ${lab.unit} · ${lab.metricName}: ${measured(lab,state)}. ${ready?'Listo para registrar.':'Ajusta solo el slider indicado; si cambiaste otros, restablece el experimento.'}`:'Cargando simulación…';
  $('lab-capture').disabled=busy||!ready;
}
function setSimulation(value) {
  const {lab}=current, atlas=window.atlasRenal;
  if(lab.module==='5') {
    $('solutes-kind').value='urea';$('solutes-kind').dispatchEvent(new Event('change',{bubbles:true}));
  }
  $(lab.prefix+'-defaults').click();
  const input=$(lab.prefix+'-'+lab.parameter);
  input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
  const module=lab.module==='5'?atlas.solutesModule:atlas.waterModule;
  module.paused=false;module.simulation?.reset();module.refresh();
}
function startSimulation() {
  if(!owned()||busy) return;
  current.progress=getDraft();
  if(!window.atlasRenal) {message('El visor aún está cargando. Vuelve a intentar en un momento.');return;}
  const {lab,progress:p}=current;
  simulationOpen=true;
  $(lab.prefix+'-controls-panel').prepend(dock);dock.hidden=false;
  $('lab-dock-title').textContent='Laboratorio · '+lab.title;
  $('lab-dock-task').textContent=`Ajusta ${lab.parameterName} a ${number(lab.target)} ${lab.unit}. Conserva los demás valores.`;
  document.dispatchEvent(new CustomEvent('risio-lab-open-simulation',{detail:{module:lab.module}}));
  setSimulation(p.experimentValue===lab.target?lab.target:lab.initial);
  document.querySelectorAll('.lab-target-slider').forEach(el=>el.classList.remove('lab-target-slider'));
  $(lab.prefix+'-'+lab.parameter).classList.add('lab-target-slider');
  refreshDock();$('lab-dock-title').scrollIntoView({block:'nearest'});
}
$('lab-commit').addEventListener('click',async()=>{
  if(!owned()||busy) return;
  const p=getDraft();
  if(!p.prediction) {message('Elige una predicción antes de continuar.');return;}
  if(await saveProgress({...p,stage:2},'Predicción guardada. Ahora compruébala en el glomérulo.')) focus('lab-simulate');
});
$('lab-simulate').addEventListener('click',startSimulation);
$('lab-observe-again').addEventListener('click',startSimulation);
$('lab-explain-next').addEventListener('click',async()=>{if(owned()&&await saveProgress({...current.progress,stage:3})) focus('lab-reflection');});
$('lab-return').addEventListener('click',()=>{library();focus('lab-title');});
$('lab-reset-simulation').addEventListener('click',()=>{if(!busy&&owned()) {setSimulation(current.lab.initial);refreshDock();}});
$('lab-capture').addEventListener('click',async()=>{
  if(!owned()||busy||!experimentReady(current.lab,simulationState())) return;
  const p={...current.progress,stage:3,experimentValue:current.lab.target};
  if(await saveProgress(p,'Medición guardada. Compara los resultados y explica el cambio.')) {library();focus('lab-reflection');}
});
document.addEventListener('input',event=>{if(event.target.id.startsWith('water-')||event.target.id.startsWith('solutes-')) refreshDock();});
document.addEventListener('change',event=>{if(event.target.id==='solutes-kind') refreshDock();});
$('lab-draft').addEventListener('click',()=>{if(owned()) saveProgress(getDraft());});
$('lab-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const c=current;
  if(busy||!owned(c)||c.progress.stage!==3) return;
  const p={...getDraft(),stage:4};
  if(!validProgress(c.lab,p,true)) {message('Selecciona una explicación y escribe al menos 30 caracteres para tu reflexión.');return;}
  const signature=JSON.stringify(p);
  if(c.pendingSignature!==signature) {c.pendingKey=push(ref(database,`laboratoryAttempts/${c.uid}/${c.lab.id}`)).key;c.pendingSignature=signature;}
  const key=c.pendingKey;
  disable(true);message('Guardando tu entrega…');
  try {
    const stamp=serverTimestamp();
    await withTimeout(update(ref(database),{
      [`laboratoryProgress/${c.uid}/${c.lab.id}`]:{...p,updatedAt:stamp},
      [`laboratoryAttempts/${c.uid}/${c.lab.id}/${key}`]:{...p,submittedAt:stamp}
    }));
    if(!owned(c)) return;
    c.progress=p;c.pendingKey=null;c.pendingSignature=null;c.history=[{...p,key,submittedAt:Date.now()},...c.history.filter(a=>a.key!==key)].slice(0,10);
    render();message('Intento guardado. Tu reflexión está disponible junto con las mediciones.');focus('lab-result-title');
  } catch(error) {if(owned(c)) message(accessError(error));}
  finally {disable(false);}
});
$('lab-repeat').addEventListener('click',async()=>{
  if(!owned()||busy) return;
  if(current.reviewing&&current.progress.stage!==4) {current.reviewing=null;render();message('Continúa tu borrador.');return;}
  current.reviewing=null;
  if(await saveProgress(initialProgress(),'Nuevo intento. Tus entregas anteriores siguen en el historial.')) focus('lab-title');
});
$('lab-back').addEventListener('click',()=>{
  if(busy) return;
  if(owned()&&current.progress.stage!==4) current.progress=getDraft();
  if(owned()&&current.progress.stage!==4) {
    // Conserva el texto durante esta sesión. El botón Guardar borrador confirma su persistencia.
    sessionDrafts.set(current.lab.id,current);
  }
  current=null;++launchId;simulationOpen=false;dock.hidden=true;
  $('lab-detail').hidden=true;$('lab-catalog').hidden=false;focus('lab-catalog-title');
});
const sessionDrafts=new Map();
$('lab-download').addEventListener('click',()=>{
  if(!owned()) return;
  const {lab}=current,p=current.reviewing||current.progress;
  if(!validProgress(lab,p,true)) return;
  const grade=gradeLaboratory(lab,p);
  const text=[`RISIO · Laboratorio ${lab.title}`,lab.source,'',lab.question,`Predicción: ${predictionLabels[p.prediction]}`,
    `Medición inicial: ${measured(lab,stateFor(lab))}`,`Medición final: ${measured(lab,stateFor(lab,p.experimentValue))}`,
    `Variable: ${lab.parameterName}, ${number(lab.initial)} → ${number(p.experimentValue)} ${lab.unit}`,
    `Explicación elegida: ${lab.options.find(([key])=>key===p.explanationChoice)[1]}`,
    `Resultado formativo: ${grade.percent} % (predicción y explicación elegida)`,'',lab.feedback,'','Mi reflexión (sin calificación automática):',p.reflection].join('\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=node('a');link.href=url;link.download=`RISIO-laboratorio-${lab.id}.txt`;link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('btn-filtration-labs').addEventListener('click',()=>{library();focus(current?'lab-title':'lab-catalog-title');});
for(const lab of laboratories) {
  const card=node('article',undefined,'lab-card'), button=node('button','Abrir laboratorio →','assessment-button');button.type='button';
  button.setAttribute('aria-label','Abrir laboratorio: '+lab.title);
  button.addEventListener('click',()=>{
    const draft=sessionDrafts.get(lab.id);
    if(draft&&draft.uid===auth.currentUser?.uid&&!busy) {current=draft;current.reviewing=null;$('lab-catalog').hidden=true;$('lab-detail').hidden=false;$('lab-title').textContent=lab.title;$('lab-topic').textContent=lab.topic;$('lab-objective').textContent=lab.objective;$('lab-source').textContent=lab.source;render();message('Borrador de esta sesión. Guarda el avance antes de cerrar.');focus('lab-title');}
    else open(lab);
  });
  card.append(node('span',lab.number,'lab-card-number'),node('p',`${lab.topic} · ${lab.minutes} min`,'lab-eyebrow'),node('h3',lab.title),node('p',lab.objective),button);$('lab-cards').append(card);
}
onAuthStateChanged(auth,user=>{if(current&&user?.uid!==current.uid){current=null;++launchId;sessionDrafts.clear();dock.hidden=true;simulationOpen=false;$('lab-detail').hidden=true;$('lab-catalog').hidden=false;}});
