(async()=>{
 const {CoherentWater,dryFootprint,displaced}=await import('/src/rendering/coherent.ts');
 const {Session,PLAYBACK_RATE}=await import('/src/app/session.ts');
 const {DEFAULT}=await import('/src/simulation/physics.ts');
 const review=window.waterReview,renderer=review.world.renderer;
 review.session.paused=true;
 const solver=new CoherentWater();
 const stats=data=>{let max=0,sum=0,finite=true;for(let index=0;index<data.length;index+=4){max=Math.max(max,Math.abs(data[index]));sum+=data[index]**2;finite&&=[0,1,2,3].every(channel=>Number.isFinite(data[index+channel]));}return {max,rms:Math.sqrt(sum/(data.length/4)),finite};};
 const shapeResults=[];
 for(const angle of [0,Math.PI/2]){
  solver.clear(renderer);
  const source={x:4,z:0,y:0,radius:.3,aspect:.35,angle,depth:.06};
  solver.step(renderer,{old:dryFootprint(),next:source});
  const data=solver.read(renderer);let xx=0,zz=0,weight=0,error=0;
  const h=(col,row)=>-displaced(source,(Math.max(0,Math.min(511,col))+.5)/512*16,(Math.max(0,Math.min(255,row))+.5)/256*8-4);
  for(let row=0;row<256;row++)for(let col=0;col<512;col++){
   const value=data[(row*512+col)*4],expected=h(col,row)+.995*2*((h(col-1,row)+h(col+1,row)+h(col,row-1)+h(col,row+1))/4-h(col,row));
   error=Math.max(error,Math.abs(value-expected));const magnitude=Math.abs(value);weight+=magnitude;xx+=magnitude*((col+.5)/512*16-4)**2;zz+=magnitude*((row+.5)/256*8-4)**2;
  }
  shapeResults.push({angle,...stats(data),xx:xx/weight,zz:zz/weight,cpuGpuMaxError:error});
 }
 const momentumResults=[];
 for(const x of [4,4.013]){
  solver.clear(renderer);const momentum={x,z:.007,impulseY:-.02};
  solver.step(renderer,{old:dryFootprint(),next:dryFootprint(),momentum});
  const data=solver.read(renderer);let impulse=0,error=0,volume=0,cells=0;
  const {momentumSource}=await import('/src/rendering/coherent.ts');const source=momentumSource(momentum);
  for(let row=0;row<256;row++)for(let col=0;col<512;col++){
   const index=(row*512+col)*4,radial=(((col+.5)/32-x)**2+((row+.5)/32-4-.007)**2)/source.sigma**2;
   const expected=radial<=9?.995*source.increment*Math.exp(-radial/2):0;
   impulse+=data[index+1]*120*1000*.04/1024;volume+=data[index]/1024;
   error=Math.max(error,Math.abs(data[index+1]-expected));if(data[index+1]!==0)cells++;
  }
  momentumResults.push({x,...stats(data),impulse,expectedImpulse:-.02*.995,volume,cells,cpuGpuVelocityIncrementError:error,sourceEnergy:source.energy});
 }
 const runs=[];let reference;
 for(const [mode,groups] of [['normal',[1/60]],['slow',[.003,.031,.007]],['bullet',[.017,.093,.011]]]){
  const session=new Session(()=>271);session.start(DEFAULT,0);session.mode=mode;solver.clear(renderer);
  let frame=0,ticks=0;const signatures=[];
  while(session.visualTime<4-1e-8){session.tick(Math.min(groups[frame++%groups.length],(4-session.visualTime)/PLAYBACK_RATE[mode]));for(const tick of session.waterTicks){signatures.push(JSON.stringify(tick));solver.step(renderer,tick);ticks++;}session.waterTicks.length=0;}
  const data=solver.read(renderer);let difference=0;
  if(reference)for(let index=0;index<data.length;index++)difference=Math.max(difference,Math.abs(data[index]-reference[index]));else reference=data;
  runs.push({mode,frames:frame,ticks,visualTime:session.visualTime,simTime:session.sim.time,ended:session.sim.ended,skips:session.sim.skips,contacts:session.sim.contacts.map(contact=>({time:contact.time,end:contact.end,point:contact.point.toArray()})),...stats(data),maxGpuDifference:difference,commandsEqual:runs.length===0||JSON.stringify(signatures)===window.__waterSignatures});
  if(runs.length===1)window.__waterSignatures=JSON.stringify(signatures);
 }
 const resourcesBefore={...renderer.info.memory};
 for(let index=0;index<8;index++){solver.clear(renderer);solver.step(renderer,{old:dryFootprint(),next:dryFootprint()});}
 const resourcesAfter={...renderer.info.memory};
 const reset=stats(solver.read(renderer));
 solver.step(renderer,{old:dryFootprint(),next:dryFootprint(),momentum:{x:4,z:0,impulseY:0}});
 const zeroImpulse=stats(solver.read(renderer));solver.dispose();delete window.__waterSignatures;
 const result={momentumResults,shapeResults,runs,reset,zeroImpulse,resourcesBefore,resourcesAfter,programs:review.programs(),shaderErrors:review.errors,glError:renderer.getContext().getError(),timing:'CPU/RAF only; no GPU timer query used'};
 if(zeroImpulse.max!==0||result.shaderErrors.length||result.programs.some(program=>!program.linked))throw Error(JSON.stringify(result));
 if(momentumResults.some(result=>!result.finite||result.cells<20||Math.abs(result.impulse-result.expectedImpulse)>1e-7||result.cpuGpuVelocityIncrementError>1e-7))throw Error(JSON.stringify(momentumResults));
 if(shapeResults.some(result=>result.cpuGpuMaxError>1e-5)||shapeResults[0].xx<shapeResults[0].zz*2||shapeResults[1].zz<shapeResults[1].xx*2||runs.some(run=>run.ticks!==480||!run.commandsEqual||run.maxGpuDifference>1e-7||!run.finite)||result.glError!==0)throw Error(JSON.stringify(result));
 return result;
})()