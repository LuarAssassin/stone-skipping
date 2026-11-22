(async()=>{
 const r=waterReview,renderer=r.world.renderer,gl=renderer.getContext();r.session.paused=true;
 const W=await import('/src/rendering/coherent.ts');
 const snapshot=await (await fetch('/deliverables/contact-resolution/snapshot.json')).json();
 const {Session}=await import('/src/app/session.ts');
 const quiet={old:W.dryFootprint(),next:W.dryFootprint()};
 const rows=[];
 for(const width of [512,1024,2048]){
  const grid=W.waterGrid(width,width/2),s=new W.CoherentWater(grid);s.clear(renderer);
  const impulse={x:4.013,z:.017,impulseY:-.02,wetArea:.001};
  s.step(renderer,{...quiet,momentum:impulse});
  let d=s.read(renderer),momentum=0,finite=true;
  for(let i=0;i<d.length;i+=4){momentum+=d[i+1]/grid.dt*1000*.04*grid.dx*grid.dz;if(!Number.isFinite(d[i])||!Number.isFinite(d[i+1]))finite=false;}
  let expected=0;for(let i=0;i<grid.substeps;i++)expected+=impulse.impulseY/grid.substeps*grid.damping**(grid.substeps-i);
  for(let k=1;k<24;k++){s.step(renderer,quiet);if(k%4===0)await new Promise(requestAnimationFrame);}
  d=s.read(renderer);let peak=0,integral=0;const bins=new Float64Array(150),counts=new Uint32Array(150);
  for(let row=0;row<grid.height;row++)for(let col=0;col<grid.width;col++){
   const h=d[(row*grid.width+col)*4];finite&&=Number.isFinite(h);peak=Math.max(peak,Math.abs(h));integral+=h*grid.dx*grid.dz;
   const radius=Math.hypot((col+.5)*grid.dx-impulse.x,(row+.5)*grid.dz-4-impulse.z),bin=Math.floor(radius/.01);
   if(bin>=10&&bin<bins.length){bins[bin]+=h*h;counts[bin]++;}
  }
  let front=10;for(let i=11;i<bins.length;i++)if(counts[i]&&bins[i]/counts[i]>bins[front]/Math.max(1,counts[front]))front=i;
  rows.push({width,grid,source:W.momentumSource(impulse,grid,grid.dt,true),injected:impulse.impulseY,expectedDampedImpulse:expected,measuredImpulse:momentum,impulseError:Math.abs(momentum-expected),finite,peakAfterPoint2s:peak,meanVolume:integral,ringEnergyPeakRadius:(front+.5)*.01,estimatedFrontSpeed:(front+.5)*.01/.2});
  s.dispose();await new Promise(requestAnimationFrame);
 }
 let reference,referenceCommands;const replays=[];
 for(const mode of ['normal','slow','bullet']){
  const session=new Session();session.replay(snapshot);session.mode=mode;let n=0;
  const rate={normal:1,slow:.25,bullet:.05}[mode];
  while(session.visualTime<4-1e-9)session.tick(Math.min([.003,.031,.007][n++%3],(4-session.visualTime)/rate));
  const commands=JSON.stringify(session.waterTicks),solver=new W.CoherentWater(W.FINE_GRID);solver.clear(renderer);
  for(let i=0;i<session.waterTicks.length;i++){solver.step(renderer,session.waterTicks[i]);if(i%3===0)await new Promise(requestAnimationFrame);}
  const state=solver.read(renderer);let maxDifference=0;
  if(reference){for(let i=0;i<state.length;i++)maxDifference=Math.max(maxDifference,Math.abs(state[i]-reference[i]));}else{reference=state;referenceCommands=commands;}
  replays.push({mode,time:session.visualTime,ticks:session.waterTicks.length,commandsIdentical:commands===referenceCommands,maxRgbaDifference:maxDifference});solver.dispose();await new Promise(requestAnimationFrame);
 }
 const alignment={grid:r.world.waterField.solver.grid,cellCentres:true,samplerUsesDirectUv:r.world.waterField.mesh.material.vertexShader.includes('texture2D(heightState,coord)'),surfaceVertexCount:r.world.waterField.mesh.geometry.getAttribute('position').count};
 return {resolutions:rows,frontRadiusDifferenceFineToMid:Math.abs(rows[2].ringEnergyPeakRadius-rows[1].ringEnergyPeakRadius),replays,alignment,programs:r.programs(),glError:gl.getError(),errors:r.errors,limitations:'Linear heightfield, not airborne fluid. Global fine grid; no adaptive-patch claim. Front is peak annular height-squared density, not leading support. Mean-volume approximation remains.'};
})()
