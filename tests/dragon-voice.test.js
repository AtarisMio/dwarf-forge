import test from 'node:test';
import assert from 'node:assert/strict';
import {createDragonUtterance} from '../src/dragon-voice.js';
import {ForgeAudio} from '../src/audio.js';

test('dragon voice is bounded, finite, repeatable PCM with quiet boundaries', () => {
  const options = {sampleRate:22050,duration:1.4,seed:42,anger:0};
  const a = createDragonUtterance(options), b = createDragonUtterance(options);
  assert.deepEqual(a,b);
  assert.equal(a.length,Math.round(22050*1.4));
  assert.ok(a.every(n=>Number.isFinite(n)&&Math.abs(n)<=.92));
  assert.equal(a[0],0); assert.ok(Math.abs(a.at(-1))<.001);
  const rms = Math.sqrt(a.reduce((n,v)=>n+v*v,0)/a.length);
  assert.ok(rms>.08&&rms<.5,`audible without clipping: ${rms}`);
});

test('dragon moods and seeds produce different growls and validate sample bounds', () => {
  assert.notDeepEqual(createDragonUtterance({seed:1,anger:0}),createDragonUtterance({seed:1,anger:3}));
  assert.notDeepEqual(createDragonUtterance({seed:1}),createDragonUtterance({seed:2}));
  assert.throws(()=>createDragonUtterance({sampleRate:0}),RangeError);
  assert.throws(()=>createDragonUtterance({duration:Infinity}),RangeError);
});

function fakeAudioContext() {
  const sources = [];
  const context = {currentTime:4, createBuffer(channels,length,rate){
    const data = new Float32Array(length);
    return {sampleRate:rate,duration:length/rate,copyToChannel(src){data.set(src);}};
  },createGain(){return {gain:{value:0,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};},createBufferSource(){
    const source = {buffer:null,connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};
    sources.push(source); return source;
  }};
  return {context,sources};
}

test('new dialogue replaces previous voice; mute stops it; absent audio is safe', () => {
  const audio = new ForgeAudio();
  assert.equal(audio.dragonSpeak({text:'test'}),false);
  const {context,sources} = fakeAudioContext(); audio.context=context; audio.master=context.createGain();
  assert.equal(audio.dragonSpeak({text:'炉火'}),true);
  assert.ok(sources[0].started);
  audio.dragonSpeak({text:'铁砧',anger:2}); assert.ok(sources[0].stopped);
  audio.stopDragon(); assert.ok(sources[1].stopped);
  audio.dragonSpeak({text:'贡税'}); audio.setEnabled(false);
  assert.ok(sources[2].stopped); assert.equal(audio.dragonSpeak({text:'静音'}),false);
});
