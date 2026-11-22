import * as THREE from 'three';
import { MAX_SPRAY, MAX_RIBBONS, sprayPosition, ribbonPoint, lipDetach, type ContactSpray } from '../simulation/spray';
import type { WaterGrid } from '../simulation/water-grid';
import { SUN_DIRECTION } from './sunset-env';

export function createSpray(surfaceHeight: THREE.IUniform, grid: WaterGrid) {
    const dropMaterial=new THREE.MeshPhysicalMaterial({
        color:0xfff1e2,emissive:0x5c3018,emissiveIntensity:0.22,
        roughness:.06,transmission:.90,thickness:.0025,ior:1.333
    });
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
        color:0xffefe0,roughness:.075,transmission:.91,thickness:.0035,ior:1.333,
        side:THREE.DoubleSide,transparent:true,opacity:.92,depthWrite:false
    });
    material.onBeforeCompile=shader=>{
        shader.uniforms.surfaceHeight=surfaceHeight;
        shader.uniforms.domain={value:new THREE.Vector2(grid.sizeX,grid.sizeZ)};
        shader.uniforms.uSunDir={value:SUN_DIRECTION.clone()};
        shader.vertexShader='attribute vec3 sheetOptics; varying vec2 lip; varying vec3 vSheetWorldPos; varying vec3 vSheetWorldNormal; uniform sampler2D surfaceHeight; uniform vec2 domain;\n'+shader.vertexShader
            .replace('#include <begin_vertex>',`#include <begin_vertex>
                vec2 uvWater=vec2(position.x/domain.x,position.z/domain.y+.5);
                transformed.y+=sheetOptics.z*texture2D(surfaceHeight,uvWater).r;
                lip=sheetOptics.xy;`)
            .replace('#include <project_vertex>',`#include <project_vertex>
                vSheetWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz;
                vSheetWorldNormal=normalize(mat3(modelMatrix)*objectNormal);`);
        shader.fragmentShader='varying vec2 lip; varying vec3 vSheetWorldPos; varying vec3 vSheetWorldNormal; uniform vec3 uSunDir;\n'+shader.fragmentShader
            .replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.a*=lip.x;')
            .replace('#include <transmission_fragment>',THREE.ShaderChunk.transmission_fragment.replace(
                'material.thickness = thickness;','material.thickness = thickness * mix(.12,1.9,lip.y);'))
            .replace('#include <dithering_fragment>',`
                vec3 vDirSheet=normalize(cameraPosition-vSheetWorldPos);
                float backScatter=pow(max(0.0,dot(-vDirSheet,uSunDir)),2.6);
                float rimEdge=pow(1.0-abs(dot(normalize(vSheetWorldNormal),vDirSheet)),2.0);
                gl_FragColor.rgb+=vec3(1.15,0.68,0.34)*(0.18+0.62*backScatter)*(0.35+0.65*rimEdge)*lip.x;
                #include <dithering_fragment>`);
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
