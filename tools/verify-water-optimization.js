(async()=>{
 const review=waterReview,renderer=review.world.renderer;
 review.session.paused=true;
 const water=await import('/src/rendering/coherent.ts');
 const {Session}=await import('/src/app/session.ts');
 const snapshot=await (await fetch('/deliverables/contact-resolution/snapshot.json')).json();
 const session=new Session();session.replay(snapshot);session.advance(4);
 const results=[];let reference;
 for(const batched of [false,true]){
  const solver=new water.CoherentWater();solver.clear(renderer);
  for(let index=0;index<session.waterTicks.length;index++){
   solver.step(renderer,session.waterTicks[index],!batched);
   if(index%4===3){if(batched)solver.updateNormals(renderer);await new Promise(requestAnimationFrame);}
  }
  solver.updateNormals(renderer);
  const state=solver.read(renderer);let maxDifference=0,finite=true;
  for(let index=0;index<state.length;index++){finite&&=Number.isFinite(state[index]);if(reference)maxDifference=Math.max(maxDifference,Math.abs(state[index]-reference[index]));}
  if(!finite||maxDifference!==0)throw new Error('Batched GPU state differs');
  results.push({batched,finite,maxRgbaDifference:maxDifference,ticks:session.waterTicks.length});
  if(!reference)reference=state;
  solver.dispose();
 }
 const solver=new water.CoherentWater();solver.clear(renderer);
 const footprint={x:3.217,z:-.031,y:0,radius:.04,depth:.0045,aspect:.75,angle:.73};
 solver.step(renderer,{old:{...footprint,y:.02},next:footprint});
 const state=solver.read(renderer);let volume=0,minimum=0,maximum=0;
 for(let index=0;index<state.length;index+=4){volume+=state[index]*solver.grid.dx*solver.grid.dz;minimum=Math.min(minimum,state[index]);maximum=Math.max(maximum,state[index]);}
 solver.dispose();
 if(Math.abs(volume)>1e-7||minimum>=0||maximum<=0)throw new Error('GPU displacement redistribution failed');
 const glError=renderer.getContext().getError();if(glError||review.errors.length)throw new Error('WebGL error');
 return {batching:results,displacement:{volume,minimum,maximum,tolerance:1e-7},glError,errors:review.errors};
})()
