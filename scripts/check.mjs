import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
let esbuild;
try {
  esbuild = require('esbuild');
} catch {
  esbuild = require('../../tidepool-jelly/node_modules/esbuild');
}
mkdirSync('output', { recursive: true });
const code = `import {createTrack} from './src/track.js';import {Race} from './src/race.js';
const track=createTrack(); const race=new Race(track);race.start();
let sim=0;const events=[];while(sim<220&&race.state!=='results'){const input=race.aiInput(race.cars[0]);race.step(1/120,input);sim+=1/120;events.push(...race.drainEvents());}
const full={length:track.length,state:race.state,sim,elapsed:race.elapsed,finished:race.finishOrder,cars:race.cars.map(c=>({id:c.id,lap:c.lap,gate:c.gate,progress:c.progress,time:c.finishTime,offset:c.offset,speed:c.speed})),events:events.filter(e=>['lap','finish','boost','rescue'].includes(e.type))};
if(race.state!=='results')throw new Error('Full AI driven race did not complete: '+JSON.stringify(full));
if(race.cars[0].lapTimes.length!==3||race.cars[0].gate!==37)throw new Error('Lap gate sequence broken');
for(let i=0;i<3600;i++)race.step(1/120,{});if(race.finishOrder.length!==6||race.cars.some(c=>!c.finished))throw new Error('Opponents did not finish after player results');
race.start();for(let i=0;i<450;i++)race.step(1/120,{});const start=race.cars[0];
const p0=start.progress;for(let i=0;i<600;i++)race.step(1/120,{throttle:1});const forward=start.progress;
if(forward<=p0+10)throw new Error('Throttle did not advance car');
race.pause();const t=race.elapsed,x=start.x;for(let i=0;i<200;i++)race.step(1/60,{throttle:1});if(race.elapsed!==t||start.x!==x)throw new Error('Pause did not freeze simulation');race.resume();
race.rescue();if(race.penalty!==2||start.speed!==0)throw new Error('Rescue broken');
race.start();if(race.elapsed!==0||race.penalty!==0||race.cars.some(c=>c.gate!==1||c.lap!==1||c.finished))throw new Error('Restart retained race state');
const sample=track.sampleDistance(0);start.x=sample.position.x;start.z=sample.position.z;start.yaw=sample.yaw+Math.PI;start.prevFraction=0;start.index=0;start.progress=0;start.gate=1;
race.state='racing';for(let i=0;i<100;i++)race.step(1/120,{throttle:1});if(start.gate!==1)throw new Error('Reverse driving awarded checkpoint');
console.log(JSON.stringify({pass:true,fullRace:full,checks:['full 3 lap six-car simulation','36 sequential checkpoints','acceleration','pause freezes time and physics','reset car penalty','restart clears state','reverse driving cannot award checkpoints']},null,2));`;
await esbuild.build({
  stdin: { contents: code, resolveDir: process.cwd(), sourcefile: 'qa-runner.js' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'output/check-bundle.mjs',
  nodePaths: [path.resolve('../tidepool-jelly/node_modules')],
});
await import(pathToFileURL(path.resolve('output/check-bundle.mjs')).href + '?' + Date.now());
