import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {laboratories} from '../renal-laboratories.js';
for(const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy']) delete process.env[key];
const env=await initializeTestEnvironment({projectId:'demo-risio',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync(new URL('../../database.rules.json',import.meta.url),'utf8')}});
const user=(uid,verified=true)=>env.authenticatedContext(uid,{email_verified:verified}).database();
try {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async context=>{
    for(const uid of ['alice','bob','teacher','external']) await context.database().ref('profiles/'+uid).set({university:uid==='external'?'OTHER':'UPB',requestedRole:uid==='teacher'?'teacher':'student'});
  });
  const alice=user('alice'),bob=user('bob');
  for(const lab of laboratories) {
    const base=`laboratoryProgress/alice/${lab.id}`,attempt=`laboratoryAttempts/alice/${lab.id}`;
    const draft={stage:1,prediction:'',experimentValue:-1,explanationChoice:'',reflection:'',updatedAt:{'.sv':'timestamp'}};
    await assertSucceeds(alice.ref(base).set(draft));
    await assertFails(bob.ref(base).get()); await assertFails(bob.ref(base).set(draft));
    await assertFails(user('teacher').ref(base).get());
    await assertFails(user('alice',false).ref(base).get());
    await assertFails(env.unauthenticatedContext().database().ref(base).get());
    await assertFails(alice.ref(base).set({...draft,stage:3,prediction:'same'}));
    await assertFails(alice.ref(base).set({...draft,unknown:1}));
    await assertFails(alice.ref(base).set({...draft,reflection:'x'.repeat(2001)}));
    const final={stage:4,prediction:lab.correctPrediction,experimentValue:lab.target,explanationChoice:lab.correctExplanation,reflection:'La explicación compara los datos iniciales y finales del experimento.'};
    const key='-1234567890123456789';
    await assertSucceeds(alice.ref().update({[base]:{...final,updatedAt:{'.sv':'timestamp'}},[`${attempt}/${key}`]:{...final,submittedAt:{'.sv':'timestamp'}}}));
    await assertSucceeds(alice.ref(attempt).limitToLast(10).get());
    await assertFails(alice.ref(attempt).get());await assertFails(alice.ref(attempt).limitToLast(11).get());
    await assertFails(bob.ref(attempt).limitToLast(10).get());
    await assertSucceeds(alice.ref(attempt+'/'+key).set({...final,submittedAt:{'.sv':'timestamp'}}));
    await assertFails(alice.ref(attempt+'/'+key).set({...final,prediction:'same',submittedAt:{'.sv':'timestamp'}}));
    await assertFails(alice.ref(attempt+'/'+key).remove());
    await assertFails(alice.ref(attempt+'/-9876543210987654321').set({...final,stage:3,submittedAt:{'.sv':'timestamp'}}));
    const restored=(await alice.ref(base).get()).val();assert.equal(restored.reflection,final.reflection);
    await assertSucceeds(alice.ref(base).set(draft));
    assert.equal((await alice.ref(attempt).limitToLast(10).get()).numChildren(),1);
  }
  await assertFails(user('external').ref('laboratoryProgress/external/bowman-v1').set({stage:1}));
  await assertFails(alice.ref('laboratoryProgress/alice/invented-v1').set({stage:1}));
  console.log('OK: reglas, privacidad entre cuentas, borrador recuperado, entrega atómica, historial conservado, reintento idempotente y datos inválidos rechazados.');
} finally {await env.cleanup();}
