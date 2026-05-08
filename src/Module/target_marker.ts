import { Point2D } from "../core/Types";
import { VideoState } from "../core/VideoState";
import { PanZoom } from "../core/PanZoom";
import { captureGrayFrame, trackPoint } from "../core/AutoTrack";

class VideoManager {
	private autoTrack = document.getElementById("auto-Track") as HTMLButtonElement;
	private continuousTrack = document.getElementById("continuously-Track") as HTMLButtonElement;
	private autoForwardBtn = document.getElementById("auto-forward") as HTMLButtonElement;

    private viewPort = document.getElementById("target-viewport") as HTMLDivElement;
	private container = document.getElementById("target-video-container") as HTMLDivElement;
	private video = document.getElementById("target-video") as HTMLVideoElement;
	private markOverlay = document.getElementById("target-mark-overlay") as HTMLCanvasElement;

    private playBtn = this.viewPort.querySelector(".play") as HTMLButtonElement;
	private playBar = this.viewPort.querySelector(".play-bar") as HTMLDivElement;
	private playhead = this.viewPort.querySelector(".playhead") as HTMLDivElement;
	private timeDisplay = this.viewPort.querySelector(".time") as HTMLDivElement;
	private frameDisplay = this.viewPort.querySelector(".frame") as HTMLDivElement;

    private deleteBtn = this.viewPort.querySelector(".delete") as HTMLButtonElement;
	
    private panZoom = new PanZoom(this.viewPort, this.container, this.video, [this.markOverlay]);
	private readonly dotRadius = 3.5;
	
	private dontUpdatePlayhead = false;
	private isContinuoslyTrack = false;
    private isScrubbing = false;
	private wasPlayingBeforeScrub = false;
    
    private state: VideoState;
    private selectedFrame = 0;

	private prevFrame: any;
	private prevMark: Point2D | null = null;
	private prevFrameNumber = -1;
	private autoForward: boolean = true;

	get currentFrame(): number {return this.state.frameAtTime(this.video.currentTime);}

    constructor(state: VideoState) {
        this.state = state;
		
		this.viewPort.querySelector(".back")!.addEventListener("click", () => this.seekBack());
        this.playBtn.addEventListener('click', () => this.togglePlay());
		this.viewPort.querySelector(".forward")!.addEventListener("click", () => this.seekForward());
		this.deleteBtn.addEventListener('click', () => this.deleteMark(this.selectedFrame));

		this.video.addEventListener('timeupdate', () => this.updatePlayhead());
		
		this.autoForwardBtn.addEventListener("click", () => {
			this.autoForward = !this.autoForward;
			this.autoForwardBtn.classList.toggle("active", this.autoForward);
		})

		this.autoTrack.addEventListener("click", async () => {
			this.pause();
			const success = await this.trackThisFrame();
			if (success && this.autoForward) this.seekForward();
		})

		this.continuousTrack.addEventListener("click", async () => {
			if (this.isContinuoslyTrack) {
				this.isContinuoslyTrack = false;
				return;
			}

			this.pause();
			this.isContinuoslyTrack = true;
			this.continuousTrack.classList.add("active");

			while (this.isContinuoslyTrack) {
				const success = await this.trackThisFrame();

				if (!success) {
					this.isContinuoslyTrack = false;
					break;
				}

				// Check if we're already at the last frame before seeking
				if (this.currentFrame >= this.state.endFrame) {
					this.isContinuoslyTrack = false;
					break;
				}

				// Wait for the video to actually finish seeking before next track
				await new Promise<void>((resolve) => {
					this.video.addEventListener("seeked", () => resolve(), { once: true });
					this.seekForward();
				});
			}

			this.continuousTrack.classList.remove("active");
		});

        this.bindScrubEvents();

        this.panZoom.onLeftClick = (pos) => {
			if (!this.state.hasVideo) return;
			this.state.updateTargetMarks(this.selectedFrame, pos);
			this.drawMarks();
			if (this.autoForward) this.seekForward();
		};
		this.panZoom.onMiddleClick = (pos) => {
			if (!this.state.hasVideo) return;
			this.deleteMarkAtPos(pos);
		};
    }

    public updateVideoState(videoState: VideoState) {
		this.dontUpdatePlayhead = true;
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
			this.video.currentTime = this.state.targetCurrentTime;
			this.dontUpdatePlayhead = false;
			this.updatePlayhead();
			this.panZoom.resetView();
			this.panZoom.fitCanvasToVideo();
		}, { once: true });
	}

	public updateCurrentTime() {
		this.video.currentTime = this.state.targetCurrentTime;
		this.updatePlayhead();
	}

    private updateSelectedFrame(index: number) {
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
		this.updatePlayhead();
	}

	private seekBack() { this.seekToFrame(this.currentFrame - 1); }
	private seekForward() { this.seekToFrame(this.currentFrame + 1); }

	public seekToFrame(frame: number) {
		if (!this.state.hasVideo) return;
		frame = Math.max(frame, this.state.startFrame);
		frame = Math.min(frame, this.state.endFrame);
		this.prevMark = this.state.targetMarks[this.currentFrame];
		this.prevFrame = captureGrayFrame(this.video);
		this.prevFrameNumber = this.currentFrame;
		this.video.currentTime = this.state.timeAtFrame(frame);
	}

    private updatePlayhead() {
		if (this.dontUpdatePlayhead) return;
        this.state.targetCurrentTime = this.video.currentTime;
		const currentTime = this.video.currentTime - this.state.startTime;
		const duration = this.state.duration;
		this.updateSelectedFrame(this.currentFrame);
		if (duration > 0) {
			const progress = currentTime / duration;
			this.playhead.style.left = `${Math.min(Math.max(progress, 0), 1) * 100}%`;
			this.timeDisplay.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(this.state.duration)}`;
			this.frameDisplay.textContent = `${this.currentFrame - this.state.startFrame + 1} / ${this.state.endFrame - this.state.startFrame + 1}`;
		} else {
			this.playhead.style.left = '0%';
			this.timeDisplay.textContent = '0.00 / 0.00';
			this.frameDisplay.textContent = '0/0'
		}
		if (this.isScrubbing) return;
		if (currentTime > duration) {
			this.video.pause();
			this.updatePlayBtn(false);
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
		const ctx = this.markOverlay.getContext('2d')!;
		const W = this.markOverlay.width;
		const H = this.markOverlay.height;
		const S = this.panZoom.OVERLAY_SCALE;
		ctx.clearRect(0, 0, W, H);

		for (let i = 0; i < this.state.totalFrames; i++) {
			const mark = this.state.targetMarks[i];
			if (!mark) continue;

			const cx = mark.x * W;
			const cy = mark.y * H;
			const radius = (i === this.selectedFrame ? this.dotRadius * 1.5 : this.dotRadius) * S;
			const opacity = 1 - Math.min(Math.abs(this.selectedFrame - i), 5) * 0.15;

			ctx.beginPath();
			ctx.arc(cx, cy, radius, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(250,250,250,${opacity})`;
			ctx.fill();

			ctx.beginPath();
			ctx.arc(cx, cy, radius, 0, Math.PI * 2);
			ctx.strokeStyle = `rgba(0,0,0,${opacity})`;
			ctx.lineWidth = 1.5 * S;
			ctx.stroke();
		}
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

	private async trackThisFrame(): Promise<boolean> {
		if (this.currentFrame != this.prevFrameNumber + 1) {
			await new Promise<void>((resolve) => {
				this.video.addEventListener("seeked", () => resolve(), { once: true });
				this.seekToFrame(this.currentFrame - 1);
			});

			await new Promise<void>((resolve) => {
				this.video.addEventListener("seeked", () => resolve(), { once: true });
				this.seekToFrame(this.currentFrame + 1);
			});
		}

		if (this.prevMark === null) {
			alert("Please mark the previous frame"); 
			return false;
		}

		const currFrame = captureGrayFrame(this.video);
		const predicted = trackPoint(this.prevFrame, currFrame, this.prevMark);
		currFrame.delete();

		if (!predicted) {
			alert("Track Failed");
			return false;
		} else {
			this.state.updateTargetMarks(this.currentFrame, predicted);
			this.drawMarks();
			return true;
		}
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
			state.addEventListener("timestampsChange", () => this.videoManager.updateCurrentTime());
			state.addEventListener("trimChange", () => this.videoManager.updateCurrentTime());
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