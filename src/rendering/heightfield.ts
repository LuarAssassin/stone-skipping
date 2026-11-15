export interface WaterSource { readonly time:number; readonly x:number; readonly z:number; readonly radius:number; readonly strength:number; readonly angle?:number; readonly aspect?:number; readonly contactId?:number; readonly kind?:'contact'|'exit'|'drop' }
export const WATER_GRID=Object.freeze({width:512,depth:256,sizeX:16,sizeZ:8});
export class HeightField {
 readonly width=WATER_GRID.width; readonly depth=WATER_GRID.depth; readonly sizeX=WATER_GRID.sizeX; readonly sizeZ=WATER_GRID.sizeZ;
 readonly height=new Float32Array(this.width*this.depth);
 readonly velocity=new Float32Array(this.height.length);
 private next=new Float32Array(this.height.length);
 private moment=new Float64Array(this.height.length);
 displayHeight(index:number,time:number){return this.height[index]+this.velocity[index]*Math.max(0,time-this.time)-this.moment[index];}
 private decay=new Float32Array(this.height.length);
 constructor(){for(let row=0;row<this.depth;row++)for(let col=0;col<this.width;col++){
  const edge=Math.min(row,col,this.width-1-col,this.depth-1-row),damping=.65+16*(1-Math.min(1,edge/(this.width*14/256)))**2;
  this.decay[row*this.width+col]=Math.exp(-damping*this.dt);
 }}
 time=0;
 readonly dt=1/120;
 disturb(source:WaterSource){
  const spacing=this.sizeX/(this.width-1),radius=Math.max(spacing*1.3,source.radius);
  const extent=radius*3*(source.aspect??1);
  const cx=source.x/spacing,cz=(source.z+this.sizeZ/2)/(this.sizeZ/(this.depth-1));
  for(let row=Math.max(1,Math.floor(cz-extent/spacing));row<Math.min(this.depth-1,cz+extent/spacing);row++)for(let col=Math.max(1,Math.floor(cx-extent/spacing));col<Math.min(this.width-1,cx+extent/spacing);col++){
   const deltaX=(col-cx)*spacing,deltaZ=(row-cz)*(this.sizeZ/(this.depth-1)),angle=source.angle??0,aspect=source.aspect??1;
   const along=(deltaX*Math.cos(angle)+deltaZ*Math.sin(angle))/aspect,across=-deltaX*Math.sin(angle)+deltaZ*Math.cos(angle);
   const distance=along*along+across*across;
   const phase=distance/(radius*radius);
   const index=row*this.width+col,jump=source.strength*(phase*.5-1)*Math.exp(-phase*.5);
   const before=this.velocity[index];this.velocity[index]+=jump;
   const applied=this.velocity[index]-before;
   this.moment[index]+=applied*Math.max(0,source.time-this.time);
   if(source.time<this.time)this.height[index]+=applied*(this.time-source.time);
  }
 }
 step(){
  const dx=this.sizeX/(this.width-1),dz=this.sizeZ/(this.depth-1),speed=.85,invX=1/(dx*dx),invZ=1/(dz*dz);
  for(let row=1;row<this.depth-1;row++)for(let col=1;col<this.width-1;col++){
   const index=row*this.width+col,center=this.height[index];
   const lap=(this.height[index-1]+this.height[index+1]-2*center)*invX+(this.height[index-this.width]+this.height[index+this.width]-2*center)*invZ;
   this.velocity[index]=(this.velocity[index]+speed*speed*lap*this.dt)*this.decay[index];
   this.next[index]=center+this.velocity[index]*this.dt-this.moment[index]*this.decay[index];
   this.moment[index]=0;
  }
  this.height.set(this.next);this.time+=this.dt;
 }
 advance(time:number){while(this.time+this.dt<=time+1e-10)this.step();}
 clear(){this.height.fill(0);this.velocity.fill(0);this.next.fill(0);this.moment.fill(0);this.time=0;}
}
