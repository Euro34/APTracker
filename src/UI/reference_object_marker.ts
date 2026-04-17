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
	refObjMarker.close();
});

// Color handler
function cornerColor(index: number): { r: number, g: number, b: number } {
	const r = ((index & 1) * 200) + 50;
	const g = (((index >> 1) & 1) * 200) + 50;
	const b = (((index >> 2) & 1) * 200) + 50;
	return { r, g, b };
}

// function cornerCss(index: number, alpha = 0.50): string {
// 	const { r, g, b } = cornerColor(index);
// 	return `rgba(${r},${g},${b},${alpha})`;
// }

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
	public currentTime = 0;

    get hasVideo(): boolean { return this.file.size > 0 && this.frameTimestamps.length > 0; }
	get startTime(): number { return this.frameTimestamps[this.startFrame] ?? 0; }
	get endTime(): number { return this.frameTimestamps[this.endFrame] ?? 0; }
	get duration(): number { return this.endTime - this.startTime; }

    public updateVideo(file: File, timestamps: number[], startFrame = 0, endFrame = 0, currentTime : number | null = null, marks: (Point2D | null)[] = Array(8).fill(null)) {
		this.file = file;
		this.frameTimestamps = timestamps;
		this.startFrame = startFrame;
		this.endFrame = endFrame;
		this.currentTime = currentTime ?? this.startTime;
		this.marks = marks;
	}

    public reset() {
		this.file = new File([], '');
		this.frameTimestamps = [];
		this.marks = Array(8).fill(null);
		this.startFrame = 0;
		this.endFrame = 0;
	}

    public getPoints(): Array<Point2D | null> {
		return [...this.marks];
	}

	public setMark(cornerIndex: number, point: Point2D): void {
		this.marks[cornerIndex] = point;
	}

	public removeMark(cornerIndex: number): void {
		this.marks[cornerIndex] = null;
	}

	public markedCount(): number {
		return this.marks.filter(Boolean).length;
	}
}

// One video and marking
class VideoManager {
	private viewPort = document.getElementById("ref-viewport") as HTMLDivElement;
	private container = document.getElementById("video-container-ref") as HTMLDivElement;
	private video = document.getElementById("ref-video") as HTMLVideoElement;
	private overlay = document.getElementById("ref-overlay") as HTMLCanvasElement;

	private playBtn = this.viewPort.querySelector(".play") as HTMLButtonElement;
	private playBar = this.viewPort.querySelector(".play-bar") as HTMLDivElement;
	private playhead = this.viewPort.querySelector(".playhead") as HTMLDivElement;
	private timeDisplay = this.viewPort.querySelector(".time") as HTMLDivElement;

	private isScrubbing = false;
	private wasPlayingBeforeScrub = false;

	private selectedCorner = 0;
	private videoState: VideoState;

	private panZoom = new PanZoom(this.viewPort, this.container, this.video, this.overlay);

	constructor(state: VideoState) {
		this.videoState = state;

		this.playBtn.addEventListener('click', () => this.togglePlay());
		this.video.addEventListener('timeupdate', () => this.updatePlayhead());

		this.bindScrubEvents();

		this.panZoom.onLeftClick = (pos) => {
			if (!this.videoState.hasVideo) return;
			this.videoState.marks[this.selectedCorner] = pos;
			this.redrawMarks();
		};
		this.panZoom.onRightClick = (_) => {
			if (!this.videoState.hasVideo) return;
			this.videoState.marks[this.selectedCorner] = null;
			this.redrawMarks();
		};
	}

	public updateSelectedCorner(index: number): void {
		this.selectedCorner = index;
		this.redrawMarks();
	}
	
	public updateVideoState(videoState: VideoState): void {
		this.videoState = videoState;
		const url = URL.createObjectURL(videoState.file);

		this.pause();
		this.video.src = url;
		this.video.load();

		this.video.currentTime = videoState.currentTime;

		if (videoState.hasVideo) {
			this.viewPort.classList.add('video-loaded');
		} else {
			this.viewPort.classList.remove('video-loaded');
		}

		this.panZoom.resetView();
		this.updatePlayhead();
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
			const progress = (currentTime - this.videoState.startTime) / duration;
			this.playhead.style.left = `${Math.min(Math.max(progress, 0), 1) * 100}%`;
			this.timeDisplay.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(this.videoState.endTime)}`;
		} else {
			this.playhead.style.left = '0%';
			this.timeDisplay.textContent = `00:00 / 00:00`;
		}
		if (currentTime >= this.videoState.endTime) {
			this.pause();
			this.video.currentTime = this.videoState.startTime;
		}
	}

	private formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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

	public redrawMarks(): void {
		const ctx = this.overlay.getContext('2d')!;
		const W = this.overlay.width;
		const H = this.overlay.height;
		ctx.clearRect(0, 0, W, H);

		for (let i = 0; i < 8; i++) {
			const mark = this.videoState.marks[i];
			if (!mark) continue;

			const cx = mark.x * W;
			const cy = mark.y * H;
			const { r, g, b } = cornerColor(i);
			const radius = i === this.selectedCorner ? 7 : 5;

			ctx.beginPath();
			ctx.arc(cx, cy, radius, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
			ctx.fill();

			ctx.beginPath();
			ctx.arc(cx, cy, radius, 0, Math.PI * 2);
			ctx.strokeStyle = 'rgba(0,0,0,0.8)';
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}
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

	private videoA = new VideoState();
	private videoB = new VideoState();

	private refMarkerVideo = new VideoManager(this.videoA);

    private widget: Ref3DWidget;
	private cornerBtn: NodeListOf<HTMLButtonElement>;
	private vidABtn: HTMLButtonElement;
	private vidBBtn: HTMLButtonElement;

    constructor() {
		this.widget = new Ref3DWidget();

		this.cornerBtn = document.querySelectorAll<HTMLButtonElement>(".corner-btn")
		this.cornerBtn.forEach(btn => {
			btn.addEventListener('click', () => {
				const idx = parseInt(btn.dataset.corner ?? '-1', 10);
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

	public updateVideo(files: File[], frameTimestamps: number[][], trimState: (number|null)[]) {
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

		const aStillPresent = this.videoA.file.name !== "" && this.fileCache.has(this.videoA.file.name);
		const bStillPresent = this.videoB.file.name !== "" && this.fileCache.has(this.videoB.file.name);

		const bTrimSnapshot = bStillPresent ? { startFrame: this.videoB.startFrame, endFrame: this.videoB.endFrame, currentTime: this.videoB.currentTime,  marks: this.videoB.marks}: null;

		if (!aStillPresent) this.videoA.reset();
		if (!bStillPresent) this.videoB.reset();

		// Shift B -> A
		if (!this.videoA.hasVideo && this.videoB.hasVideo && bTrimSnapshot) {
			this.videoA.updateVideo(this.videoB.file, this.videoB.frameTimestamps, bTrimSnapshot.startFrame, bTrimSnapshot.endFrame, bTrimSnapshot.currentTime, bTrimSnapshot.marks);
			this.videoB.reset();
		}

		const newFiles = [...this.fileCache.values()].filter(
			d => d.file.name !== this.videoA.file.name && d.file.name !== this.videoB.file.name
		);
		for (const data of newFiles) {
			if (!this.videoA.hasVideo) {
				this.videoA.updateVideo(data.file, data.timestamps, trimState[0] ?? 0, trimState[1] ?? 0);
			} else if (!this.videoB.hasVideo) {
				this.videoB.updateVideo(data.file, data.timestamps, trimState[2] ?? 0, trimState[3] ?? 0);
			}
		}

		this.selectVideo('a');
		if (this.videoA.hasVideo) {
			this.vidABtn.removeAttribute("disabled");
			this.vidABtn.classList.remove("disabled");
		} else {
			this.vidABtn.setAttribute("disabled", "true");
			this.vidABtn.classList.add("disabled");
		}
		if (this.videoB.hasVideo) {
			this.vidBBtn.removeAttribute("disabled");
			this.vidBBtn.classList.remove("disabled");
		} else {
			this.vidBBtn.setAttribute("disabled", "true");
			this.vidBBtn.classList.add("disabled");
		}
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
			this.refMarkerVideo.updateVideoState(this.videoA);
		} else {
			this.vidBBtn.classList.add("active");
			this.vidABtn.classList.remove("active");
			this.refMarkerVideo.updateVideoState(this.videoB);
		}
	}

	public close() {
		apTracker.updateReferenceCorners([this.videoA.getPoints(), this.videoB.getPoints()]);
	}
}

export let refObjMarker = new RefObjMarker();