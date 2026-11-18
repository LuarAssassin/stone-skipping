import * as THREE from 'three';
import { MAX_SPRAY, MAX_RIBBONS, sprayPosition, ribbonPoint, lipDetach, type ContactSpray } from '../simulation/spray';
import type { WaterGrid } from '../simulation/water-grid';

export function createSpray(surfaceHeight: THREE.IUniform, grid: WaterGrid) {
    const dropMaterial=new THREE.MeshPhysicalMaterial({color:0xf1fbff,roughness:.07,transmission:.94,thickness:.002,ior:1.333});
    const drops=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),dropMaterial,MAX_SPRAY);
    drops.frustumCulled=false;
    drops.count=0;
    const transform=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),velocity=new THREE.Vector3();

    const columns=24,stride=columns+1,capacity=MAX_RIBBONS*stride;
    const positions=new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
    const normals=new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
    const optics=new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
    const indices=new THREE.BufferAttribute(new Uint16Array(MAX_RIBBONS*columns*6),1).setUsage(THREE.DynamicDrawUsage);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',positions);
    geometry.setAttribute('normal',normals);
    geometry.setAttribute('sheetOptics',optics);
    geometry.setIndex(indices);
    geometry.setDrawRange(0,0);
    const material=new THREE.MeshPhysicalMaterial({
        color:0xecf8f7,roughness:.085,transmission:.94,thickness:.003,ior:1.333,
        side:THREE.DoubleSide,transparent:true,opacity:.91,depthWrite:false
    });
    material.onBeforeCompile=shader=>{
        shader.uniforms.surfaceHeight=surfaceHeight;
        shader.uniforms.domain={value:new THREE.Vector2(grid.sizeX,grid.sizeZ)};
        shader.vertexShader='attribute vec3 sheetOptics; varying vec2 lip; uniform sampler2D surfaceHeight; uniform vec2 domain;\n'+shader.vertexShader
            .replace('#include <begin_vertex>',`#include <begin_vertex>
                vec2 uvWater=vec2(position.x/domain.x,position.z/domain.y+.5);
                transformed.y+=sheetOptics.z*texture2D(surfaceHeight,uvWater).r;
                lip=sheetOptics.xy;`);
        shader.fragmentShader='varying vec2 lip;\n'+shader.fragmentShader
            .replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.a*=lip.x;')
            .replace('#include <transmission_fragment>',THREE.ShaderChunk.transmission_fragment.replace(
                'material.thickness = thickness;','material.thickness = thickness * mix(.12,1.9,lip.y);'));
    };
    const sheets=new THREE.Mesh(geometry,material),mesh=new THREE.Group();
    sheets.frustumCulled=false;
    mesh.add(drops,sheets);
    const across=new THREE.Vector3(),along=new THREE.Vector3(),edge=new THREE.Vector3();
    return {mesh,drops,sheets,update(spray:ContactSpray,time:number) {
        let count=0;
        for(const drop of spray.drops) {
            const age=time-drop.birth,free=age-(drop.detach??0);
            // Surface tension draws a short neck before separation. The bead
            // rounds out on its own capillary time while following its old path.
            const neckTime=Math.min(.012,.8*Math.sqrt(1000*drop.radius**3/.072));
            if(free < -neckTime||time>=drop.landing)continue;
            const p=sprayPosition(drop,time);
            if(p[1]<=0)continue;
            const emerging=Math.min(1,1+free/neckTime);
            const stretch=1+2.1*emerging*Math.exp(-Math.max(0,free)/(.008+neckTime));
            const radius=drop.radius*emerging;
            const transverse=radius/Math.sqrt(stretch);
            velocity.set(...drop.velocity);velocity.y-=9.81*age;
            transform.position.set(...p);
            transform.quaternion.setFromUnitVectors(up,velocity.normalize());
            transform.scale.set(transverse,radius*stretch,transverse);
            transform.updateMatrix();drops.setMatrixAt(count++,transform.matrix);
        }
        drops.count=count;
        drops.instanceMatrix.needsUpdate=true;

        const rows=spray.ribbons;
        let indexCount=0;
        for(let row=0;row<rows.length;row++) {
            const r=rows[row],age=time-r.birth;
            for(let col=0;col<stride;col++) {
                const u=2*col/columns-1,i=row*stride+col;
                const p=ribbonPoint(r,time,u),remaining=lipDetach(r,u)-age;
                const opacity=THREE.MathUtils.clamp(.5+remaining/.005,0,1);
                positions.setXYZ(i,...p);
                optics.setXYZ(i,opacity,Math.abs(u)**2,Math.max(0,1-age/.007)**2);
            }
        }
        for(let row=0;row<rows.length;row++) {
            const r=rows[row];
            const hasPrev=row>0&&rows[row-1].contact===r.contact&&r.birth-rows[row-1].birth<=.003;
            const hasNext=row+1<rows.length&&rows[row+1].contact===r.contact&&rows[row+1].birth-r.birth<=.003;
            for(let col=0;col<stride;col++) {
                const i=row*stride+col;
                across.fromBufferAttribute(positions,col<columns?i+1:i).sub(edge.fromBufferAttribute(positions,col>0?i-1:i));
                along.fromBufferAttribute(positions,hasNext?i+stride:i).sub(edge.fromBufferAttribute(positions,hasPrev?i-stride:i));
                across.cross(along).normalize();
                normals.setXYZ(i,across.x,across.y,across.z);
                if(!hasNext||col===columns)continue;
                const k=i+stride;
                if(optics.getX(i)+optics.getX(i+1)+optics.getX(k)+optics.getX(k+1)===0)continue;
                indices.array.set([i,i+1,k,i+1,k+1,k],indexCount);
                indexCount+=6;
            }
        }
        geometry.setDrawRange(0,indexCount);
        if(indexCount) {
            for(const buffer of [positions,normals,optics]) {
                buffer.clearUpdateRanges();buffer.addUpdateRange(0,rows.length*stride*3);buffer.needsUpdate=true;
            }
            indices.clearUpdateRanges();indices.addUpdateRange(0,indexCount);indices.needsUpdate=true;
        }
        return count;
    }};
}
