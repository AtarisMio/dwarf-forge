import test from 'node:test';
import assert from 'node:assert/strict';
import {getSwordForm,SWORD_ROUTES,SWORD_FORM_LEVELS} from '../src/sword-evolution.js';
const normal=SWORD_ROUTES.flatMap(route=>route.families);
test('all ordinary blades share three early forms without leaking their future family',()=>{
  for(let level=0;level<6;level++){
    const expected=getSwordForm({typeKey:normal[0],level});
    for(const typeKey of normal){const form=getSwordForm({typeKey,level});assert.equal(form.key,expected.key);assert.equal(form.name,expected.name);assert.equal(form.family,'basic');assert.equal(form.level,Math.floor(level/2)*2);}
  }
});
test('three lanes branch visually at6, change at8 and reveal their fixed family at10',()=>{
  for(const route of SWORD_ROUTES)for(const typeKey of route.families){
    const six=getSwordForm({typeKey,level:6}),eight=getSwordForm({typeKey,level:8}),ten=getSwordForm({typeKey,level:10});
    assert.equal(six.family,route.id);assert.equal(eight.family,route.id);assert.notEqual(six.key,eight.key);assert.equal(ten.family,typeKey);assert.equal(ten.route,route.id);
  }
});
test('every two levels form a stage and peak appearance overrides current damage level',()=>{
  assert.deepEqual(SWORD_FORM_LEVELS,[0,2,4,6,8,10,12,14,16,18,20]);
  for(let level=0;level<=99;level++){const form=getSwordForm({typeKey:'holy',level});assert.equal(form.stage,Math.floor(Math.min(level,20)/2));assert.equal(form.level,form.stage*2);assert.equal(form.key,`${form.family}/${form.stage}`);}
  assert.deepEqual(getSwordForm({typeKey:'holy',level:3,appearanceLevel:18}),getSwordForm({typeKey:'holy',level:18}));
});
test('merchant lines keep distinct families from the first stage and evolve through20',()=>{
  for(const typeKey of ['worldtree','fishblade','funerary']){const names=new Set();for(const level of SWORD_FORM_LEVELS){const form=getSwordForm({typeKey,level});assert.equal(form.family,typeKey);assert.equal(form.route,typeKey);names.add(form.name);}assert.equal(names.size,11);}
});
