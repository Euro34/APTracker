export class PanZoom {
	private viewPort: HTMLElement;
	private container: HTMLElement;
	private content: HTMLVideoElement;
	private overlay: HTMLCanvasElement[];

    private needsTransform = false;
    public readonly OVERLAY_SCALE = 2;
	private zoom = 1;
	private panX = 0;
	private panY = 0;

	// pan state
	private isPanning = false;
	private panStartX = 0;
	private panStartY = 0;
	private panStartOffsetX = 0;
	private panStartOffsetY = 0;

	// Values are in [0,1] relative to video dimensions, or null if outside
	public normMousePos: { x: number; y: number } | null = null;

	// Callbacks
	public onLeftClick?: (pos: { x: number; y: number }) => void;
    public onMiddleClick?: (pos: { x: number; y: number }) => void;
	public onRightClick?: (pos: { x: number; y: number }) => void;
    public onRedraw?: () => void;
    public onMouseMove?: (pos: { x: number; y: number } | null) => void;

	constructor(viewPort: HTMLElement, container: HTMLElement, content: HTMLVideoElement, overlays: HTMLCanvasElement[]) {
		this.viewPort = viewPort;
		this.container = container;
		this.content = content;
		this.overlay = overlays;
		this.bindEvents();

        new ResizeObserver(() => {
            if (this.viewPort.clientWidth === 0 || this.viewPort.clientHeight === 0) return;
            if (this.needsTransform) {
                this.needsTransform = false;
                this.applyTransform();
            }
        }).observe(this.viewPort);
	}

	public resetView(): void {
		this.zoom = 1;
		this.panX = 0;
		this.panY = 0;
		this.applyTransform();
	}

	private bindEvents(): void {
		// Track normalized mouse position whenever cursor moves over viewport
		this.viewPort.addEventListener("mousemove", (e) => {
			this.normMousePos = this.toNorm(e);
            this.onMouseMove?.(this.normMousePos);
		});
		this.viewPort.addEventListener("mouseleave", () => {
			this.normMousePos = null;
            this.onMouseMove?.(this.normMousePos);
		});

		// fire callback with normalized position
		this.viewPort.addEventListener("mousedown", (e) => {
            const pos = this.toNorm(e);

            if (e.button === 0) {
                if (pos) this.onLeftClick?.(pos);
            } else if (e.button === 1) {
                if (pos) this.onMiddleClick?.(pos);
            }else if (e.button === 2) {
                if (pos) this.onRightClick?.(pos);
            }
		});

        this.viewPort.addEventListener("contextmenu", (e) => {
            e.preventDefault();
        });

		// Scroll wheel — zoom toward cursor
		this.viewPort.addEventListener("wheel", (e) => {
			e.preventDefault();
			const factor = -e.deltaY/1000 + 1;
			const newZoom = Math.min(Math.max(this.zoom * factor, 1), 20);

			const rect = this.viewPort.getBoundingClientRect();
			const mx = e.clientX - rect.left - rect.width / 2;
			const my = e.clientY - rect.top - rect.height / 2;
			this.panX = mx - (newZoom / this.zoom) * (mx - this.panX);
			this.panY = my - (newZoom / this.zoom) * (my - this.panY);
			this.zoom = newZoom;

			this.clampPan();
			this.applyTransform();
            this.onRedraw?.();
		}, { passive: false });

		this.viewPort.addEventListener("mousedown", (e) => {
			if (e.button !== 2) return;
			e.preventDefault();
			this.isPanning = true;
			this.panStartX = e.clientX;
			this.panStartY = e.clientY;
			this.panStartOffsetX = this.panX;
			this.panStartOffsetY = this.panY;
		});

		window.addEventListener("mousemove", (e) => {
			if (!this.isPanning) return;
			this.panX = this.panStartOffsetX + (e.clientX - this.panStartX);
			this.panY = this.panStartOffsetY + (e.clientY - this.panStartY);
			this.clampPan();
			this.applyTransform();
            this.onRedraw?.();
		});

		window.addEventListener("mouseup", (e) => {
			if (e.button === 2) this.isPanning = false;
		});
	}


	// Private — coordinate helpers
	private toNorm(e: MouseEvent): { x: number; y: number } | null {
		const rect = this.container.getBoundingClientRect();
		const x = (e.clientX - rect.left) / rect.width;
		const y = (e.clientY - rect.top) / rect.height;
		if (x < 0 || x > 1 || y < 0 || y > 1) return null;
		return { x, y };
	}

	// Transform
	private clampPan(): void {
        const vpW = this.viewPort.clientWidth;
        const vpH = this.viewPort.clientHeight;
        const maxX = ((this.zoom - 1) / 2) * vpW;
        const maxY = ((this.zoom - 1) / 2) * vpH;
        this.panX = Math.min(Math.max(this.panX, -maxX), maxX);
        this.panY = Math.min(Math.max(this.panY, -maxY), maxY);
    }

    public fitCanvasToVideo(): void {
        const vw = this.content.videoWidth;
        const vh = this.content.videoHeight;
        if (!vw || !vh) return;
        for (const canvas of this.overlay) {
            canvas.width = vw * this.OVERLAY_SCALE;
            canvas.height = vh * this.OVERLAY_SCALE;
        }
    }

	private applyTransform(): void {
        const vpW = this.viewPort.clientWidth;
        const vpH = this.viewPort.clientHeight;

        if (vpW === 0 || vpH === 0) {
            this.needsTransform = true;
            return;
        }
        
        const vw = this.content.videoWidth || vpW;
        const vh = this.content.videoHeight || vpH;
        const scale = Math.min(vpW / vw, vpH / vh);
        const fitW = vw * scale * this.zoom;
        const fitH = vh * scale * this.zoom;
        
        this.container.style.width = `${fitW}px`;
        this.container.style.height = `${fitH}px`;
        this.content.style.width = `${fitW}px`;
        this.content.style.height = `${fitH}px`;

        for (const canvas of this.overlay) {
            canvas.style.width = `${fitW}px`;
            canvas.style.height = `${fitH}px`;
        }

        this.container.style.position = 'absolute';
        this.container.style.left = '50%';
        this.container.style.top = '50%';
        this.container.style.transform =
            `translate(calc(-50% + ${this.panX}px), calc(-50% + ${this.panY}px))`;
    }
}