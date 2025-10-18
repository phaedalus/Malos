export class WEBGLAPI {
    constructor(engine, canvasId) {
        this.engine = engine;
        this.id = canvasId;

        this.display = document.getElementById(canvasId);
        if (!this.display) {
            throw new Error(`Canvas element with id "${canvasId}" not found in DOM.`);
        }

        this.gl = this.display.getContext("webgl", {
            alpha: false,
            premultipliedAlpha: false
        });
        if (!this.gl) {
            throw new Error("WebGL not supported in this browser.");
        }

        console.log("WebGL1 initialized on canvas", canvasId);

        this.sprites = new Map();
        this._tmpBuffers = [];
        this._batch = null;

        this._isReady = false;
        this.ready = this.init();
    }

    async init() {
        this.#initGL();
        this.setSize(window.innerWidth, window.innerHeight);

        this._isReady = true;
        console.log(`WebGL1 Renderer ready on "${this.id}"`);
        return true;
    }

    #ensureReady() {
        if (!this._isReady) {
            throw new Error(`WebGL1 not ready yet! You must "await game.Graphics.ready;" before using it.`);
        }
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

    resize() {
        this.setSize(window.innerWidth, window.innerHeight);
    }

    setSize(width, height) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.floor(width * dpr));
        const h = Math.max(1, Math.floor(height * dpr));

        this.display.width = w;
        this.display.height = h;
        this.display.style.width = width + "px";
        this.display.style.height = height + "px";

        this.gl.viewport(0, 0, w, h);
    }

    #initGL() {
        const vs = `
        attribute vec2 aPosition;
        attribute vec2 aTexCoord;
        varying vec2 vTex;
        uniform mat3 uM; // 2D transform in NDC for sprites; identity for pre-NDC geometry
        void main(){
            vec3 p = uM * vec3(aPosition, 1.0);
            gl_Position = vec4(p.xy, 0.0, 1.0);
            vTex = aTexCoord;
        }
        `;

        const fs = `
        precision mediump float;
        varying vec2 vTex;
        uniform sampler2D uSampler;
        uniform vec4 uColor;
        uniform bool uUseTexture;
        void main(){
            if (uUseTexture) {
            gl_FragColor = texture2D(uSampler, vTex);
            } else {
            gl_FragColor = uColor;
            }
        }
        `;

        this.program = this.#createProgram(vs, fs);

        const gl = this.gl;
        gl.useProgram(this.program);

        this.attrib = {
            pos: gl.getAttribLocation(this.program, "aPosition"),
            uv: gl.getAttribLocation(this.program, "aTexCoord"),
        };
        this.uni = {
            sampler: gl.getUniformLocation(this.program, "uSampler"),
            color: gl.getUniformLocation(this.program, "uColor"),
            useTexture: gl.getUniformLocation(this.program, "uUseTexture"),
            M: gl.getUniformLocation(this.program, "uM"),
        };

        this._unitQuad = new Float32Array([
            0, 0, 0, 0,
            1, 0, 1, 0,
            0, 1, 0, 1,
            1, 1, 1, 1,
        ]);

        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.uniform1i(this.uni.useTexture, 0);
        gl.uniform4f(this.uni.color, 1, 1, 1, 1);
        gl.uniformMatrix3fv(this.uni.M, false, this.#I());

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    #createProgram(vsSource, fsSource) {
        const gl = this.gl;
        const vs = this.#compile(gl.VERTEX_SHADER, vsSource);
        const fs = this.#compile(gl.FRAGMENT_SHADER, fsSource);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("Program link failed: " + gl.getProgramInfoLog(prog));
        }
        return prog;
    }

    #compile(type, src) {
        const gl = this.gl;
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            throw new Error("Shader compile error: " + gl.getShaderInfoLog(sh));
        }
        return sh;
    }

    beginFrame(clearColor = null) {
        this.#ensureReady();
        const gl = this.gl;
        if (clearColor) {
            const {
                r,
                g,
                b,
                a
            } = this.normalizeColor(clearColor);
            gl.clearColor(r, g, b, a);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    }

    endFrame() {
        this.#ensureReady();
        if (this._tmpBuffers && this._tmpBuffers.length) {
            const gl = this.gl;
            for (const b of this._tmpBuffers) try {
                gl.deleteBuffer(b);
            } catch (e) {}
            this._tmpBuffers.length = 0;
        }
    }

    clear(color = "black") {
        this.#ensureReady();
        const {
            r,
            g,
            b,
            a
        } = this.normalizeColor(color);
        const gl = this.gl;
        gl.clearColor(r, g, b, a);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    #I() {
        return new Float32Array([
            1, 0, 0,
            0, 1, 0,
            0, 0, 1,
        ]);
    }

    #toNDC(x, y) {
        const w = this.display.width;
        const h = this.display.height;
        return [(x / w) * 2 - 1, (y / h) * -2 + 1];
    }

    normalizeColor(input) {
        let r = 0,
            g = 0,
            b = 0,
            a = 1;
        const clamp01 = v => Math.min(Math.max(v, 0), 1);
        const n255 = v => clamp01((Number(v) || 0) / 255);

        if (typeof input === "string") {
            if (input.trim().toLowerCase() === "transparent") return {
                r: 0,
                g: 0,
                b: 0,
                a: 0
            };
            const c = document.createElement("canvas");
            const ctx = c.getContext("2d");
            if (!ctx) return {
                r,
                g,
                b,
                a
            };
            ctx.fillStyle = input;
            const computed = ctx.fillStyle;
            const hex = computed.startsWith("#") ? computed.slice(1) : null;
            if (hex) {
                let rr, gg, bb, aa = "ff";
                if (hex.length === 3 || hex.length === 4) {
                    rr = hex[0] + hex[0];
                    gg = hex[1] + hex[1];
                    bb = hex[2] + hex[2];
                    if (hex.length === 4) aa = hex[3] + hex[3];
                } else if (hex.length === 6 || hex.length === 8) {
                    rr = hex.slice(0, 2);
                    gg = hex.slice(2, 4);
                    bb = hex.slice(4, 6);
                    if (hex.length === 8) aa = hex.slice(6, 8);
                }
                if (rr && gg && bb) {
                    return {
                        r: n255(parseInt(rr, 16)),
                        g: n255(parseInt(gg, 16)),
                        b: n255(parseInt(bb, 16)),
                        a: clamp01(parseInt(aa, 16) / 255)
                    };
                }
            }
            const nums = computed.match(/\d+(\.\d+)?/g);
            if (nums) {
                r = n255(nums[0]);
                g = n255(nums[1]);
                b = n255(nums[2]);
                a = nums.length > 3 ? clamp01(Number(nums[3])) : 1;
                return {
                    r,
                    g,
                    b,
                    a
                };
            }
            return {
                r,
                g,
                b,
                a
            };
        }

        if (Array.isArray(input)) {
            let [R, G, B, A = 1] = input.map(Number);
            const use255 = Math.max(R || 0, G || 0, B || 0) > 1;
            return {
                r: use255 ? n255(R) : clamp01(R),
                g: use255 ? n255(G) : clamp01(G),
                b: use255 ? n255(B) : clamp01(B),
                a: clamp01(A)
            };
        }

        if (typeof input === "object" && input !== null) {
            let R = Number(input.r ?? 0),
                G = Number(input.g ?? 0),
                B = Number(input.b ?? 0),
                A = Number(input.a ?? 1);
            const use255 = Math.max(R, G, B) > 1;
            return {
                r: use255 ? n255(R) : clamp01(R),
                g: use255 ? n255(G) : clamp01(G),
                b: use255 ? n255(B) : clamp01(B),
                a: clamp01(A)
            };
        }

        return {
            r,
            g,
            b,
            a
        };
    }

    #drawVertices(vertices, color) {
        const gl = this.gl;
        const buf = gl.createBuffer();
        this._tmpBuffers.push(buf);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);

        gl.vertexAttribPointer(this.attrib.pos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(this.attrib.pos);
        gl.vertexAttribPointer(this.attrib.uv, 2, gl.FLOAT, false, 16, 8);
        gl.enableVertexAttribArray(this.attrib.uv);

        gl.uniform1i(this.uni.useTexture, 0);
        gl.uniform4fv(this.uni.color, color);
        gl.uniformMatrix3fv(this.uni.M, false, this.#I());
    }

    drawRect(x, y, w, h, color = "white") {
        this.#ensureReady();
        const {
            r,
            g,
            b,
            a
        } = this.normalizeColor(color);
        const x1 = (x / this.display.width) * 2 - 1;
        const y1 = (y / this.display.height) * -2 + 1;
        const x2 = ((x + w) / this.display.width) * 2 - 1;
        const y2 = ((y + h) / this.display.height) * -2 + 1;

        const v = new Float32Array([
            x1, y1, 0, 0,
            x2, y1, 1, 0,
            x1, y2, 0, 1,
            x2, y2, 1, 1,
        ]);

        this.#drawVertices(v, new Float32Array([r, g, b, a]));
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    drawLine(x1, y1, x2, y2, color = "white", width = 1) {
        this.#ensureReady();
        const {
            r,
            g,
            b,
            a
        } = this.normalizeColor(color);
        const dx = x2 - x1,
            dy = y2 - y1,
            ang = Math.atan2(dy, dx);
        const hw = width / 2,
            ox = Math.sin(ang) * hw,
            oy = -Math.cos(ang) * hw;
        const p1 = this.#toNDC(x1 - ox, y1 - oy);
        const p2 = this.#toNDC(x2 - ox, y2 - oy);
        const p3 = this.#toNDC(x1 + ox, y1 + oy);
        const p4 = this.#toNDC(x2 + ox, y2 + oy);

        const v = new Float32Array([
            p1[0], p1[1], 0, 0,
            p2[0], p2[1], 1, 0,
            p3[0], p3[1], 0, 1,
            p3[0], p3[1], 1, 0,
            p2[0], p2[1], 1, 0,
            p4[0], p4[1], 1, 1,
        ]);

        this.#drawVertices(v, new Float32Array([r, g, b, a]));
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }

    drawCircle(x, y, radius, color = "white", segments = 64) {
        this.#ensureReady();
        const {
            r,
            g,
            b,
            a
        } = this.normalizeColor(color);
        const center = this.#toNDC(x, y);
        const verts = [];
        for (let i = 0; i < segments; i++) {
            const a1 = (i / segments) * Math.PI * 2;
            const a2 = ((i + 1) / segments) * Math.PI * 2;
            const p1 = this.#toNDC(x + Math.cos(a1) * radius, y + Math.sin(a1) * radius);
            const p2 = this.#toNDC(x + Math.cos(a2) * radius, y + Math.sin(a2) * radius);
            verts.push(
                center[0], center[1], 0, 0,
                p1[0], p1[1], 0, 0,
                p2[0], p2[1], 0, 0
            );
        }
        const v = new Float32Array(verts);
        this.#drawVertices(v, new Float32Array([r, g, b, a]));
        this.gl.drawArrays(this.gl.TRIANGLES, 0, segments * 3);
    }

    async loadSprite(name, src, overwrite = false) {
        if (this.sprites.has(name) && !overwrite) return this.sprites.get(name);
        const img = new Image();
        img.src = src;
        await img.decode();
        const tex = this.#createTextureFromImage(img);
        const sprite = {
            texture: tex,
            width: img.width,
            height: img.height
        };
        this.sprites.set(name, sprite);
        return sprite;
    }

    #createTextureFromImage(imgOrCanvas) {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgOrCanvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }

    destroySprite(name) {
        const s = this.sprites.get(name);
        if (s) {
            try {
                this.gl.deleteTexture(s.texture);
            } catch (e) {}
            this.sprites.delete(name);
        }
    }

    drawText(text, x, y, color = "white", font = "16px Arial", name = null) {
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

        return Promise.resolve().then(() => {
            const texture = this.#createTextureFromImage(off);
            this.sprites.set(key, {
                texture,
                width: off.width,
                height: off.height
            });
            this.drawSprite(key, x, y);
            return key;
        });
    }

    #buildSpriteNDCMatrix(x, y, w, h, originX, originY, rot, scaleX, scaleY) {
        const sx = (w / this.display.width) * 2 * (scaleX ?? 1);
        const sy = (h / this.display.height) * -2 * (scaleY ?? 1);

        const tx = (x / this.display.width) * 2 - 1;
        const ty = (y / this.display.height) * -2 + 1;

        const c = Math.cos(rot ?? 0);
        const s = Math.sin(rot ?? 0);

        const ox_ndc = sx * (originX ?? 0);
        const oy_ndc = sy * (originY ?? 0);

        const a00 = c * sx;
        const a01 = -s * sy;
        const a02 = tx - (c * ox_ndc + -s * oy_ndc);
        const a10 = s * sx;
        const a11 = c * sy;
        const a12 = ty - (s * ox_ndc + c * oy_ndc);
        const a20 = 0;
        const a21 = 0;
        const a22 = 1;

        return new Float32Array([
            a00, a10, 0,
            a01, a11, 0,
            a02, a12, 1,
        ]);
    }

    #spriteUnitQuad() {
        return this._unitQuad;
    }

    drawSprite(name, x, y, w = null, h = null, opts = {}) {
        this.#ensureReady();
        const sprite = this.sprites.get(name);
        if (!sprite) {
            console.warn(`Sprite "${name}" not found.`);
            return;
        }

        const width = w || sprite.width;
        const height = h || sprite.height;

        const {
            rotation = 0, scaleX = 1, scaleY = 1, originX = 0, originY = 0
        } = opts;

        const M = this.#buildSpriteNDCMatrix(x, y, width, height, originX, originY, rotation, scaleX, scaleY);

        const gl = this.gl;

        const quad = this.#spriteUnitQuad();
        const buf = gl.createBuffer();
        this._tmpBuffers.push(buf);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STREAM_DRAW);

        gl.vertexAttribPointer(this.attrib.pos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(this.attrib.pos);
        gl.vertexAttribPointer(this.attrib.uv, 2, gl.FLOAT, false, 16, 8);
        gl.enableVertexAttribArray(this.attrib.uv);

        gl.uniform1i(this.uni.useTexture, 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sprite.texture);
        gl.uniform1i(this.uni.sampler, 0);
        gl.uniformMatrix3fv(this.uni.M, false, M);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.uniformMatrix3fv(this.uni.M, false, this.#I());
    }

    beginSpriteBatch(textureName) {
        const sprite = this.sprites.get(textureName);
        if (!sprite) {
            console.warn(`Sprite "${textureName}" not found.`);
            return false;
        }
        this._batch = {
            name: textureName,
            sprite,
            verts: []
        };
        return true;
    }

    #applyNDCTransformToUnitQuad(x, y, w, h, originX, originY, rot, scaleX, scaleY) {
        const M = this.#buildSpriteNDCMatrix(x, y, w, h, originX, originY, rot, scaleX, scaleY);
        const q = [
            [0, 0, 0, 0],
            [1, 0, 1, 0],
            [0, 1, 0, 1],
            [1, 1, 1, 1]
        ];
        const out = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            const px = q[i][0],
                py = q[i][1];
            const ndcX = M[0] * px + M[3] * py + M[6];
            const ndcY = M[1] * px + M[4] * py + M[7];
            out[i * 4 + 0] = ndcX;
            out[i * 4 + 1] = ndcY;
            out[i * 4 + 2] = q[i][2];
            out[i * 4 + 3] = q[i][3];
        }
        return out;
    }

    batchSprite(x, y, w = null, h = null, opts = {}) {
        if (!this._batch) {
            console.warn("Call beginSpriteBatch(textureName) first.");
            return;
        }
        const {
            sprite
        } = this._batch;
        const width = w || sprite.width;
        const height = h || sprite.height;
        const {
            rotation = 0, scaleX = 1, scaleY = 1, originX = 0, originY = 0
        } = opts;
        const quad = this.#applyNDCTransformToUnitQuad(x, y, width, height, originX, originY, rotation, scaleX, scaleY);
        this._batch.verts.push(quad);
    }

    endSpriteBatch() {
        if (!this._batch) return;
        const {
            sprite,
            verts
        } = this._batch;
        if (verts.length === 0) {
            this._batch = null;
            return;
        }

        const total = new Float32Array(verts.length * 6 * 4);
        for (let i = 0; i < verts.length; i++) {
            const q = verts[i];
            const o = i * 24;
            total[o + 0] = q[0];
            total[o + 1] = q[1];
            total[o + 2] = q[2];
            total[o + 3] = q[3];
            total[o + 4] = q[4];
            total[o + 5] = q[5];
            total[o + 6] = q[6];
            total[o + 7] = q[7];
            total[o + 8] = q[8];
            total[o + 9] = q[9];
            total[o + 10] = q[10];
            total[o + 11] = q[11];
            total[o + 12] = q[8];
            total[o + 13] = q[9];
            total[o + 14] = q[10];
            total[o + 15] = q[11];
            total[o + 16] = q[4];
            total[o + 17] = q[5];
            total[o + 18] = q[6];
            total[o + 19] = q[7];
            total[o + 20] = q[12];
            total[o + 21] = q[13];
            total[o + 22] = q[14];
            total[o + 23] = q[15];
        }

        const gl = this.gl;
        const buf = gl.createBuffer();
        this._tmpBuffers.push(buf);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, total, gl.STREAM_DRAW);

        gl.vertexAttribPointer(this.attrib.pos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(this.attrib.pos);
        gl.vertexAttribPointer(this.attrib.uv, 2, gl.FLOAT, false, 16, 8);
        gl.enableVertexAttribArray(this.attrib.uv);

        gl.uniform1i(this.uni.useTexture, 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sprite.texture);
        gl.uniform1i(this.uni.sampler, 0);
        gl.uniformMatrix3fv(this.uni.M, false, this.#I());

        gl.drawArrays(gl.TRIANGLES, 0, verts.length * 6);

        this._batch = null;
    }
}