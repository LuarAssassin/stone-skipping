# Third-party notices

This notice applies to the dependencies and adaptations identified below. It does not assign a license to the Stone Skipping project as a whole.

## Evan Wallace — WebGL Water (MIT)

Copyright 2011 Evan Wallace. Upstream source headers explicitly release WebGL Water under MIT. Retained `public/third-party/evanw-water/water.js` and `renderer.js` are reference source, not separately loaded scripts. Source revision: `73eda8be832b649367b25ea5690c1f0181bb56ad`.

- https://github.com/evanw/webgl-water/blob/73eda8be832b649367b25ea5690c1f0181bb56ad/water.js
- https://github.com/evanw/webgl-water/blob/73eda8be832b649367b25ea5690c1f0181bb56ad/renderer.js
- https://madebyevan.com/webgl-water/
- Full MIT text retained at `public/third-party/evanw-water/LICENSE`, fetched from Evan's https://github.com/evanw/lightgl.js/blob/master/LICENSE (the water repository has MIT headers but no standalone LICENSE).

Adaptations in `src/rendering/coherent.ts`: `updateShader` four-neighbour height/velocity propagation and .995 damping; `normalShader` gradient normals; `moveSphereShader` old-volume return/new-volume removal with an oriented elliptical, finite-depth source replacing the sphere. `renderer.js` caustics vertex refraction and fragment derivative-area focusing are adapted in the caustic material. Pool dimensions, light, source kernel, framebuffer plumbing and Three integration differ. `src/rendering/water.ts` combines these state textures with Three Water reflection, custom screen-space transmission and absorption; this is not Evan's full raytraced pool renderer.

No upstream tile or cubemap photographs are used. The calibration bed is generated locally in `world.ts` with deterministic arithmetic/noise, and the sky is a local procedural gradient/sun shader. The stone asset is the project's existing Blender asset. No license is assigned to the whole project here.

## Three.js (MIT)

Three.js 0.180.x is used through the npm dependency `three`. `src/rendering/water.ts` imports `three/examples/jsm/objects/Water.js` through `three/addons/objects/Water.js`. Its planar reflection camera, clipping plane, render target, projective coordinates, and shader are reused; the application adapts that shader at runtime to add CPU-state vertex displacement, state-derived normals, scene transmission and depth absorption. `GLTFLoader` is also used from Three.js examples. The upstream implementation is not represented as original project work.

Upstream: https://github.com/mrdoob/three.js/tree/r180

The installed Water.js documentation identifies these references: Slayvin's flat mirror (https://github.com/Slayvin), Lee Stemkoski's water shader based on that mirror (https://home.adelphi.edu/~stemkoski/), and Jonas Wagner's WebGL water shader explanations (http://29a.ch/slides/2012/webglwater/). No MLS-MPM source is copied into this project. Evan Wallace shader algorithms are adapted as detailed below.

The MIT License

Copyright © 2010-2025 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
