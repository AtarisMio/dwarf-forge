// Original procedural creature voice. Low vocal folds, turbulent breath and
// shifting throat resonances make a growl; there is no sampled game dialogue.
export function createDragonUtterance({sampleRate=22050,duration=2.2,anger=0,seed=19}={}) {
  if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>96000) throw new RangeError('Invalid voice sample rate');
  if(!Number.isFinite(duration)||duration<.2||duration>8) throw new RangeError('Invalid voice duration');
  const mood=Math.max(0,Math.min(3,Number(anger)||0));
  const length=Math.round(sampleRate*duration), data=new Float32Array(length);
  let state=seed>>>0, phase=0, breath=0, low=0, high=0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296*2-1;};
  const lowAlpha=1-Math.exp(-2*Math.PI*950/sampleRate), highAlpha=1-Math.exp(-2*Math.PI*110/sampleRate);
  for(let i=0;i<length;i++) {
    const t=i/sampleRate, u=i/(length-1);
    const syllable=.62+.38*Math.sin(t*2*Math.PI*(2.05+mood*.13)+.8)**2;
    const edge=Math.min(1,t/.12,(duration-t)/.24);
    const envelope=Math.sin(Math.max(0,edge)*Math.PI/2)**2*(.7+.3*Math.sin(Math.PI*u))*syllable;
    const pitch=(59-mood*3.5)*(1+.07*Math.sin(t*2.3)+.035*Math.sin(t*17.3));
    phase+=2*Math.PI*pitch/sampleRate;
    breath=.86*breath+.14*random();
    const vocal=Math.tanh(2.1*(Math.sin(phase)+.42*Math.sin(phase*2+.4)+.21*Math.sin(phase*3)));
    // Subharmonics give the large creature weight. Broad filtered turbulence
    // supplies rasp without the piercing upper harmonics of a raw sawtooth.
    const resonant=.12*Math.sin(phase*4+.7*Math.sin(t*3))+.075*Math.sin(phase*7+.4*Math.sin(t*4));
    const input=.61*vocal+.18*Math.sin(phase*.5)+resonant+breath*(.72+mood*.2);
    low+=lowAlpha*(input-low); high+=highAlpha*(input-high);
    data[i]=Math.max(-.92,Math.min(.92,(low-.28*high)*envelope*.8));
  }
  return data;
}
