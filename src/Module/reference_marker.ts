import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Point2D } from '../core/Types'
import { VideoState } from '../core/VideoState'
import { PanZoom } from '../core/PanZoom';

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

// One video and marking
class VideoManager {
	private viewPort = document.getElementById("ref-viewport") as HTMLDivElement;
	private container = document.getElementById("video-container-ref") as HTMLDivElement;
	private video = document.getElementById("ref-video") as HTMLVideoElement;
	private markOverlay = document.getElementById("ref-mark-overlay") as HTMLCanvasElement;
	private guideOverlay = document.getElementById("ref-guide-overlay") as HTMLCanvasElement;
	private boxOverlay = document.getElementById("ref-box-overlay") as HTMLCanvasElement;

	private playBtn = this.viewPort.querySelector(".play") as HTMLButtonElement;
	private playBar = this.viewPort.querySelector(".play-bar") as HTMLDivElement;
	private playhead = this.viewPort.querySelector(".playhead") as HTMLDivElement;
	private timeDisplay = this.viewPort.querySelector(".time") as HTMLDivElement;

	private deleteBtn = this.viewPort.querySelector(".delete") as HTMLButtonElement;

	private isScrubbing = false;
	private wasPlayingBeforeScrub = false;

	private selectedCorner = 0;
	private state: VideoState;

	private panZoom = new PanZoom(this.viewPort, this.container, this.video, [this.markOverlay, this.guideOverlay, this.boxOverlay]);
	private readonly dotRadius = 3.5;

	constructor(state: VideoState) {
		this.state = state;
		this.state.addEventListener('trimChange', () => this.video.currentTime = this.state.refCurrentTime);

		this.playBtn.addEventListener('click', () => this.togglePlay());
		this.deleteBtn.addEventListener('click', () => this.deleteMark(this.selectedCorner));

		this.video.addEventListener('timeupdate', () => this.updatePlayhead());

		this.bindScrubEvents();

		this.panZoom.onLeftClick = (pos) => {
			if (!this.state.hasVideo) return;
			this.state.updateReferenceMarks(this.selectedCorner, pos);
			this.drawMarks();
		};
		this.panZoom.onMiddleClick = (pos) => {
			if (!this.state.hasVideo) return;
			this.deleteMarkAtPos(pos);
		};
		this.panZoom.onRedraw = () => {
			if (!this.state.hasVideo) return;
			this.drawMarks();
		};
		this.panZoom.onMouseMove = (pos) => {
			if (!this.state.hasVideo) return;
			this.drawGuideLines(pos);
		}
	}

	public updateSelectedCorner(index: number): void {
		this.selectedCorner = index;
		this.drawMarks();
		this.drawGuideLines(null);
	}
	
	public updateVideoState(videoState: VideoState): void {
		this.state = videoState;
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
			this.video.currentTime = this.state.refCurrentTime
			this.updatePlayhead();
			this.panZoom.resetView();
			this.panZoom.fitCanvasToVideo();
			this.drawMarks();
		}, { once: true });
	}

	private togglePlay(): void {
		if (!this.state.hasVideo) return;
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
		this.state.refCurrentTime = this.video.currentTime;
		const currentTime = this.video.currentTime - this.state.startTime;
		const duration = this.state.duration;
		if (duration > 0) {
			const progress = currentTime / duration;
			this.playhead.style.left = `${Math.min(Math.max(progress, 0), 1) * 100}%`;
			this.timeDisplay.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(this.state.duration)}`;
		} else {
			this.playhead.style.left = '0%';
			this.timeDisplay.textContent = `0.00 / 0.00`;
		}
		if (currentTime >= duration) {
			this.pause();
			this.video.currentTime = this.state.startTime;
		}
		if (currentTime < 0) {
			this.video.currentTime = this.state.startTime;
		}
	}

	private formatTime(seconds: number): string {
		const secs = seconds;
		return `${secs.toFixed(2).toString().padStart(2, '0')}`;
	}

	private bindScrubEvents(): void {
		this.playBar.addEventListener("mousedown", (e) => {
			if (!this.state.hasVideo) return;
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
		const newTime = this.state.startTime + progress * this.state.duration;
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
			const mark = this.state.referenceMarks[i];
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
		this.drawBoxLines();
	}

	private drawBoxLines(): void {
		const ctx = this.boxOverlay.getContext('2d')!;
		const W = this.boxOverlay.width;
		const H = this.boxOverlay.height;
		const S = this.panZoom.OVERLAY_SCALE;
		ctx.clearRect(0, 0, W, H);

		// Edge pairs per axis — each pair is [indexA, indexB] where they differ by one bit
		const AXIS_EDGES: [number, number][][] = [
			[[0,1],[2,3],[4,5],[6,7]], // X axis — bit 0
			[[0,2],[1,3],[4,6],[5,7]], // Y axis — bit 1
			[[0,4],[1,5],[2,6],[3,7]], // Z axis — bit 2
		];

		const AXIS_COLORS = [
			'rgba(255,0,0,',
			'rgba(0,255,0,',
			'rgba(0,120,255,',
		];

		type Vec3 = [number, number, number]; // homogeneous 2D point/line

		function toHomogeneous(p: Point2D, W: number, H: number): Vec3 {
			return [p.x * W, p.y * H, 1];
		}

		function cross(a: Vec3, b: Vec3): Vec3 {
			return [
				a[1]*b[2] - a[2]*b[1],
				a[2]*b[0] - a[0]*b[2],
				a[0]*b[1] - a[1]*b[0],
			];
		}

		function lineThrough(p1: Vec3, p2: Vec3): Vec3 {
			return cross(p1, p2);
		}

		function intersect(l1: Vec3, l2: Vec3): Point2D | null {
			const p = cross(l1, l2);
			if (Math.abs(p[2]) < 1e-9) return null; // parallel
			return { x: p[0] / p[2], y: p[1] / p[2] };
		}

		// Full length ray
		function rayToEdge(
			from: {x:number,y:number},
			through: {x:number,y:number},
			W: number, H: number
		): {x:number,y:number} {
			const dx = through.x - from.x;
			const dy = through.y - from.y;
			if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return through;

			// Find t values for all 4 canvas edges
			const ts: number[] = [];
			if (Math.abs(dx) > 1e-9) {
				ts.push((0 - from.x) / dx);
				ts.push((W - from.x) / dx);
			}
			if (Math.abs(dy) > 1e-9) {
				ts.push((0 - from.y) / dy);
				ts.push((H - from.y) / dy);
			}

			// We want the smallest positive t (forward along the ray)
			const t = ts.filter(v => v > 1e-6).reduce((a, b) => Math.min(a, b), Infinity);
			return { x: from.x + dx * t, y: from.y + dy * t };
		}

		const marks = this.state.referenceMarks;

		for (let axis = 0; axis < 3; axis++) {
			const edges = AXIS_EDGES[axis];
			const colorBase = AXIS_COLORS[axis];

			// Collect all marked edge pairs for this axis
			const markedEdges: [Point2D, Point2D][] = [];
			for (const [a, b] of edges) {
				if (marks[a] && marks[b]) {
					markedEdges.push([marks[a]!, marks[b]!]);
				}
			}
			// Need at least 2 edges to compute a vanishing point
			if (markedEdges.length < 2) {
				// With only 1 edge, just draw that edge segment as a hint
				if (markedEdges.length === 1) {
					const [p1, p2] = markedEdges[0];
					ctx.beginPath();
					ctx.moveTo(p1.x * W, p1.y * H);
					ctx.lineTo(p2.x * W, p2.y * H);
					ctx.strokeStyle = `${colorBase}0.7)`;
					ctx.lineWidth = 0.8 * S;
					ctx.setLineDash([6 * S, 4 * S]);
					ctx.stroke();
				}
				continue;
			}

			// Estimate vanishing point by averaging all pairwise intersections
			// (more marked edges = more accurate vanishing point estimate)
			const candidates: {x:number,y:number}[] = [];
			for (let i = 0; i < markedEdges.length; i++) {
				for (let j = i + 1; j < markedEdges.length; j++) {
					const [a1, a2] = markedEdges[i];
					const [b1, b2] = markedEdges[j];
					const h_a1 = toHomogeneous(a1, W, H);
					const h_a2 = toHomogeneous(a2, W, H);
					const h_b1 = toHomogeneous(b1, W, H);
					const h_b2 = toHomogeneous(b2, W, H);
					const vp = intersect(lineThrough(h_a1, h_a2), lineThrough(h_b1, h_b2));
					if (vp) candidates.push(vp);
				}
			}

			if (candidates.length === 0) continue; // all edges parallel (orthographic)

			// Average the candidates for a robust estimate
			const vp = {
				x: candidates.reduce((s, p) => s + p.x, 0) / candidates.length,
				y: candidates.reduce((s, p) => s + p.y, 0) / candidates.length,
			};

			// Draw a ray from every marked corner through the vanishing point
			// Only draw for corners that belong to this axis's edges
			const cornerIndices = new Set(edges.flat());
			for (const idx of cornerIndices) {
				if (!marks[idx]) continue;
				const from = { x: marks[idx]!.x * W, y: marks[idx]!.y * H };
				const exit = rayToEdge(from, vp, W, H);

				ctx.beginPath();
				ctx.moveTo(from.x, from.y);
				ctx.lineTo(exit.x, exit.y);
				ctx.strokeStyle = `${colorBase}0.5)`;
				ctx.lineWidth = 1 * S;
				ctx.setLineDash([6 * S, 4 * S]);
				ctx.stroke();
			}

			// Also draw the solid edge segments between marked pairs
			for (const [p1, p2] of markedEdges) {
				ctx.beginPath();
				ctx.moveTo(p1.x * W, p1.y * H);
				ctx.lineTo(p2.x * W, p2.y * H);
				ctx.strokeStyle = `${colorBase}0.7)`;
				ctx.lineWidth = 1 * S;
				ctx.setLineDash([]); // solid line
				ctx.stroke();
			}
		}
	}

	private drawGuideLines(pos: Point2D | null): void {
		const ctx = this.guideOverlay.getContext('2d')!;
		const W = this.guideOverlay.width;
		const H = this.guideOverlay.height;
		const S = this.panZoom.OVERLAY_SCALE;
		
		ctx.clearRect(0, 0, W, H);
		if (!pos) return;
		if (this.state.referenceMarks[this.selectedCorner] !== null) return;

		// x-axis
		const pointx = this.state.referenceMarks[this.selectedCorner ^ 1];
		if (pointx) {
			ctx.beginPath();
			ctx.moveTo(pos.x * W, pos.y * H);
			ctx.lineTo(pointx.x * W, pointx.y * H);
			ctx.strokeStyle = 'rgba(255,0,0,0.3)';
			ctx.lineWidth = 1 * S;
			ctx.stroke();
		}

		// y-axis
		const pointy = this.state.referenceMarks[this.selectedCorner ^ 2];
		if (pointy) {
			ctx.beginPath();
			ctx.moveTo(pos.x * W, pos.y * H);
			ctx.lineTo(pointy.x * W, pointy.y * H);
			ctx.strokeStyle = 'rgba(0,255,0,0.3)';
			ctx.lineWidth = 1 * S;
			ctx.stroke();
		}

		// z-axis
		const pointz = this.state.referenceMarks[this.selectedCorner ^ 4];
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

		this.state.referenceMarks.forEach((mark, index) => {
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
		this.state.updateReferenceMarks(index, null);
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

export class ReferenceMarker {
	private cardA = document.getElementById("ref-corner-A") as HTMLDivElement;
	private cardB = document.getElementById("ref-corner-B") as HTMLDivElement;
	private markedCountA = this.cardA.querySelector(".marked-count") as HTMLParagraphElement;
	private markedCountB = this.cardB.querySelector(".marked-count") as HTMLParagraphElement;
	private cornerStatusesA = this.cardA.querySelectorAll<HTMLDivElement>(".corner-status");
	private cornerStatusesB = this.cardB.querySelectorAll<HTMLDivElement>(".corner-status");


	private stateA: VideoState;
	private stateB: VideoState;

	private refMarkerVideo: VideoManager;

    private widget = new Ref3DWidget();
	private cornerBtn = document.querySelectorAll<HTMLButtonElement>(".corner-btn");
	private vidABtn = document.getElementById("vid-btn-a") as HTMLButtonElement;
	private vidBBtn = document.getElementById("vid-btn-b") as HTMLButtonElement;

    constructor(states:  VideoState[]) {
		[this.stateA, this.stateB] = states;
		states.forEach(state => {
			state.addEventListener("onUpload", () => { this.syncButtonStates(); this.selectVideo('a'); });
			state.addEventListener("onImport", () => this.updateCard());
		});
		this.refMarkerVideo = new VideoManager(this.stateA);

		document.getElementById("open-refObjMarker")!.addEventListener("click", () => {
			document.querySelector(".RefObjMarker")!.classList.add("active");
			document.getElementById("loading-screen")!.classList.add("show");
		});

		document.getElementById("close-refObjMarker")!.addEventListener("click", () => {
			document.querySelector(".RefObjMarker")!.classList.remove("active");
			document.getElementById("loading-screen")!.classList.remove("show");
			this.updateCard();
		});

		this.cornerBtn.forEach((btn,idx) => {
			btn.addEventListener('click', () => {
				this.selectCorner(idx);
			});
		});

		this.vidABtn.addEventListener('click', () => this.selectVideo('a'));
		this.vidABtn.setAttribute("disabled", "true");
		this.vidABtn.classList.add("disabled");
		this.vidBBtn.addEventListener('click', () => this.selectVideo('b'));
		this.vidBBtn.setAttribute("disabled", "true");
		this.vidBBtn.classList.add("disabled");
	}

	private syncButtonStates(): void {
		this.vidABtn.toggleAttribute('disabled', !this.stateA.hasVideo);
		this.vidABtn.classList.toggle('disabled', !this.stateA.hasVideo);
		this.vidBBtn.toggleAttribute('disabled', !this.stateB.hasVideo);
		this.vidBBtn.classList.toggle('disabled', !this.stateB.hasVideo);
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

	private updateCard() {
		const countA = this.stateA.referenceMarks.filter(m => m !== null).length;
		const countB = this.stateB.referenceMarks.filter(m => m !== null).length;
		this.markedCountA.textContent = `${countA} corner${countA !== 1 ? 's' : ''} marked`;
		this.markedCountB.textContent = `${countB} corner${countB !== 1 ? 's' : ''} marked`;

		this.cardA.classList.remove("done", "inprogress");
		if (countA >= 6) {
			this.cardA.classList.add("done");
		} else if (countA > 0) {
			this.cardA.classList.add("inprogress");
		}

		this.cardB.classList.remove("done", "inprogress");
		if (countB >= 6) {
			this.cardB.classList.add("done");
		} else if (countB > 0) {
			this.cardB.classList.add("inprogress");
		}

		this.cornerStatusesA.forEach((el, idx) => {
			if (this.stateA.referenceMarks[idx]) {
				el.classList.add("done");
			} else {
				el.classList.remove("done");
			}
		});
		this.cornerStatusesB.forEach((el, idx) => {
			if (this.stateB.referenceMarks[idx]) {
				el.classList.add("done");
			} else {
				el.classList.remove("done");
			}
		});
	}
}