import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Point2D } from '../core/Types'
import { PanZoom } from '../core/PanZoom';

import { apTracker } from '../main';

document.getElementById("open-refObjMarker")!.addEventListener("click", () => {
    document.querySelector(".RefObjMarker")!.classList.add("active");
    document.getElementById("loading-screen")!.classList.add("show");
});

document.getElementById("close-refObjMarker")!.addEventListener("click", () => {
    document.querySelector(".RefObjMarker")!.classList.remove("active");
    document.getElementById("loading-screen")!.classList.remove("show");
	refObjMarker.updateMain();
});

// Color handler
function cornerColor(index: number): { r: number, g: number, b: number } {
	const r = ((index & 1) * 200) + 50;
	const g = (((index >> 1) & 1) * 200) + 50;
	const b = (((index >> 2) & 1) * 200) + 50;
	return { r, g, b };
}

function cornerThreeColor(index: number): THREE.Color {
	const { r, g, b } = cornerColor(index);
	return new THREE.Color(r / 255, g / 255, b / 255);
}

// Separate video management
class VideoState {
    public file: File = new File([], '');
	public frameTimestamps: number[] = [];
	public marks: (Point2D | null)[] = Array(8).fill(null);
	public startFrame = 0;
	public endFrame = 0;
	private _currentTime = 0;

    get hasVideo(): boolean { return this.file.size > 0 && this.frameTimestamps.length > 0; }
	get startTime(): number { return this.frameTimestamps[this.startFrame] ?? 0; }
	get endTime(): number { return this.frameTimestamps[this.endFrame] ?? 0; }
	get currentTime(): number { return this._currentTime; }
	get duration(): number { return this.endTime - this.startTime; }

	set currentTime(time: number) {
		this._currentTime = Math.min(Math.max(time, this.startTime), this.endTime);
	}

    public updateVideo(file: File, timestamps: number[], currentTime : number | null = null, marks: (Point2D | null)[] = Array(8).fill(null)) {
		this.file = file;
		this.frameTimestamps = timestamps;
		this.currentTime = currentTime ?? this.startTime;
		this.marks = marks;
	}

	public updateTrim(startFrame: number, endFrame: number) {
		this.startFrame = startFrame;
		this.endFrame = endFrame;
		this.currentTime = Math.min(Math.max(this.currentTime, this.startTime), this.endTime);
	}

    public reset() {
		this.file = new File([], '');
		this.frameTimestamps = [];
		this.marks = Array(8).fill(null);
		this.startFrame = 0;
		this.endFrame = 0;
	}
}

// One video and marking
class VideoManager {
	private viewPort = document.getElementById("ref-viewport") as HTMLDivElement;
	private container = document.getElementById("video-container-ref") as HTMLDivElement;
	private video = document.getElementById("ref-video") as HTMLVideoElement;
	private markOverlay = document.getElementById("ref-mark-overlay") as HTMLCanvasElement;
	private guideOverlay = document.getElementById("ref-guide-overlay") as HTMLCanvasElement;
	// private boxOverlay = document.getElementById("ref-box-overlay") as HTMLCanvasElement;

	private playBtn = this.viewPort.querySelector(".play") as HTMLButtonElement;
	private playBar = this.viewPort.querySelector(".play-bar") as HTMLDivElement;
	private playhead = this.viewPort.querySelector(".playhead") as HTMLDivElement;
	private timeDisplay = this.viewPort.querySelector(".time") as HTMLDivElement;

	private deleteBtn = this.viewPort.querySelector(".delete") as HTMLButtonElement;

	private isScrubbing = false;
	private wasPlayingBeforeScrub = false;

	private selectedCorner = 0;
	private videoState: VideoState;

	private panZoom = new PanZoom(this.viewPort, this.container, this.video, [this.markOverlay, this.guideOverlay]);
	private readonly dotRadius = 3.5;

	constructor(state: VideoState) {
		this.videoState = state;

		this.playBtn.addEventListener('click', () => this.togglePlay());
		this.deleteBtn.addEventListener('click', () => this.deleteMark(this.selectedCorner));

		this.video.addEventListener('timeupdate', () => this.updatePlayhead());

		this.bindScrubEvents();

		this.panZoom.onLeftClick = (pos) => {
			if (!this.videoState.hasVideo) return;
			this.videoState.marks[this.selectedCorner] = pos;
			this.drawMarks();
		};
		this.panZoom.onMiddleClick = (pos) => {
			if (!this.videoState.hasVideo) return;
			this.deleteMarkAtPos(pos);
		};
		this.panZoom.onRedraw = () => {
			if (!this.videoState.hasVideo) return;
			this.drawMarks();
		};
		this.panZoom.onMouseMove = (pos) => {
			if (!this.videoState.hasVideo) return;
			this.drawGuideLines(pos);
		}
	}

	public updateSelectedCorner(index: number): void {
		this.selectedCorner = index;
		this.drawMarks();
		this.drawGuideLines(null);
	}
	
	public updateVideoState(videoState: VideoState): void {
		this.videoState = videoState;
		const url = URL.createObjectURL(videoState.file);

		if (videoState.hasVideo) {
			this.video.src = url;
			this.viewPort.classList.add('video-loaded');
		} else {
			this.viewPort.classList.remove('video-loaded');
		}

		this.pause();
		this.video.load();
		
		this.video.addEventListener('loadeddata', () => {
			this.video.currentTime = this.videoState.currentTime
			this.updatePlayhead();
			this.panZoom.resetView();
			this.panZoom.fitCanvasToVideo();
			this.drawMarks();
		}, { once: true });
	}

	private togglePlay(): void {
		if (!this.videoState.hasVideo) return;
		if (this.video.paused) {
			this.play();
		} else {
			this.pause();
		}
	}

	private play() {
		this.video.play();
		this.updatePlayBtn(true);
	}

	private pause() {
		this.video.pause();
		this.updatePlayBtn(false);
	}

	private updatePlayBtn(playing: boolean) {this.playBtn.textContent = playing ? "⏸\uFE0E" : "▶\uFE0E";}

	private updatePlayhead(): void {
		this.videoState.currentTime = this.video.currentTime;
		const currentTime = this.video.currentTime - this.videoState.startTime;
		const duration = this.videoState.duration;
		if (duration > 0) {
			const progress = currentTime / duration;
			this.playhead.style.left = `${Math.min(Math.max(progress, 0), 1) * 100}%`;
			this.timeDisplay.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(this.videoState.duration)}`;
		} else {
			this.playhead.style.left = '0%';
			this.timeDisplay.textContent = `0.00 / 0.00`;
		}
		if (currentTime >= duration) {
			this.pause();
			this.video.currentTime = this.videoState.startTime;
		}
		if (currentTime < 0) {
			this.video.currentTime = this.videoState.startTime;
		}
	}

	private formatTime(seconds: number): string {
		const secs = seconds;
		return `${secs.toFixed(2).toString().padStart(2, '0')}`;
	}

	private bindScrubEvents(): void {
		this.playBar.addEventListener("mousedown", (e) => {
			if (!this.videoState.hasVideo) return;
			this.isScrubbing = true;
			this.wasPlayingBeforeScrub = !this.video.paused;
			this.pause();
			this.scrubToEvent(e);
			e.preventDefault();
		});

		window.addEventListener("mousemove", (e) => {
			if (!this.isScrubbing) return;
			this.scrubToEvent(e);
		});

		window.addEventListener("mouseup", () => {
			if (!this.isScrubbing) return;
			this.isScrubbing = false;
			if (this.wasPlayingBeforeScrub) this.play();
		});

	}

	private scrubToEvent(e: MouseEvent): void {
		const rect = this.playBar.getBoundingClientRect();
		const progress = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
		const newTime = this.videoState.startTime + progress * this.videoState.duration;
		this.video.currentTime = newTime;
		// Update playhead immediately
		this.playhead.style.left = `${progress * 100}%`;
	}

	private drawMarks(): void {
		const ctx = this.markOverlay.getContext('2d')!;
		const W = this.markOverlay.width;
		const H = this.markOverlay.height;
		const S = this.panZoom.OVERLAY_SCALE;
		ctx.clearRect(0, 0, W, H);

		for (let i = 0; i < 8; i++) {
			const mark = this.videoState.marks[i];
			if (!mark) continue;

			const cx = mark.x * W;
			const cy = mark.y * H;
			const { r, g, b } = cornerColor(i);
			const radius = (i === this.selectedCorner ? this.dotRadius * 1.5 : this.dotRadius) * S; // scale radius too

			ctx.beginPath();
			ctx.arc(cx, cy, radius, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
			ctx.fill();

			ctx.beginPath();
			ctx.arc(cx, cy, radius, 0, Math.PI * 2);
			ctx.strokeStyle = 'rgba(0,0,0,0.8)';
			ctx.lineWidth = 1.5 * S;
			ctx.stroke();
		}
	}

	private drawGuideLines(pos: Point2D | null): void {
		const ctx = this.guideOverlay.getContext('2d')!;
		const W = this.guideOverlay.width;
		const H = this.guideOverlay.height;
		const S = this.panZoom.OVERLAY_SCALE;
		
		ctx.clearRect(0, 0, W, H);
		if (!pos) return;
		if (this.videoState.marks[this.selectedCorner] !== null) return;

		// x-axis
		const pointx = this.videoState.marks[this.selectedCorner ^ 1];
		if (pointx) {
			ctx.beginPath();
			ctx.moveTo(pos.x * W, pos.y * H);
			ctx.lineTo(pointx.x * W, pointx.y * H);
			ctx.strokeStyle = 'rgba(255,0,0,0.3)';
			ctx.lineWidth = 1 * S;
			ctx.stroke();
		}

		// y-axis
		const pointy = this.videoState.marks[this.selectedCorner ^ 2];
		if (pointy) {
			ctx.beginPath();
			ctx.moveTo(pos.x * W, pos.y * H);
			ctx.lineTo(pointy.x * W, pointy.y * H);
			ctx.strokeStyle = 'rgba(0,255,0,0.3)';
			ctx.lineWidth = 1 * S;
			ctx.stroke();
		}

		// z-axis
		const pointz = this.videoState.marks[this.selectedCorner ^ 4];
		if (pointz) {
			ctx.beginPath();
			ctx.moveTo(pos.x * W, pos.y * H);
			ctx.lineTo(pointz.x * W, pointz.y * H);
			ctx.strokeStyle = 'rgba(0,0,255,0.3)';
			ctx.lineWidth = 1 * S;
			ctx.stroke();
		}
	}

	private deleteMarkAtPos(pos: Point2D): void {
		const S = this.panZoom.OVERLAY_SCALE;

		this.videoState.marks.forEach((mark, index) => {
			if (!mark) return;

			const dotRadiusPx = this.dotRadius * 1.5 * S;

			const normRadiusX = dotRadiusPx / this.markOverlay.width;
			const normRadiusY = dotRadiusPx / this.markOverlay.height;
			const normRadius = (normRadiusX + normRadiusY) / 2;

			const dist = Point2D.distanceBetween(pos, mark);
			if (dist < normRadius * 1.5) {
				this.deleteMark(index);
			}
		});
	}

	private deleteMark(index: number) {
		this.videoState.marks[index] = null;
		this.drawMarks();
	}
}

class Ref3DWidget {
	private renderer: THREE.WebGLRenderer;
	private controls: OrbitControls | null = null;
	private animationFrameId: number | null = null;
 
	private W = 0;
	private H = 0;

	// // Current dimensions
	private boxW = 0.001;
	private boxL = 0.001;
	private boxH = 0.001;
	private selectedCorner = 0;
 
	constructor() {
        const container = document.getElementById('ref-3d-widget')!;

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		container.appendChild(this.renderer.domElement);

		new ResizeObserver(() => {
			const w = container.clientWidth;
			const h = container.clientHeight;

			if (w === 0 || h === 0) return;
			this.W = w;
			this.H = h;
			this.renderer.setSize(w, h);
			this.render();
		}).observe(container);
	}

    cornerPosition(index: number, w: number, l: number, h: number): THREE.Vector3 {
        const x = (index & 1) === 0 ? 0 : w;
        const y = ((index >> 1) & 1) === 0 ? 0 : l;
        const z = ((index >> 2) & 1) === 0 ? 0 : h;
        return new THREE.Vector3(x, y, z);
    }
 
	setDimensions(w: number, l: number, h: number): void {
		this.boxW = w
		this.boxL = l
		this.boxH = h
		this.render();
	}
 
	setSelectedCorner(index: number): void {
		this.selectedCorner = index;
		this.render();
	}
 
	private render(): void {
		const width  = this.boxW  > 0 ? this.boxW  : 0;
		const length = this.boxL  > 0 ? this.boxL  : 0;
		const height = this.boxH  > 0 ? this.boxH  : 0;
 
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
 
		if (this.controls !== null) {
			this.controls.dispose();
			this.controls = null;
		}
 
		const maxDim = Math.max(width, length, height, 1);
 
		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x1a1a2e);
 
		const camera = new THREE.PerspectiveCamera(30, this.W / this.H, 0.1, 1000);
		camera.up.set(0, 0, 1);
		camera.position.set(maxDim * 2, -maxDim * 3, maxDim * 2);
		camera.lookAt(width / 2, length / 2, height / 2);
 
		this.controls = new OrbitControls(camera, this.renderer.domElement);
		this.controls.target.set(width / 2, length / 2, height / 2);
		camera.up.set(0, 0, 1);
		this.controls.update();
 
		const boxGeo = new THREE.BoxGeometry(
			Math.max(Math.abs(width),  0.001),
			Math.max(Math.abs(length), 0.001),
			Math.max(Math.abs(height), 0.001),
		);
		const boxMat = new THREE.MeshPhongMaterial({
			color: 0x4fc3f7,
			opacity: 0.18,
			transparent: true,
		});
		const box = new THREE.Mesh(boxGeo, boxMat);
		box.position.set(width / 2, length / 2, height / 2);
		scene.add(box);
 
		const wireframe = new THREE.LineSegments(
			new THREE.EdgesGeometry(boxGeo),
			new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true }),
		);
		wireframe.position.copy(box.position);
		scene.add(wireframe);
 
		const arrowLength = maxDim * 0.8;
		const headLength  = arrowLength * 0.2;
		const headWidth   = arrowLength * 0.15;
		const arrowDefs: [THREE.Vector3, number][] = [
			[new THREE.Vector3(1, 0, 0), 0xff4444],
			[new THREE.Vector3(0, 1, 0), 0x44ff44],
			[new THREE.Vector3(0, 0, 1), 0x4444ff],
		];
		for (const [dir, color] of arrowDefs) {
			scene.add(new THREE.ArrowHelper(
				dir,
				new THREE.Vector3(0, 0, 0),
				arrowLength,
				color,
				headLength,
				headWidth,
			));
		}
 
		const sphereR = maxDim * 0.06;
		for (let i = 0; i < 8; i++) {
			const pos = this.cornerPosition(i, width, length, height);
			const isSelected = i === this.selectedCorner;
			const radius = isSelected ? sphereR * 1.6 : sphereR;
 
			const geo = new THREE.SphereGeometry(radius, 14, 14);
			const mat = new THREE.MeshPhongMaterial({
				color: cornerThreeColor(i),
				shininess: 60,
			});
			const mesh = new THREE.Mesh(geo, mat);
			mesh.position.copy(pos);
			scene.add(mesh);
		}
 
		scene.add(new THREE.AmbientLight(0xffffff, 0.5));
		const dirLight = new THREE.DirectionalLight(0xffffff, 1);
		dirLight.position.set(maxDim * 3, maxDim * 3, maxDim * 3);
		scene.add(dirLight);
 
		const animate = () => {
			this.animationFrameId = requestAnimationFrame(animate);
			this.controls!.update();
			this.renderer.render(scene, camera);
		};
		animate();
	}
}

class RefObjMarker {
	private fileCache: Map<string, { file: File; timestamps: number[] }> = new Map();

	private stateA = new VideoState();
	private stateB = new VideoState();
	private activeState: 'a' | 'b' = 'a';

	private refMarkerVideo = new VideoManager(this.stateA);

    private widget: Ref3DWidget;
	private cornerBtn: NodeListOf<HTMLButtonElement>;
	private vidABtn: HTMLButtonElement;
	private vidBBtn: HTMLButtonElement;

    constructor() {
		this.widget = new Ref3DWidget();

		this.cornerBtn = document.querySelectorAll<HTMLButtonElement>(".corner-btn")
		this.cornerBtn.forEach(btn => {
			btn.addEventListener('click', () => {
				const idx = parseInt(btn.dataset.corner!);
				this.selectCorner(idx);
			});
		});

		this.vidABtn = document.getElementById("vid-btn-a") as HTMLButtonElement;
		this.vidBBtn = document.getElementById("vid-btn-b") as HTMLButtonElement;
		this.vidABtn.addEventListener('click', () => this.selectVideo('a'));
		this.vidABtn.setAttribute("disabled", "true");
		this.vidABtn.classList.add("disabled");
		this.vidBBtn.addEventListener('click', () => this.selectVideo('b'));
		this.vidBBtn.setAttribute("disabled", "true");
		this.vidBBtn.classList.add("disabled");
	}

	public updateVideo(files: File[], frameTimestamps: number[][]) {
		const incoming = new Map<string, { file: File; timestamps: number[] }>();
		files.forEach((f, i) => {
			incoming.set(f.name, { file: f, timestamps: frameTimestamps[i] ?? [] });
		});

		// Sync cache
		for (const name of this.fileCache.keys()) {
			if (!incoming.has(name)) this.fileCache.delete(name);
		}
		for (const [name, data] of incoming) {
			this.fileCache.set(name, data);
		}

		const aStillPresent = this.stateA.file.name !== "" && this.fileCache.has(this.stateA.file.name);
		const bStillPresent = this.stateB.file.name !== "" && this.fileCache.has(this.stateB.file.name);

		const bStateSnapshot = bStillPresent ? { currentTime: this.stateB.currentTime,  marks: this.stateB.marks}: null;

		if (!aStillPresent) this.stateA.reset();
		if (!bStillPresent) this.stateB.reset();

		// Shift B -> A
		if (!this.stateA.hasVideo && this.stateB.hasVideo && bStateSnapshot) {
			this.stateA.updateVideo(this.stateB.file, this.stateB.frameTimestamps, bStateSnapshot.currentTime, bStateSnapshot.marks);
			this.stateB.reset();
		}

		const newFiles = [...this.fileCache.values()].filter(
			d => d.file.name !== this.stateA.file.name && d.file.name !== this.stateB.file.name
		);
		for (const data of newFiles) {
			if (!this.stateA.hasVideo) {
				this.stateA.updateVideo(data.file, data.timestamps);
			} else if (!this.stateB.hasVideo) {
				this.stateB.updateVideo(data.file, data.timestamps);
			}
		}

		this.syncButtonStates();
		this.selectVideo('a');
		this.updateMain();
	}

	private syncButtonStates(): void {
		this.vidABtn.toggleAttribute('disabled', !this.stateA.hasVideo);
		this.vidABtn.classList.toggle('disabled', !this.stateA.hasVideo);
		this.vidBBtn.toggleAttribute('disabled', !this.stateB.hasVideo);
		this.vidBBtn.classList.toggle('disabled', !this.stateB.hasVideo);
	}

	public updateTrim(trimStates: (number|null)[]) {
		const [start1, end1, start2, end2] = trimStates;
		if (start1 !== null && end1 !== null) {
			this.stateA.updateTrim(start1, end1);
		}
		if (start2 !== null && end2 !== null) {
			this.stateB.updateTrim(start2, end2);
		}
		
		this.selectVideo(this.activeState);
	}

	public updateBoxDimensions(width: number | null, length: number | null, height: number | null) {
        this.widget!.setDimensions(width ?? 0, length ?? 0, height ?? 0);
    }

	private selectCorner(index: number): void {
		this.cornerBtn.forEach(btn => {btn.classList.remove("selected")});
		this.cornerBtn[index].classList.add("selected");

		this.widget!.setSelectedCorner(index);
		this.refMarkerVideo.updateSelectedCorner(index);
	}

	private selectVideo(video: 'a' | 'b'): void {
		if (video === 'a') {
			this.vidABtn.classList.add("active");
			this.vidBBtn.classList.remove("active");
			this.refMarkerVideo.updateVideoState(this.stateA);
		} else {
			this.vidBBtn.classList.add("active");
			this.vidABtn.classList.remove("active");
			this.refMarkerVideo.updateVideoState(this.stateB);
		}
	}

	public updateMain() {
		apTracker.updateReferenceCorners([this.stateA.marks, this.stateB.marks]);
	}
}

export let refObjMarker = new RefObjMarker();