export class MalosUIManager {
    constructor(engine) {
        this.engine = engine;
        this.elements = new Map();
        this.context = null;
        this.canvas = null;

        if (this.engine.Graphics && this.engine.Graphics.canvas) {
            this.canvas = this.engine.Graphics.canvas;
            this.context = this.canvas.getContext('2d');
        } else {
            console.warn("[UIManager] No graphics context found. Rendering disabled.");
        }
    }

    createElement(id, type, options = {}) {
        const element = {
            id,
            type,
            x: options.x || 0,
            y: options.y || 0,
            width: options.width || 100,
            height: options.height || 40,
            text: options.text || "",
            color: options.color || "#fff",
            background: options.background || "#000",
            visible: true,
            onClick: options.onClick || null,
        };
        this.elements.set(id, element);
        return element;
    }

    removeElement(id) {
        this.elements.delete(id);
    }

    render() {
        if (!this.context) return;

        for (const element of this.elements.values()) {
            if (!element.visible) continue;
            this.context.fillStyle = element.background;
            this.context.fillRect(element.x, element.y, element.width, element.height);

            if (element.text) {
                this.context.fillStyle = element.color;
                this.context.font = "16px sans-serif";
                this.context.textAlign = "center";
                this.context.textBaseline = "middle";
                this.context.fillText(
                    element.text,
                    element.x + element.width / 2,
                    element.y + element.height / 2
                );
            }
        }
    }

    handleClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        for (const element of this.elements.values()) {
            if (
                element.visible &&
                x >= element.x &&
                x <= element.x + element.width &&
                y >= element.y &&
                y <= element.y + element.height
            ) {
                if (typeof element.onClick === "function") {
                    element.onClick();
                }
                break;
            }
        }
    }

    attachInput() {
        if (this.canvas) {
            this.canvas.addEventListener("click", e => this.handleClick(e));
        }
    }
}