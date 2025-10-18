export async function decideGraphicsAPI({ log = false } = {}) {
    function getBestGraphicsAPI() {
        if (navigator.gpu) return "WebGPU";
        if (window.WebGL2RenderingContext) return "WebGL2";
        if (window.WebGLRenderingContext) return "WebGL";
        return "Canvas2D";
    }

    function getGPUInfo() {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) return { vendor: "Unknown", renderer: "Unknown" };

        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
        return {
            vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
            renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
        };
        }
        return { vendor: "Unknown", renderer: "Unknown" };
    }

    async function benchmarkWebGL() {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl");
        if (!gl) return 0;

        const start = performance.now();
        for (let i = 0; i < 1000; i++) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        }
        const duration = performance.now() - start;
        return 1000 / duration;
    }

    const api = getBestGraphicsAPI();
    const gpuInfo = getGPUInfo();
    const perfScore = await benchmarkWebGL();

    const cpuThreads = navigator.hardwareConcurrency || "Unknown";
    const deviceMemory = navigator.deviceMemory || "Unknown";

    const stats = {
        api,
        gpu: gpuInfo,
        cpuThreads,
        deviceMemoryGB: deviceMemory,
        webglPerfScore: perfScore.toFixed(2),
    };

    let chosenAPI = "Canvas2D";

    if (api === "WebGPU" && perfScore > 30 && cpuThreads >= 4 && deviceMemory >= 4) {
        chosenAPI = "WebGPU";
    } else if ((api === "WebGL2" || api === "WebGL") && perfScore > 15) {
        chosenAPI = api;
    }

    if (log) {
        console.log("Graphics Decision Stats:", stats);
        console.log("Chosen API:", chosenAPI);
    }

    return { chosenAPI, stats };
}