import { Point2D } from "../core/Types";
import { VideoState } from "../core/VideoState";
import { PanZoom } from "../core/PanZoom";

class VideoManager {
    private viewPort = document.getElementById("target-viewport") as HTMLDivElement;
	private container = document.getElementById("target-video-container") as HTMLDivElement;
	private video = document.getElementById("target-video") as HTMLVideoElement;
	private markOverlay = document.getElementById("target-mark-overlay") as HTMLCanvasElement;

    private playBtn = this.viewPort.querySelector(".play") as HTMLButtonElement;
	private playBar = this.viewPort.querySelector(".play-bar") as HTMLDivElement;
	private playhead = this.viewPort.querySelector(".playhead") as HTMLDivElement;
	private timeDisplay = this.viewPort.querySelector(".time") as HTMLDivElement;

    private deleteBtn = this.viewPort.querySelector(".delete") as HTMLButtonElement;

    private isScrubbing = false;
	private wasPlayingBeforeScrub = false;
    
    private state: VideoState;
    private selectedFrame = 0;

    private panZoom = new PanZoom(this.viewPort, this.container, this.video, [this.markOverlay]);
	private readonly dotRadius = 3.5;

    constructor(state: VideoState) {
        this.state = state;


        this.playBtn.addEventListener('click', () => this.togglePlay());
		this.deleteBtn.addEventListener('click', () => this.deleteMark(this.selectedFrame));

        this.video.addEventListener('timeupdate', () => this.updatePlayhead());

        this.bindScrubEvents();

        this.panZoom.onLeftClick = (pos) => {
			if (!this.state.hasVideo) return;
			this.state.updateTargetMarks(this.selectedFrame, pos);
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
    }

    public updateVideoState(videoState: VideoState) {
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
			this.video.currentTime = this.state.targetCurrentTime
			// this.updatePlayhead();
			this.panZoom.resetView();
			this.panZoom.fitCanvasToVideo();
			this.drawMarks();
		}, { once: true });
	}

    public updateSelectedFrame(index: number) {
        this.selectedFrame = index;
		this.drawMarks();
    }

    private togglePlay() {
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

    private updatePlayhead() {
        this.state.targetCurrentTime = this.video.currentTime;
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

    private bindScrubEvents() {
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

    private scrubToEvent(e: MouseEvent) {
		const rect = this.playBar.getBoundingClientRect();
		const progress = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
		const newTime = this.state.startTime + progress * this.state.duration;
		this.video.currentTime = newTime;
		// Update playhead immediately
		this.playhead.style.left = `${progress * 100}%`;
	}

    private updatePlayBtn(playing: boolean) {this.playBtn.textContent = playing ? "⏸\uFE0E" : "▶\uFE0E";}

    private drawMarks() {

    }

    private deleteMarkAtPos(pos: Point2D) {
		const S = this.panZoom.OVERLAY_SCALE;

		this.state.targetMarks.forEach((mark, index) => {
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
		this.state.updateTargetMarks(index, null);
		this.drawMarks();
	}
}

export class TargetMarker {
    private stateA: VideoState;
	private stateB: VideoState;

    private videoManager: VideoManager;

    private targetMarker = document.getElementById("TargetMarker") as HTMLDivElement;
	private vidABtn = this.targetMarker.querySelector("#vid-btn-a") as HTMLButtonElement;
	private vidBBtn = this.targetMarker.querySelector("#vid-btn-b") as HTMLButtonElement;

    constructor(states: VideoState[]) {
        [this.stateA, this.stateB] = states;
        this.videoManager = new VideoManager(this.stateA);
        states.forEach(state => {
			state.addEventListener("onUpload", () => { this.syncButtonStates(); this.selectVideo('a'); });
			state.addEventListener("onReset", () => { this.syncButtonStates(); this.selectVideo('a'); this.updateCard(); });
			state.addEventListener("onImport", () => this.updateCard());
		});


        document.getElementById("open-targetMarker")!.addEventListener("click", () => {
			document.querySelector(".TargetMarker")!.classList.add("active");
			document.getElementById("loading-screen")!.classList.add("show");
		});

		document.getElementById("close-targetMarker")!.addEventListener("click", () => {
			document.querySelector(".TargetMarker")!.classList.remove("active");
			document.getElementById("loading-screen")!.classList.remove("show");
			this.updateCard();
		});

        this.vidABtn.addEventListener('click', () => this.selectVideo('a'));
		this.vidABtn.setAttribute("disabled", "true");
		this.vidABtn.classList.add("disabled");
		this.vidBBtn.addEventListener('click', () => this.selectVideo('b'));
		this.vidBBtn.setAttribute("disabled", "true");
		this.vidBBtn.classList.add("disabled");
    }

    private syncButtonStates() {
		this.vidABtn.toggleAttribute('disabled', !this.stateA.hasVideo);
		this.vidABtn.classList.toggle('disabled', !this.stateA.hasVideo);
		this.vidBBtn.toggleAttribute('disabled', !this.stateB.hasVideo);
		this.vidBBtn.classList.toggle('disabled', !this.stateB.hasVideo);
	}

    private selectVideo(video: 'a' | 'b') {
		if (video === 'a') {
			this.vidABtn.classList.add("active");
			this.vidBBtn.classList.remove("active");
			this.videoManager.updateVideoState(this.stateA);
		} else {
			this.vidBBtn.classList.add("active");
			this.vidABtn.classList.remove("active");
			this.videoManager.updateVideoState(this.stateB);
		}
	}

    private updateCard() {

    }
}