import {createDragonUtterance} from './dragon-voice.ts';
import type {StrikeOutcome} from './game-types.ts';

declare global {
 interface Window { webkitAudioContext?: typeof AudioContext; }
}

// The audio engine only depends on this part of Web Audio; native nodes and
// lightweight test implementations both satisfy the same typed contract.
export interface ForgeAudioNode {
 connect(destination: ForgeAudioNode): void;
 disconnect(): void;
}
export interface ForgeAudioParam {
 value: number;
 cancelScheduledValues(time: number): void;
 setValueAtTime(value: number, time: number): void;
 linearRampToValueAtTime(value: number, time: number): void;
 exponentialRampToValueAtTime(value: number, time: number): void;
 setTargetAtTime(value: number, time: number, constant: number): void;
}
export interface ForgeAudioGain extends ForgeAudioNode { gain: ForgeAudioParam; }
export type ForgeAudioBuffer = Pick<AudioBuffer, 'sampleRate' | 'duration' | 'copyToChannel' | 'getChannelData'>;
export interface ForgeAudioBufferSource extends ForgeAudioNode {
 buffer: ForgeAudioBuffer | null;
 loop: boolean;
 onended: AudioScheduledSourceNode['onended'];
 start(when?: number): void;
 stop(when?: number): void;
}
interface ForgeAudioFilter extends ForgeAudioNode {
 type: BiquadFilterType;
 frequency: Pick<AudioParam, 'value'>;
}
interface ForgeAudioOscillator extends ForgeAudioNode {
 type: OscillatorType;
 frequency: Pick<AudioParam, 'value'>;
 start(when?: number): void;
 stop(when?: number): void;
}
export interface ForgeAudioContext {
 readonly currentTime: number;
 readonly sampleRate: number;
 readonly destination: ForgeAudioNode;
 resume(): Promise<void>;
 createBuffer(channels: number, length: number, sampleRate: number): ForgeAudioBuffer;
 createGain(): ForgeAudioGain;
 createBufferSource(): ForgeAudioBufferSource;
 createBiquadFilter(): ForgeAudioFilter;
 createOscillator(): ForgeAudioOscillator;
}
export interface DragonSpeechOptions { text?: string; anger?: number; duration?: number; }
interface DragonVoice { source: ForgeAudioBufferSource; gain: ForgeAudioGain; }

export class ForgeAudio {
 enabled: boolean;
 context: ForgeAudioContext | null;
 master: ForgeAudioGain | null;
 dragonVoice: DragonVoice | null;
 voiceSeed: number;
 constructor(){this.enabled=true;this.context=null;this.master=null;this.dragonVoice=null;this.voiceSeed=17;}
 start(){
  if(this.context){this.context.resume().catch(()=>{});return;}
  try{
   const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
   const c: ForgeAudioContext=this.context=new C();this.master=c.createGain();this.master.gain.value=this.enabled?.3:0;this.master.connect(c.destination);
   const buffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate);const data=buffer.getChannelData(0);let last=0;
   for(let i=0;i<data.length;i++){last=(last+(Math.random()*2-1)*.04)/1.02;data[i]=last*2;}
   const noise=c.createBufferSource();noise.buffer=buffer;noise.loop=true;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=450;const volume=c.createGain();volume.gain.value=.22;noise.connect(filter);filter.connect(volume);volume.connect(this.master);noise.start();
  }catch{/* Sound is optional on browsers without Web Audio. */}
 }
 setEnabled(v: boolean){this.enabled=v;if(!v)this.stopDragon();if(this.master&&this.context)this.master.gain.setTargetAtTime(v?.3:0,this.context.currentTime,.04);}
 dragonSpeak({text='',anger=0,duration}: DragonSpeechOptions = {}){
  if(!this.context||!this.master||!this.enabled)return false;
  this.stopDragon();
  const c=this.context, seconds=duration??Math.min(3.8,1.3+[...text].length*.032);
  const samples=createDragonUtterance({duration:seconds,anger,seed:++this.voiceSeed});
  const buffer=c.createBuffer(1,samples.length,22050);buffer.copyToChannel(samples,0);
  const source=c.createBufferSource(),gain=c.createGain();source.buffer=buffer;gain.gain.value=.9;
  source.connect(gain);gain.connect(this.master);const voice={source,gain};this.dragonVoice=voice;
  source.onended=()=>{source.disconnect();gain.disconnect();if(this.dragonVoice===voice)this.dragonVoice=null;};
  source.start();return true;
 }
 stopDragon(){
  const voice=this.dragonVoice;if(!voice||!this.context)return;this.dragonVoice=null;
  const t=this.context.currentTime;
  voice.gain.gain.cancelScheduledValues(t);voice.gain.gain.setValueAtTime(voice.gain.gain.value,t);
  voice.gain.gain.linearRampToValueAtTime(0,t+.04);
  try{voice.source.stop(t+.045);}catch{/* The utterance may already have ended. */}
 }
 tone(frequency: number,duration: number,volume=.2,type: OscillatorType='sine',delay=0){
  if(!this.context||!this.master||!this.enabled)return;
  const c=this.context,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=frequency;g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration);
 }
 hammer(outcome: StrikeOutcome){this.tone(130,.09,.5,'triangle');[850,1273,2180,3420].forEach((f,i)=>this.tone(f,.4-i*.06,.13,'sine',.025));if(outcome==='great'){this.tone(660,.3,.15,'sine',.16);this.tone(990,.4,.15,'sine',.25);}if(outcome==='break'){[120,180,250,1900,3600].forEach(f=>this.tone(f,.25,.2,'sawtooth',.05));}}
 bell(){[392,588,784,1176].forEach((f,i)=>this.tone(f,1.8,.24/(i+1),'sine'));}
 reward(){[392,494,587,784].forEach((f,i)=>this.tone(f,.4,.16,'sine',i*.1));}
 danger(){this.tone(58,1.3,.5,'sawtooth');this.tone(62,1.5,.3,'triangle');}
}
