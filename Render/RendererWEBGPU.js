export class WEBGPUAPI {
    constructor(engine, canvasId) {
        this.engine = engine;
        this.id = canvasId;
        this._readyAwaited = false;

        this.display = document.getElementById(canvasId);
        if (!this.display) {
            throw new Error(`Canvas element with id "${canvasId}" not found in DOM.`);
        }

        if (!navigator.gpu) {
            throw new Error("WebGPU not supported in this browser.");
        }

        this.adapter = null;
        this.device = null;
        this.context = this.display.getContext("webgpu");

        this.autoResize = null;

        this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

        this.pipeline = null;
        this.vertexBuffer = null;
        this.sprites = new Map();
        this._tmpColorBuffers = [];

        this.pass = null;
        this.encoder = null;

        this._isReady = false;
        this.ready = (async () => {
            await this.init();
            this._readyAwaited = true;
        })();
    }

    async init() {
        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) throw new Error("Failed to get GPU adapter.");

        this.device = await this.adapter.requestDevice();
        if (!this.device) throw new Error("Failed to get GPU device.");

        this._isReady = true;

        this.setSize(window.innerWidth, window.innerHeight);

        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: "opaque",
        });

        console.log(`WebGPU initialized on canvas "${this.id}"`, this.device);
        this.#initPipeline();
        this.#initTexturePipeline();
    }

    #ensureReady() {
        if (!this._isReady) {
            throw new Error("WebGPU not ready. Did you forget to await game.Graphics.ready?");
        }
        if (!this._readyAwaited) {
            console.warn("⚠️ You should `await game.Graphics.ready` before calling drawText or other async graphics functions.");
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

    #initPipeline() {
        const shaderModule = this.device.createShaderModule({
            code: `
            struct Uniforms {
                color: vec4f
            };
            @group(0) @binding(0) var<uniform> u : Uniforms;

            @vertex
            fn vs_main(@location(0) position : vec2f,
                    @location(1) texCoord : vec2f) -> @builtin(position) vec4f {
                return vec4f(position, 0.0, 1.0);
            }

            @fragment
            fn fs_main() -> @location(0) vec4f {
                return u.color;
            }
            `,
        });

        this.pipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [{
                    arrayStride: 16,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: "float32x2" },
                        { shaderLocation: 1, offset: 8, format: "float32x2" },
                    ],
                }],
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{ format: this.presentationFormat }],
            },
            primitive: { topology: "triangle-list" },
        });

        this.colorBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.colorBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: this.colorBuffer } }],
        });
    }

    #initTexturePipeline() {
        const shaderModule = this.device.createShaderModule({
            code: `
            struct VertexOutput {
                @builtin(position) Position : vec4f,
                @location(0) fragUV : vec2f
            };

            // position is in model space (0..1 in both axes)
            @group(0) @binding(0) var mySampler : sampler;
            @group(0) @binding(1) var myTexture : texture_2d<f32>;
            struct TUniforms { M : mat3x3<f32> };
            @group(0) @binding(2) var<uniform> U : TUniforms;

            @vertex
            fn vs_main(@location(0) position : vec2f,
                    @location(1) uv       : vec2f) -> VertexOutput {
                var out : VertexOutput;
                let p = vec3<f32>(position, 1.0);
                let ndc = U.M * p;              // apply 2D transform in NDC
                out.Position = vec4<f32>(ndc.xy, 0.0, 1.0);
                out.fragUV = uv;
                return out;
            }

            @fragment
            fn fs_main(@location(0) fragUV : vec2f) -> @location(0) vec4f {
                return textureSample(myTexture, mySampler, fragUV);
            }
            `,
        });

        this.texturePipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [{
                    arrayStride: 16,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: "float32x2" },
                        { shaderLocation: 1, offset: 8, format: "float32x2" },
                    ],
                }],
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{
                    format: this.presentationFormat,
                    blend: {
                        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
                        alpha: { srcFactor: "one",       dstFactor: "one-minus-src-alpha", operation: "add" },
                    },
                }],
            },
            primitive: { topology: "triangle-strip" },
        });

        this.sampler = this.device.createSampler({ magFilter: "linear", minFilter: "linear" });

        this.textureTransformBuffer = this.device.createBuffer({
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    setSize(width, height) {
        const dpr = window.devicePixelRatio || 1;
        this.display.width = width * dpr;
        this.display.height = height * dpr;
        this.display.style.width = width + "px";
        this.display.style.width = width + "px";
        this.display.style.height = height + "px";
    }

    resize() {
        this.setSize(window.innerWidth, window.innerHeight);
        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: "opaque",
        });
    }

    normalizeColor(input) {
        let r = 0, g = 0, b = 0, a = 1;

        const clamp01 = v => Math.min(Math.max(v, 0), 1);

        const n255 = v => clamp01((Number(v) || 0) / 255);

        if (typeof input === "string") {
            if (input.trim().toLowerCase() === "transparent") {
                return { r:0, g:0, b:0, a:0 };
            }

            const c = document.createElement("canvas");
            const ctx = c.getContext("2d");
            if (!ctx) {
                console.warn("2D canvas context unavailable; using default color.");
                return { r, g, b, a };
            }

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
                    r = n255(parseInt(rr, 16));
                    g = n255(parseInt(gg, 16));
                    b = n255(parseInt(bb, 16));
                    a = clamp01(parseInt(aa, 16) / 255);
                    return { r, g, b, a };
                }
            }

            const nums = computed.match(/\d+(\.\d+)?/g);
            if (nums) {
                r = n255(nums[0]);
                g = n255(nums[1]);
                b = n255(nums[2]);
                a = nums.length > 3 ? clamp01(Number(nums[3])) : 1;
                return { r, g, b, a };
            }

            console.warn(`Could not parse color string "${input}" (computed: "${computed}")`);
            return { r, g, b, a };
        }

        if (Array.isArray(input)) {
            let [R, G, B, A = 1] = input.map(Number);
            const maxRGB = Math.max(R || 0, G || 0, B || 0);
            const use255 = maxRGB > 1;
            if (use255) {
                r = n255(R); g = n255(G); b = n255(B);
            } else {
                r = clamp01(R); g = clamp01(G); b = clamp01(B);
            }
            a = clamp01(A);
            return { r, g, b, a };
        }

        if (typeof input === "object" && input !== null) {
            let R = Number(input.r ?? 0);
            let G = Number(input.g ?? 0);
            let B = Number(input.b ?? 0);
            let A = Number(input.a ?? 1);
            const maxRGB = Math.max(R, G, B);
            if (maxRGB > 1) {
                r = n255(R); g = n255(G); b = n255(B);
            } else {
                r = clamp01(R); g = clamp01(G); b = clamp01(B);
            }
            a = clamp01(A);
            return { r, g, b, a };
        }

        return { r, g, b, a };
    }

    beginFrame(clearColor = null) {
        this.encoder = this.device.createCommandEncoder();
        const view = this.context.getCurrentTexture().createView();

        let clearVal;
        if (clearColor) {
            clearVal = this.normalizeColor(clearColor);
        }

        this.pass = this.encoder.beginRenderPass({
            colorAttachments: [{
            view,
            loadOp: clearVal ? "clear" : "load",
            clearValue: clearVal,
            storeOp: "store",
            }],
        });
    }

    endFrame() {
        if (this.pass) {
            this.pass.end();
            this.device.queue.submit([this.encoder.finish()]);
            this.pass = null;
            this.encoder = null;

            if (this._tmpColorBuffers) {
                for (const b of this._tmpColorBuffers) { try { b.destroy(); } catch {} }
                this._tmpColorBuffers = [];
            }
        }
    }

    clear(color = "black") {
        const { r, g, b, a } = this.normalizeColor(color);
        this.beginFrame({ r, g, b, a });
        this.endFrame();
    }

    #drawVertices(vertices, vertexCount, rgba) {
        this.vertexBuffer = this.device.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);

        const colorBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(colorBuffer, 0, rgba);
        this._tmpColorBuffers.push(colorBuffer);

        const colorBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: colorBuffer } }],
        });

        const pass = this.pass ?? (() => { this.beginFrame(); return this.pass; })();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, colorBindGroup);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.draw(vertexCount, 1, 0, 0);

        if (!this.pass) this.endFrame();
    }

    drawRect(x, y, w, h, color = "white") {
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

        this.#drawVertices(vertices, 6, new Float32Array([r, g, b, a]));
    }

    drawCircle(x, y, radius, color = "white", segments = 64) {
        const { r, g, b, a } = this.normalizeColor(color);
        const toNDC = (X, Y) => [(X/this.display.width)*2-1, (Y/this.display.height)*-2+1];

        const center = toNDC(x, y);
        const verts = [];

        for (let i = 0; i < segments; i++) {
            const ang1 = (i / segments) * Math.PI * 2;
            const ang2 = ((i + 1) / segments) * Math.PI * 2;
            const [x1, y1] = toNDC(x + Math.cos(ang1) * radius, y + Math.sin(ang1) * radius);
            const [x2, y2] = toNDC(x + Math.cos(ang2) * radius, y + Math.sin(ang2) * radius);

            verts.push(center[0], center[1], 0, 0);
            verts.push(x1, y1, 0, 0);
            verts.push(x2, y2, 0, 0);
        }
        this.#drawVertices(new Float32Array(verts), segments * 3, new Float32Array([r, g, b, a]));
    }

    drawLine(x1, y1, x2, y2, color = "white", width = 1) {
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
            p3[0], p3[1], 1, 0,
            p2[0], p2[1], 1, 0,
            p4[0], p4[1], 1, 1
        ]);
        this.#drawVertices(vertices, 6, new Float32Array([r, g, b, a]));
    }

    drawText(text, x, y, color = "white", font = "16px Arial", name = null) {
        this.#ensureReady();
        const off = document.createElement("canvas");
        const ctx = off.getContext("2d");
        ctx.font = font;
        const metrics = ctx.measureText(text);
        off.width = metrics.width;
        off.height = parseInt(font, 10) * 1.5;

        ctx.font = font;
        ctx.fillStyle = color;
        ctx.fillText(text, 0, off.height * 0.75);

        const key = name || `__text_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        const texture = this.device.createTexture({
            size: [off.width, off.height, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
        });

        this.device.queue.copyExternalImageToTexture(
            { source: off },
            { texture },
            [off.width, off.height]
        );

        this.sprites.set(key, { texture, width: off.width, height: off.height });
        this.drawSprite(key, x, y);
        return key;
    }

    async loadSprite(name, src, overwrite = false) {
        if (this.sprites.has(name) && !overwrite) {
            return this.sprites.get(name);
        }

        const img = new Image();
        img.src = src;
        await img.decode();

        const bitmap = await createImageBitmap(img);
        const texture = this.device.createTexture({
            size: [bitmap.width, bitmap.height, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
        });

        this.device.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture },
            [bitmap.width, bitmap.height]
        );

        const sprite = { texture, width: bitmap.width, height: bitmap.height };
        this.sprites.set(name, sprite);
        return sprite;
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

        const a00 =  c * sx;  const a01 = -s * sy;  const a02 = tx - ( c * ox_ndc + -s * oy_ndc);
        const a10 =  s * sx;  const a11 =  c * sy;  const a12 = ty - ( s * ox_ndc +  c * oy_ndc);
        const a20 =  0;       const a21 =  0;       const a22 = 1;

        const M = new Float32Array(12);
        M.set([a00, a10, a20, 0,  a01, a11, a21, 0,  a02, a12, a22, 0]);
        return M;
    }

    #spriteUnitQuad() {
        return new Float32Array([
            0, 0,   0, 0,
            1, 0,   1, 0,
            0, 1,   0, 1,
            1, 1,   1, 1,
        ]);
    }

    drawSprite(name, x, y, w = null, h = null, opts = {}) {
        if (!this.texturePipeline) return;
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

        const M = this.#buildSpriteNDCMatrix(x, y, width, height, originX, originY, rotation, scaleX, scaleY);
        this.device.queue.writeBuffer(this.textureTransformBuffer, 0, M);

        const quad = this.#spriteUnitQuad();
        this.vertexBuffer = this.device.createBuffer({
            size: quad.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.vertexBuffer, 0, quad);

        const bindGroup = this.device.createBindGroup({
            layout: this.texturePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: sprite.texture.createView() },
                { binding: 2, resource: { buffer: this.textureTransformBuffer } },
            ],
        });

        const pass = this.pass ?? (() => { this.beginFrame(); return this.pass; })();
        pass.setPipeline(this.texturePipeline);
        pass.setBindGroup(0, bindGroup);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.draw(4, 1, 0, 0);
        if (!this.pass) this.endFrame();
    }

    destroySprite(name) {
        const sprite = this.sprites.get(name);
        if (sprite) {
            sprite.texture.destroy();
            this.sprites.delete(name);
        }
    }

    #applyNDCTransformToUnitQuad(x, y, w, h, originX, originY, rot, scaleX, scaleY) {
        const M = this.#buildSpriteNDCMatrix(x, y, w, h, originX, originY, rot, scaleX, scaleY);

        const quad = [
            [0,0, 0,0],
            [1,0, 1,0],
            [0,1, 0,1],
            [1,1, 1,1],
        ];
        const out = new Float32Array(4 * 4);
        for (let i = 0; i < 4; i++) {
            const px = quad[i][0], py = quad[i][1];
            const xN = M[0]*px + M[8]*1 + M[4]*py;
            const yN = M[1]*px + M[9]*1 + M[5]*py;
            const ndcX = M[0]*px + M[4]*py + M[8]*1;
            const ndcY = M[1]*px + M[5]*py + M[9]*1;
            out[i*4 + 0] = ndcX;
            out[i*4 + 1] = ndcY;
            out[i*4 + 2] = quad[i][2];
            out[i*4 + 3] = quad[i][3];
        }
        return out;
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

        const quad = this.#applyNDCTransformToUnitQuad(x, y, width, height, originX, originY, rotation, scaleX, scaleY);
        this._batch.verts.push(quad);
    }

    endSpriteBatch() {
        if (!this._batch) return;

        const verts = this._batch.verts;
        if (verts.length === 0) { this._batch = null; return; }

        const sprite = this._batch.sprite;
        const total = new Float32Array(verts.length * 16);
        for (let i = 0; i < verts.length; i++) total.set(verts[i], i * 16);

        this.vertexBuffer = this.device.createBuffer({
            size: total.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.vertexBuffer, 0, total);

        const bindGroup = this.device.createBindGroup({
            layout: this.texturePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: sprite.texture.createView() },
                { binding: 2, resource: { buffer: this.textureTransformBuffer } },
            ],
        });

        const I = new Float32Array([1,0,0,0,  0,1,0,0,  0,0,1,0]);
        this.device.queue.writeBuffer(this.textureTransformBuffer, 0, I);

        const pass = this.pass ?? (() => { this.beginFrame(); return this.pass; })();
        pass.setPipeline(this.texturePipeline);
        pass.setBindGroup(0, bindGroup);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.draw(4 * verts.length, 1, 0, 0);
        if (!this.pass) this.endFrame();

        this._batch = null;
    }
}