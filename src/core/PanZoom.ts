export class PanZoom {
	private viewPort: HTMLElement;
	private container: HTMLElement;
	private content: HTMLVideoElement;
	private overlay: HTMLCanvasElement;

	private zoom = 1;
	private panX = 0;
	private panY = 0;

	// Middle-mouse pan state
	private isPanning = false;
	private panStartX = 0;
	private panStartY = 0;
	private panStartOffsetX = 0;
	private panStartOffsetY = 0;

	// Expose normalized mouse position for VideoManager to read
	// Values are in [0,1] relative to video dimensions, or null if outside
	public normMousePos: { x: number; y: number } | null = null;

	// Callbacks VideoManager can hook into
	public onLeftClick?: (pos: { x: number; y: number }) => void;
	public onRightClick?: (pos: { x: number; y: number }) => void;

	constructor(
		viewPort: HTMLElement,
		container: HTMLElement,
		content: HTMLVideoElement,
		overlay: HTMLCanvasElement,
	) {
		this.viewPort = viewPort;
		this.container = container;
		this.content = content;
		this.overlay = overlay;
		this.bindEvents();
	}

	public resetView(): void {
		this.zoom = 1;
		this.panX = 0;
		this.panY = 0;
		this.applyTransform();
	}

	// ----------------------------------------------------------------
	// Private — events
	// ----------------------------------------------------------------

	private bindEvents(): void {
		// Track normalized mouse position whenever cursor moves over viewport
		this.viewPort.addEventListener("mousemove", (e) => {
			this.normMousePos = this.toNorm(e);
		});
		this.viewPort.addEventListener("mouseleave", () => {
			this.normMousePos = null;
		});

		// Left click — fire callback with normalized position
		this.viewPort.addEventListener("click", (e) => {
			const pos = this.toNorm(e);
			if (pos) this.onLeftClick?.(pos);
		});

		// Right click — fire callback with normalized position
		this.viewPort.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			const pos = this.toNorm(e);
			if (pos) this.onRightClick?.(pos);
		});

		// Scroll wheel — zoom toward cursor
		this.viewPort.addEventListener("wheel", (e) => {
			e.preventDefault();
			const factor = e.deltaY < 0 ? 1.1 : 0.9;
			const newZoom = Math.min(Math.max(this.zoom * factor, 1), 20);

			// Zoom toward the mouse position rather than the centre
			// by adjusting pan so the point under the cursor stays fixed
			const rect = this.viewPort.getBoundingClientRect();
			const mx = e.clientX - rect.left - rect.width / 2;
			const my = e.clientY - rect.top - rect.height / 2;
			this.panX = mx - (newZoom / this.zoom) * (mx - this.panX);
			this.panY = my - (newZoom / this.zoom) * (my - this.panY);
			this.zoom = newZoom;

			this.clampPan();
			this.applyTransform();
		}, { passive: false });

		// Middle mouse — start pan
		this.viewPort.addEventListener("mousedown", (e) => {
			if (e.button !== 1) return;
			e.preventDefault();
			this.isPanning = true;
			this.panStartX = e.clientX;
			this.panStartY = e.clientY;
			this.panStartOffsetX = this.panX;
			this.panStartOffsetY = this.panY;
		});

		// Middle mouse — update pan (on window so drag doesn't break on leaving viewport)
		window.addEventListener("mousemove", (e) => {
			if (!this.isPanning) return;
			this.panX = this.panStartOffsetX + (e.clientX - this.panStartX);
			this.panY = this.panStartOffsetY + (e.clientY - this.panStartY);
			this.clampPan();
			this.applyTransform();
		});

		// Middle mouse — end pan
		window.addEventListener("mouseup", (e) => {
			if (e.button === 1) this.isPanning = false;
		});
	}

	// ----------------------------------------------------------------
	// Private — coordinate helpers
	// ----------------------------------------------------------------

	/**
	 * Convert a MouseEvent to normalized video coordinates [0,1].
	 * Returns null if the cursor is outside the video bounds.
	 *
	 * How it works:
	 *   1. Get cursor position relative to the container (which is
	 *      exactly the scaled video area).
	 *   2. Divide by container size to get [0,1] in screen space.
	 *   3. Because the container is always sized to match the video
	 *      aspect ratio, this is already correct normalized video space.
	 */
	private toNorm(e: MouseEvent): { x: number; y: number } | null {
		const rect = this.container.getBoundingClientRect();
		const x = (e.clientX - rect.left) / rect.width;
		const y = (e.clientY - rect.top) / rect.height;
		if (x < 0 || x > 1 || y < 0 || y > 1) return null;
		return { x, y };
	}

	// ----------------------------------------------------------------
	// Private — transform
	// ----------------------------------------------------------------

	private clampPan(): void {
		const vpW = this.viewPort.clientWidth;
		const vpH = this.viewPort.clientHeight;
		const maxX = ((this.zoom - 1) / 2) * vpW;
		const maxY = ((this.zoom - 1) / 2) * vpH;
		this.panX = Math.min(Math.max(this.panX, -maxX), maxX);
		this.panY = Math.min(Math.max(this.panY, -maxY), maxY);
	}

	private applyTransform(): void {
		const vpW = this.viewPort.clientWidth;
		const vpH = this.viewPort.clientHeight;

		const vw = this.content.videoWidth || vpW;
		const vh = this.content.videoHeight || vpH;
		const scale = Math.min(vpW / vw, vpH / vh);
		const fitW = vw * scale * this.zoom;
		const fitH = vh * scale * this.zoom;

		this.container.style.width = `${fitW}px`;
		this.container.style.height = `${fitH}px`;
		this.content.style.width = `${fitW}px`;
		this.content.style.height = `${fitH}px`;
		this.overlay.width = fitW;
		this.overlay.height = fitH;
		this.overlay.style.width = `${fitW}px`;
		this.overlay.style.height = `${fitH}px`;

		this.container.style.position = 'absolute';
		this.container.style.left = '50%';
		this.container.style.top = '50%';
		this.container.style.transform =
			`translate(calc(-50% + ${this.panX}px), calc(-50% + ${this.panY}px))`;
	}
}