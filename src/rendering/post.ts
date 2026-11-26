import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const CinematicGradeShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uVignette: { value: 0.34 },
        uShadowTint: { value: new THREE.Vector3(0.95, 0.98, 1.05) },
        uHighlightTint: { value: new THREE.Vector3(1.05, 1.00, 0.94) },
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uVignette;
        uniform vec3 uShadowTint;
        uniform vec3 uHighlightTint;
        varying vec2 vUv;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
            vec4 tex = texture2D(tDiffuse, vUv);
            vec3 col = tex.rgb;

            // Gentle filmic split-toning in linear space driven by active theme
            float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
            col *= mix(uShadowTint, uHighlightTint, smoothstep(0.08, 0.72, luma));

            // Subtle cinema vignette
            vec2 centered = (vUv - 0.5) * vec2(1.18, 1.0);
            float dist2 = dot(centered, centered);
            float vig = 1.0 - smoothstep(0.18, 0.85, dist2) * uVignette;
            col *= vig;

            // Ultra-fine filmic dither to prevent banding across sky gradients
            float grain = (hash(vUv * 913.7 + fract(uTime) * 17.3) - 0.5) * 0.0045;
            col = max(vec3(0.0), col + grain);

            gl_FragColor = vec4(col, tex.a);
        }
    `,
};

export function createPostPipeline(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const renderTarget = new THREE.WebGLRenderTarget(
        Math.max(1, size.x),
        Math.max(1, size.y),
        { type: THREE.HalfFloatType }
    );

    const composer = new EffectComposer(renderer, renderTarget);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(
        Math.max(1, renderer.domElement.clientWidth || innerWidth),
        Math.max(1, renderer.domElement.clientHeight || innerHeight)
    );

    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.max(1, innerWidth), Math.max(1, innerHeight)),
        0.32,  // subtle strength
        0.55,  // soft halation radius
        0.96   // high HDR threshold: only sun disk, golden glitter & bright splash rims bloom
    );
    const gradePass = new ShaderPass(CinematicGradeShader);
    const outputPass = new OutputPass();

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(gradePass);
    composer.addPass(outputPass);

    let bypass = false;

    return {
        composer,
        bloomPass,
        gradePass,
        setBypass(value: boolean) {
            bypass = value;
        },
        setSize(width: number, height: number) {
            const w = Math.max(1, Math.floor(width));
            const h = Math.max(1, Math.floor(height));
            composer.setPixelRatio(renderer.getPixelRatio());
            composer.setSize(w, h);
            bloomPass.resolution.set(w, h);
        },
        render(time = 0) {
            if (bypass) {
                renderer.render(scene, camera);
                return;
            }
            gradePass.uniforms.uTime.value = time;
            composer.render();
        },
        dispose() {
            bloomPass.dispose();
            composer.dispose();
        },
    };
}
