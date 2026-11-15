# Third-party notices

This notice applies to the dependencies and adaptations identified below. It does not assign a license to the Stone Skipping project as a whole.

## Three.js (MIT)

Three.js 0.180.x is used through the npm dependency `three`. `src/rendering/water.ts` imports `three/examples/jsm/objects/Water.js` through `three/addons/objects/Water.js`. Its planar reflection camera, clipping plane, render target, projective coordinates, and shader are reused; the application adapts that shader at runtime to add CPU-state vertex displacement, state-derived normals, scene transmission and depth absorption. `GLTFLoader` is also used from Three.js examples. The upstream implementation is not represented as original project work.

Upstream: https://github.com/mrdoob/three.js/tree/r180

The installed Water.js documentation identifies these references: Slayvin's flat mirror (https://github.com/Slayvin), Lee Stemkoski's water shader based on that mirror (https://home.adelphi.edu/~stemkoski/), and Jonas Wagner's WebGL water shader explanations (http://29a.ch/slides/2012/webglwater/). No Evan Wallace or MLS-MPM source is copied into this project.

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
