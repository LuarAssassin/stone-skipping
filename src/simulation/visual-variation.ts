export interface VisualSettings { seed:number; surface:number; sheet:number; breakup:number }
export const VISUAL_DEFAULTS=Object.freeze({surface:.35,sheet:.8,breakup:1.1});
export function validateVisual(value:VisualSettings):VisualSettings {
 if(!value||!Number.isInteger(value.seed)||value.seed<0||value.seed>0xffffffff)throw new RangeError('Visual seed must be uint32');
 for(const channel of ['surface','sheet','breakup'] as const)if(!Number.isFinite(value[channel])||value[channel]<0||value[channel]>2)throw new RangeError('Visual temperature must be 0..2');
 return {seed:value.seed,surface:value.surface,sheet:value.sheet,breakup:value.breakup};
}
export function visualHash(seed:number,contact:number,channel:number,index=0){
 let value=(seed^Math.imul(contact+1,0x9e3779b9)^Math.imul(channel+1,0x85ebca6b)^Math.imul(index+1,0xc2b2ae35))>>>0;
 value=Math.imul(value^(value>>>16),0x21f0aaad);value=Math.imul(value^(value>>>15),0x735a2d97);
 return ((value^(value>>>15))>>>0)/4294967296;
}
export function correlated(seed:number,channel:number,position:number){
 const cell=Math.floor(position),fraction=position-cell,weight=fraction*fraction*(3-2*fraction);
 return (visualHash(seed,0,channel,cell)*(1-weight)+visualHash(seed,0,channel,cell+1)*weight)*2-1;
}
