export class WEBGL2API {
    constructor(engine, canvasId) {
        this.engine = engine;
        this.id = canvasId;

        this.display = document.getElementById(canvasId);
        if (!this.display) {
            throw new Error(`Canvas element with id "${canvasId}" not found in DOM.`);
        }

        this.gl = this.display.getContext("webgl2", { alpha: false, antialias: true, premultipliedAlpha: false });
        if (!this.gl) {
            throw new Error("WebGL2 not supported in this browser.");
        }

        this.autoResize = null;

        this.programColor = null;
        this.programTex = null;

        this.vaoColor = null;
        this.vaoTex = null;

        this.bufColorVertices = null;
        this.bufTexQuad = null;
        this.bufBatch = null;

        this.uniforms = {
            uColor: null,
            uSampler: null,
            uM: null
        };

        this.sprites = new Map();
        this._tmpGLResources = [];
        this._batch = null;

        this._isReady = false;
        this.ready = this.init();
    }

    async init() {
        this.setSize(window.innerWidth, window.innerHeight);
        this._initGLState();
        this._initColorPipeline();
        this._initTexturePipeline();

        this._isReady = true;
        console.log(`WebGL2 Renderer ready on "${this.id}"`);
        return true;
    }

    #ensureReady() {
        if (!this._isReady) {
            throw new Error(`WebGL2 not ready yet! You must "await game.Graphics.ready;" before using it.`);
        }
    }

    _initGLState() {
        const gl = this.gl;
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.viewport(0, 0, this.display.width, this.display.height);
        gl.clearColor(0, 0, 0, 1);
    }

    setAutoResize(toset) {
        if (toset === true) {
            if (!this._resizeHandler) {
                this._resizeHandler = this.resize.bind(this);
                window.addEventListener("resize", this._resizeHandler);
            }
        } else if (toset === false) {
            if (this._resizeHandler) {
                window.removeEventListener("resize", this._resizeHandler);
                this._resizeHandler = null;
            }
        }
    }

    _compile(type, src) {
        const gl = this.gl;
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(sh);
            gl.deleteShader(sh);
            throw new Error(`Shader compile error:\n${log}\n----\n${src}`);
        }
        return sh;
    }

    _link(vs, fs) {
        const gl = this.gl;
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(prog);
            gl.deleteProgram(prog);
            throw new Error(`Program link error:\n${log}`);
        }
        return prog;
    }

    _initColorPipeline() {
        const gl = this.gl;
        const vsSrc = `#version 300 es
        layout(location=0) in vec2 aPosition;
        layout(location=1) in vec2 aUV; // unused, but kept to mirror layout
        void main() {
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }`;
        const fsSrc = `#version 300 es
        precision highp float;
        uniform vec4 uColor;
        out vec4 oColor;
        void main() {
            oColor = uColor;
        }`;

        const vs = this._compile(gl.VERTEX_SHADER, vsSrc);
        const fs = this._compile(gl.FRAGMENT_SHADER, fsSrc);
        this.programColor = this._link(vs, fs);
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        this.uniforms.uColor = gl.getUniformLocation(this.programColor, "uColor");

        this.vaoColor = gl.createVertexArray();
        gl.bindVertexArray(this.vaoColor);

        this.bufColorVertices = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColorVertices);
        gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    _initTexturePipeline() {
        const gl = this.gl;
        const vsSrc = `#version 300 es
        layout(location=0) in vec2 aPosition;  // NDC position
        layout(location=1) in vec2 aUV;
        uniform mat3 uM; // 2D transform (model->NDC); when batching we may pre-transform and set uM = I
        out vec2 vUV;
        void main() {
            vec3 p = vec3(aPosition, 1.0);
            vec3 ndc = uM * p;
            gl_Position = vec4(ndc.xy, 0.0, 1.0);
            vUV = aUV;
        }`;
        const fsSrc = `#version 300 es
        precision highp float;
        in vec2 vUV;
        uniform sampler2D uSampler;
        out vec4 oColor;
        void main() {
            oColor = texture(uSampler, vUV);
        }`;

        const vs = this._compile(gl.VERTEX_SHADER, vsSrc);
        const fs = this._compile(gl.FRAGMENT_SHADER, fsSrc);
        this.programTex = this._link(vs, fs);
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        this.uniforms.uSampler = gl.getUniformLocation(this.programTex, "uSampler");
        this.uniforms.uM = gl.getUniformLocation(this.programTex, "uM");

        this.vaoTex = gl.createVertexArray();
        gl.bindVertexArray(this.vaoTex);

        this.bufTexQuad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufTexQuad);
        const quad = new Float32Array([
            0, 0,   0, 0,
            1, 0,   1, 0,
            0, 1,   0, 1,
            1, 1,   1, 1,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        this.bufBatch = gl.createBuffer();
    }

    setSize(width, height) {
        const dpr = window.devicePixelRatio || 1;
        this.display.width = Math.max(1, Math.floor(width * dpr));
        this.display.height = Math.max(1, Math.floor(height * dpr));
        this.display.style.width = width + "px";
        this.display.style.height = height + "px";
        if (this.gl) {
            this.gl.viewport(0, 0, this.display.width, this.display.height);
        }
    }

    resize() {
        this.setSize(window.innerWidth, window.innerHeight);
        if (this.gl) {
            this.gl.viewport(0, 0, this.display.width, this.display.height);
        }
    }

    normalizeColor(input) {
        let r = 0, g = 0, b = 0, a = 1;
        const clamp01 = v => Math.min(Math.max(v, 0), 1);
        const n255 = v => clamp01((Number(v) || 0) / 255);

        if (typeof input === "string") {
            if (input.trim().toLowerCase() === "transparent") return { r:0,g:0,b:0,a:0 };
            const c = document.createElement("canvas");
            const ctx = c.getContext("2d");
            if (!ctx) return { r, g, b, a };
            ctx.fillStyle = input;
            const computed = ctx.fillStyle;

            const hex = computed.startsWith("#") ? computed.slice(1) : null;
            if (hex) {
                let rr, gg, bb, aa = "ff";
                if (hex.length === 3 || hex.length === 4) {
                    rr = hex[0] + hex[0]; gg = hex[1] + hex[1]; bb = hex[2] + hex[2];
                    if (hex.length === 4) aa = hex[3] + hex[3];
                } else if (hex.length === 6 || hex.length === 8) {
                    rr = hex.slice(0, 2); gg = hex.slice(2, 4); bb = hex.slice(4, 6);
                    if (hex.length === 8) aa = hex.slice(6, 8);
                }
                if (rr && gg && bb) {
                    r = n255(parseInt(rr, 16));
                    g = n255(parseInt(gg, 16));
                    b = n255(parseInt(bb, 16));
                    a = clamp01(parseInt(aa, 16) / 255);
                    return { r, g, b, a };
                }
            }

            const nums = computed.match(/\d+(\.\d+)?/g);
            if (nums) {
                r = n255(nums[0]); g = n255(nums[1]); b = n255(nums[2]);
                a = nums.length > 3 ? clamp01(Number(nums[3])) : 1;
                return { r, g, b, a };
            }
            return { r, g, b, a };
        }

        if (Array.isArray(input)) {
            let [R, G, B, A = 1] = input.map(Number);
            const maxRGB = Math.max(R || 0, G || 0, B || 0);
            if (maxRGB > 1) { r = n255(R); g = n255(G); b = n255(B); }
            else { r = clamp01(R); g = clamp01(G); b = clamp01(B); }
            a = clamp01(A);
            return { r, g, b, a };
        }

        if (typeof input === "object" && input !== null) {
            let R = Number(input.r ?? 0), G = Number(input.g ?? 0), B = Number(input.b ?? 0), A = Number(input.a ?? 1);
            const maxRGB = Math.max(R, G, B);
            if (maxRGB > 1) { r = n255(R); g = n255(G); b = n255(B); }
            else { r = clamp01(R); g = clamp01(G); b = clamp01(B); }
            a = clamp01(A);
            return { r, g, b, a };
        }

        return { r, g, b, a };
    }

    beginFrame(clearColor = null) {
        this.#ensureReady();
        const gl = this.gl;
        gl.viewport(0, 0, this.display.width, this.display.height);
        if (clearColor) {
            const { r, g, b, a } = this.normalizeColor(clearColor);
            gl.clearColor(r, g, b, a);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    }

    endFrame() {
        this.#ensureReady();
        // no-op in WebGL; draw calls are immediate
        // placeholder to preserve API symmetry
    }

    clear(color = "black") {
        this.#ensureReady();
        this.beginFrame(color);
        this.endFrame();
    }

    _drawVerticesColor(vertices, vertexCount, rgba) {
        const gl = this.gl;
        gl.useProgram(this.programColor);

        gl.bindVertexArray(this.vaoColor);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColorVertices);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

        gl.uniform4fv(this.uniforms.uColor, rgba);
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

        gl.bindVertexArray(null);
    }

    drawRect(x, y, w, h, color = "white") {
        this.#ensureReady();
        const { r, g, b, a } = this.normalizeColor(color);
        const x1 = (x / this.display.width) * 2 - 1;
        const y1 = (y / this.display.height) * -2 + 1;
        const x2 = ((x + w) / this.display.width) * 2 - 1;
        const y2 = ((y + h) / this.display.height) * -2 + 1;

        const vertices = new Float32Array([
            x1, y1, 0, 0,
            x2, y1, 1, 0,
            x1, y2, 0, 1,
            x1, y2, 0, 1,
            x2, y1, 1, 0,
            x2, y2, 1, 1
        ]);
        this._drawVerticesColor(vertices, 6, new Float32Array([r, g, b, a]));
    }

    drawCircle(x, y, radius, color = "white", segments = 64) {
        this.#ensureReady();
        const { r, g, b, a } = this.normalizeColor(color);
        const toNDC = (X, Y) => [(X/this.display.width)*2-1, (Y/this.display.height)*-2+1];

        const center = toNDC(x, y);
        const verts = [];
        for (let i = 0; i < segments; i++) {
            const a1 = (i / segments) * Math.PI * 2;
            const a2 = ((i + 1) / segments) * Math.PI * 2;
            const [x1, y1] = toNDC(x + Math.cos(a1) * radius, y + Math.sin(a1) * radius);
            const [x2, y2] = toNDC(x + Math.cos(a2) * radius, y + Math.sin(a2) * radius);
            verts.push(center[0], center[1], 0, 0);
            verts.push(x1, y1, 0, 0);
            verts.push(x2, y2, 0, 0);
        }
        this._drawVerticesColor(new Float32Array(verts), segments * 3, new Float32Array([r, g, b, a]));
    }

    drawLine(x1, y1, x2, y2, color = "white", width = 1) {
        this.#ensureReady();
        const { r, g, b, a } = this.normalizeColor(color);
        const toNDC = (X, Y) => [(X/this.display.width)*2-1, (Y/this.display.height)*-2+1];

        const dx = x2 - x1, dy = y2 - y1, ang = Math.atan2(dy, dx);
        const hw = width/2, ox = Math.sin(ang)*hw, oy = -Math.cos(ang)*hw;

        const p1 = toNDC(x1 - ox, y1 - oy);
        const p2 = toNDC(x2 - ox, y2 - oy);
        const p3 = toNDC(x1 + ox, y1 + oy);
        const p4 = toNDC(x2 + ox, y2 + oy);

        const vertices = new Float32Array([
            p1[0], p1[1], 0, 0,
            p2[0], p2[1], 1, 0,
            p3[0], p3[1], 0, 1,
            p3[0], p3[1], 0, 1,
            p2[0], p2[1], 1, 0,
            p4[0], p4[1], 1, 1
        ]);
        this._drawVerticesColor(vertices, 6, new Float32Array([r, g, b, a]));
    }

    _createTextureFromImageBitmap(bitmap, { linear = true } = {}) {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bitmap.width, bitmap.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }

    async loadSprite(name, src, overwrite = false) {
        if (this.sprites.has(name) && !overwrite) {
            return this.sprites.get(name);
        }
        const img = new Image();
        img.src = src;
        await img.decode();
        const bmp = await createImageBitmap(img);
        const texture = this._createTextureFromImageBitmap(bmp, { linear: true });
        const sprite = { texture, width: bmp.width, height: bmp.height };
        this.sprites.set(name, sprite);
        return sprite;
    }

    async drawText(text, x, y, color = "white", font = "16px Arial", name = null) {
        this.#ensureReady();
        const off = document.createElement("canvas");
        const ctx = off.getContext("2d");
        ctx.font = font;
        const metrics = ctx.measureText(text);
        off.width = Math.max(1, Math.ceil(metrics.width));
        off.height = Math.max(1, Math.ceil(parseInt(font, 10) * 1.5));

        ctx.font = font;
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = color;
        ctx.clearRect(0, 0, off.width, off.height);
        ctx.fillText(text, 0, off.height * 0.75);

        const key = name || `__text_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const bmp = await createImageBitmap(off);
        const texture = this._createTextureFromImageBitmap(bmp, { linear: true });
        this.sprites.set(key, { texture, width: off.width, height: off.height });
        this.drawSprite(key, x, y);
        return key;
    }

    _buildSpriteNDCMatrix(x, y, w, h, originX, originY, rot, scaleX, scaleY) {
        const sx = (w / this.display.width) * 2 * (scaleX ?? 1);
        const sy = (h / this.display.height) * -2 * (scaleY ?? 1);
        const tx = (x / this.display.width) * 2 - 1;
        const ty = (y / this.display.height) * -2 + 1;
        const c = Math.cos(rot ?? 0);
        const s = Math.sin(rot ?? 0);
        const ox_ndc = sx * (originX ?? 0);
        const oy_ndc = sy * (originY ?? 0);

        const a00 =  c * sx;  const a01 = -s * sy;  const a02 = tx - ( c * ox_ndc + -s * oy_ndc);
        const a10 =  s * sx;  const a11 =  c * sy;  const a12 = ty - ( s * ox_ndc +  c * oy_ndc);
        return new Float32Array([
            a00, a10, 0,
            a01, a11, 0,
            a02, a12, 1
        ]);
    }

    _applyNDCTransformToUnitQuad(x, y, w, h, originX, originY, rot, scaleX, scaleY) {
        const M = this._buildSpriteNDCMatrix(x, y, w, h, originX, originY, rot, scaleX, scaleY);
        const quad = [
            [0,0, 0,0],
            [1,0, 1,0],
            [0,1, 0,1],
            [1,1, 1,1],
        ];

        const out = new Float32Array(6 * 4);
        const tx = (px, py) => {
            const ndcX = M[0]*px + M[3]*py + M[6]*1.0;
            const ndcY = M[1]*px + M[4]*py + M[7]*1.0;
            return [ndcX, ndcY];
        };

        const p00 = tx(0,0), p10 = tx(1,0), p01 = tx(0,1), p11 = tx(1,1);
        let i = 0;
        out[i++] = p00[0]; out[i++] = p00[1]; out[i++] = 0; out[i++] = 0;
        out[i++] = p10[0]; out[i++] = p10[1]; out[i++] = 1; out[i++] = 0;
        out[i++] = p01[0]; out[i++] = p01[1]; out[i++] = 0; out[i++] = 1;
        out[i++] = p01[0]; out[i++] = p01[1]; out[i++] = 0; out[i++] = 1;
        out[i++] = p10[0]; out[i++] = p10[1]; out[i++] = 1; out[i++] = 0;
        out[i++] = p11[0]; out[i++] = p11[1]; out[i++] = 1; out[i++] = 1;
        return out;
    }

    drawSprite(name, x, y, w = null, h = null, opts = {}) {
        this.#ensureReady();
        const gl = this.gl;
        const sprite = this.sprites.get(name);
        if (!sprite) { console.warn(`Sprite "${name}" not found.`); return; }

        const width  = w || sprite.width;
        const height = h || sprite.height;

        const {
            rotation = 0,
            scaleX   = 1,
            scaleY   = 1,
            originX  = 0,
            originY  = 0,
        } = opts;

        const M = this._buildSpriteNDCMatrix(x, y, width, height, originX, originY, rotation, scaleX, scaleY);

        gl.useProgram(this.programTex);
        gl.bindVertexArray(this.vaoTex);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sprite.texture);
        gl.uniform1i(this.uniforms.uSampler, 0);
        gl.uniformMatrix3fv(this.uniforms.uM, false, M);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    destroySprite(name) {
        const gl = this.gl;
        const sprite = this.sprites.get(name);
        if (sprite) {
            if (sprite.texture) gl.deleteTexture(sprite.texture);
            this.sprites.delete(name);
        }
    }

    beginSpriteBatch(textureName) {
        const sprite = this.sprites.get(textureName);
        if (!sprite) { console.warn(`Sprite "${textureName}" not found.`); return false; }
        this._batch = { textureName, sprite, verts: [] };
        return true;
    }

    batchSprite(x, y, w = null, h = null, opts = {}) {
        if (!this._batch) { console.warn("Call beginSpriteBatch(textureName) first."); return; }
        const { sprite } = this._batch;
        const width  = w || sprite.width;
        const height = h || sprite.height;
        const { rotation=0, scaleX=1, scaleY=1, originX=0, originY=0 } = opts;
        const triVerts = this._applyNDCTransformToUnitQuad(x, y, width, height, originX, originY, rotation, scaleX, scaleY);
        this._batch.verts.push(triVerts);
    }

    endSpriteBatch() {
        if (!this._batch) return;

        const gl = this.gl;
        const sprite = this._batch.sprite;
        const verts = this._batch.verts;
        if (verts.length === 0) { this._batch = null; return; }

        const total = new Float32Array(verts.length * 6 * 4);
        let off = 0;
        for (let i = 0; i < verts.length; i++) {
            total.set(verts[i], off);
            off += 6 * 4;
        }

        gl.useProgram(this.programTex);
        gl.bindVertexArray(null);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufBatch);
        gl.bufferData(gl.ARRAY_BUFFER, total, gl.DYNAMIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        const I = new Float32Array([
            1,0,0,
            0,1,0,
            0,0,1
        ]);
        gl.uniformMatrix3fv(this.uniforms.uM, false, I);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sprite.texture);
        gl.uniform1i(this.uniforms.uSampler, 0);

        gl.drawArrays(gl.TRIANGLES, 0, verts.length * 6);

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.disableVertexAttribArray(0);
        gl.disableVertexAttribArray(1);
        gl.bindTexture(gl.TEXTURE_2D, null);

        this._batch = null;
    }
}