import { VideoState } from "../core/VideoState";

class VideoHandler {
	private state: VideoState;

	private label: HTMLDivElement;
	private fpsDisplay: HTMLParagraphElement;
	public fps: number = 0;
	public video: HTMLVideoElement;

	private playBtn: HTMLButtonElement;

	private startTimeDisplay: HTMLDivElement;
	private endTimeDisplay: HTMLDivElement;
    
	private trimSelection: HTMLDivElement;
	private playhead: HTMLDivElement;
	private durationDisplay: HTMLDivElement;
	private currentTimeDisplay: HTMLDivElement;

	private disabled = false;
	public onTrimChange: ((which: "start" | "end") => void) | null = null;
    
    get hasVideo(): boolean {return this.state.hasVideo && this.state.hasTimestamps; }
    get totalFrames(): number { return this.state.frameTimestamps.length; }
	get startFrame(): number { return this.state.startFrame ?? 0; }
	get endFrame(): number { return this.state.endFrame ?? 0; }

    get isPaused(): boolean {return this.video.paused;}
	get currentFrame(): number {return this.frameAtTime(this.video.currentTime);}

	get duration(): number {
		if (!this.hasVideo) return 0;
		return this.timeAtFrame(this.endFrame) - this.timeAtFrame(this.startFrame);
	}

	set startFrame(v: number) { this.state.updateTrim(v, null) }
	set endFrame(v: number) { this.state.updateTrim(null, v) }

	constructor(name: string, state: VideoState) {
		this.state = state;

		const videoContainer = document.getElementById(`video-container-${name}`) as HTMLDivElement;
		this.label = videoContainer.querySelector(".video-label .name") as HTMLDivElement;
		this.fpsDisplay = videoContainer.querySelector(".video-label .fpsDisplay") as HTMLParagraphElement;
		this.video = videoContainer.querySelector("video") as HTMLVideoElement;
        
		const player = document.getElementById(`player-${name}`) as HTMLDivElement;
		player.querySelector(".to-start")!.addEventListener("click", () => this.seekToStart());
		player.querySelector(".to-end")!.addEventListener("click", () => this.seekToEnd());
		player.querySelector(".back")!.addEventListener("click", () => this.seekBack());
		player.querySelector(".forward")!.addEventListener("click", () => this.seekForward());
		this.playBtn = player.querySelector(".play") as HTMLButtonElement;
		this.playBtn.addEventListener("click", () => this.togglePlay());

		const trim = document.getElementById(`trim-${name}`) as HTMLDivElement;

		const startControl = trim.querySelector(".start") as HTMLDivElement;
		startControl.querySelector(".back")!.addEventListener("click", () => this.stepStartFrame(-1));
		startControl.querySelector(".forward")!.addEventListener("click", () => this.stepStartFrame(1));
		this.startTimeDisplay = startControl.querySelector(".label") as HTMLDivElement;

		const endControl = trim.querySelector(".end") as HTMLDivElement;
		endControl.querySelector(".back")!.addEventListener("click", () => this.stepEndFrame(-1));
		endControl.querySelector(".forward")!.addEventListener("click", () => this.stepEndFrame(1));
		this.endTimeDisplay = endControl.querySelector(".label") as HTMLDivElement;

		this.trimSelection = trim.querySelector(".trim-selection") as HTMLDivElement;
		this.playhead = trim.querySelector(".playhead") as HTMLDivElement;
		this.durationDisplay = trim.querySelector(".duration") as HTMLDivElement;
		this.currentTimeDisplay = trim.querySelector(".current-time") as HTMLDivElement;

		// Trim bar drag
		this.initTrimBarDrag(trim);

		// Sync playhead display while playing
		this.video.addEventListener("timeupdate", () => this.movePlayhead());
		this.video.addEventListener("pause", () => this.updatePlayBtn(false));
		this.video.addEventListener("play", () => this.updatePlayBtn(true));
		this.video.addEventListener("ended", () => {
			this.updatePlayBtn(false);
			this.seekToStart();
		});

		this.setDefault();

		state.addEventListener("onReset", () => this.reset());
		state.addEventListener("timestampsChange", () =>  { this.updateVideo(); });
	}

	
	public frameAtTime(time: number): number {
		let result = this.state.frameTimestamps.findIndex(t => t >= time)
		if (result === -1) return this.totalFrames - 1;
		return result;
	}

	public timeAtFrame(frame: number): number {
		return this.state.frameTimestamps[frame];
	}

	private formatTime(frame: number): string {
        const seconds = this.timeAtFrame(frame);
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);

        // Count how many frames fall within the same whole second
        const secondStart = Math.floor(seconds);
        const secondToFrame = this.state.frameTimestamps.filter(t => t >= secondStart && t < seconds).length;

        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(secondToFrame).padStart(2, "0")}`;
    }

	// Playback
	public togglePlay() {
        if (this.isPaused) {
			if (this.video.currentTime >= this.timeAtFrame(this.endFrame)) {
				this.video.currentTime = this.timeAtFrame(this.startFrame);
			}
			this.play();
		} else {
            this.pause();
        }
    }

    public play() {
		if (!this.hasVideo) return;
		this.video.play();
		this.updatePlayBtn(true);
		this.movePlayhead();
	}

	public pause() {
		if (!this.hasVideo) return;
		this.video.pause();
		this.updatePlayBtn(this.isPaused);
		this.movePlayhead();
	}

	private updatePlayBtn(playing: boolean) {this.playBtn.textContent = playing ? "⏸\uFE0E" : "▶\uFE0E";}

	public seekToStart() {this.seekToFrame(this.startFrame);}
	public seekToEnd() {this.seekToFrame(this.endFrame);}
	public seekBack() {this.seekToFrame(this.currentFrame - 1);}
	public seekForward() {this.seekToFrame(this.currentFrame + 1);}

	public seekToFrame(frame: number) {
		if (!this.hasVideo) return;
		frame = Math.max(frame, this.startFrame);
		frame = Math.min(frame, this.endFrame);
		this.video.currentTime = this.timeAtFrame(frame);
		this.movePlayhead();
	}

    // Frame stepping
	public stepStartFrame(delta: number) {
		if (!this.hasVideo) return;
		this.startFrame = Math.max(0, Math.min(this.endFrame - 1, this.startFrame + delta));
		this.seekToFrame(this.startFrame);
		this.updateTrimDisplay();
		this.onTrimChange?.("start");
	}

	public stepEndFrame(delta: number) {
		if (!this.hasVideo) return;
		this.endFrame = Math.min(this.totalFrames - 1, Math.max(this.startFrame + 1, this.endFrame + delta));
		this.seekToFrame(this.endFrame);
		this.updateTrimDisplay();
		this.onTrimChange?.("end");
	}

	// Trim bar dragging
	private initTrimBarDrag(trim: HTMLDivElement) {
        const bar = trim.querySelector(".trim-track") as HTMLDivElement;
        if (!bar) { console.warn("trim-bar not found"); return; }

        let dragging: "start-handle" | "end-handle" | "playhead" | "window" | null = null;
        let windowDragStartFrac = 0;
        let windowDragStartFrame = 0;
        let windowDragEndFrame = 0;

        const fracFromEvent = (e: MouseEvent | TouchEvent): number => {
            const rect = bar.getBoundingClientRect();
            const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
            return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        };

        const frameFromFrac = (frac: number): number => {
            return Math.round(frac * (this.totalFrames - 1));
        };

        const getStartFrac = () => this.totalFrames > 1 ? this.startFrame / (this.totalFrames - 1) : 0;
        const getEndFrac = () => this.totalFrames > 1 ? this.endFrame / (this.totalFrames - 1) : 1;
        const getPlayFrac = () => this.video.duration ? this.video.currentTime / this.video.duration : 0;

        const onStart = (e: MouseEvent | TouchEvent) => {
			if (!this.hasVideo) return;
			const rect = bar.getBoundingClientRect();
			const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
			
			// Get the relative pixel position
			const clickX = clientX - rect.left;

			// Convert current state frames into pixel positions
			const startX = getStartFrac() * rect.width;
			const endX = getEndFrac() * rect.width;
			const playX = getPlayFrac() * rect.width;

			// Define a constant pixel hitbox size
			const PLAYHEAD_HIT = 3;
        	const HANDLE_HIT = 12;

			// Priority order: Playhead > Handles > Window
			if (Math.abs(clickX - playX) < PLAYHEAD_HIT) {
				dragging = "playhead";
			} else if (Math.abs(clickX - startX) < HANDLE_HIT) {
				dragging = "start-handle";
			} else if (Math.abs(clickX - endX) < HANDLE_HIT) {
				dragging = "end-handle";
			} else if (clickX > startX && clickX < endX) {
				dragging = "window";
				// Convert the clickX back to a fraction just for the window offset logic
				windowDragStartFrac = clickX / rect.width;
				windowDragStartFrame = this.startFrame;
				windowDragEndFrame = this.endFrame;
			}
			
			if (dragging) e.preventDefault();
		};

        const onMove = (e: MouseEvent | TouchEvent) => {
            if (!dragging || !this.hasVideo) return;
			if (this.disabled) return;
            const frac = fracFromEvent(e);

            if (dragging === "start-handle") {
                this.startFrame = Math.max(0, Math.min(this.endFrame - 1, frameFromFrac(frac)));
                this.seekToFrame(this.startFrame);
                this.updateTrimDisplay();
				this.onTrimChange?.("start");
            } else if (dragging === "end-handle") {
                this.endFrame = Math.max(this.startFrame + 1, Math.min(this.totalFrames - 1, frameFromFrac(frac)));
                this.seekToFrame(this.endFrame);
                this.updateTrimDisplay();
				this.onTrimChange?.("end");
            } else if (dragging === "playhead") {
				const clampedFrac = Math.max(getStartFrac(), Math.min(getEndFrac(), frac));
				const targetFrame = frameFromFrac(clampedFrac);
				this.seekToFrame(targetFrame);
				this.updateTrimDisplay(); 
			} else if (dragging === "window") {
                const delta = frac - windowDragStartFrac;
                const deltaFrames = Math.round(delta * (this.totalFrames - 1));
                const windowSize = windowDragEndFrame - windowDragStartFrame;
                let newStart = windowDragStartFrame + deltaFrames;
                let newEnd = windowDragEndFrame + deltaFrames;
                if (newStart < 0) { newStart = 0; newEnd = windowSize; }
                if (newEnd > this.totalFrames - 1) { newEnd = this.totalFrames - 1; newStart = newEnd - windowSize; }
                this.startFrame = newStart;
                this.endFrame = newEnd;
                this.updateTrimDisplay();
				this.onTrimChange?.("end");
				this.onTrimChange?.("start");
				this.seekToFrame(this.frameAtTime(this.video.currentTime));
            }
            e.preventDefault();
        };

        const onEnd = () => { dragging = null; };

        bar.addEventListener("mousedown", onStart);
        bar.addEventListener("touchstart", onStart, { passive: false });
        window.addEventListener("mousemove", onMove);
        window.addEventListener("touchmove", onMove, { passive: false });
        window.addEventListener("mouseup", onEnd);
        window.addEventListener("touchend", onEnd);
    }

    // Trim UI
	private movePlayhead() {
		if (!this.hasVideo) return;
        if (this.video.currentTime > this.timeAtFrame(this.endFrame)) {
			this.video.pause();
			this.video.currentTime = this.timeAtFrame(this.startFrame);
		}

		const pct = this.video.currentTime / this.video.duration * 100;
		this.playhead.style.setProperty("--pos", `${pct}%`);

		const currentFrame = this.timeAtFrame(this.currentFrame) - this.timeAtFrame(this.startFrame);
		this.currentTimeDisplay.textContent = `Current time: ${currentFrame.toFixed(3)} s`;
	}

	public updateTrimDisplay() {
		const total = this.totalFrames - 1;
		const startPct = this.startFrame / total * 100;
		const endPct = this.endFrame / total * 100;

		this.startTimeDisplay.textContent = this.formatTime(this.startFrame);
		this.endTimeDisplay.textContent = this.formatTime(this.endFrame);

		this.trimSelection.style.setProperty("--start", `${startPct}%`);
		this.trimSelection.style.setProperty("--end", `${endPct}%`);
;
        this.durationDisplay.textContent = `Duration: ${this.duration.toFixed(3)} s`;
	}

	public updateVideo() {
		if (!this.state.hasTimestamps || !this.state.hasVideo) return;
        const src = URL.createObjectURL(this.state.file);
        this.label.textContent = this.state.file.name;
        this.video.src = src;
        this.video.load();

		this.fps = this.totalFrames > 1 ? (this.totalFrames - 1) / this.timeAtFrame(this.totalFrames - 1) : 0;
		this.fpsDisplay.textContent = `~${this.fps.toFixed(2)} fps`;

        // Seek to start frame once ready
        this.video.addEventListener("loadedmetadata", () => {
            this.seekToStart();
			this.updateTrimDisplay();
        }, { once: true });
    }

	public reset() {
		this.label.textContent = "No video";
		this.fpsDisplay.textContent = "- fps";
		this.video.src = "";
		this.video.load();
		this.disabled = false;
		this.setDefault();
	}

	private setDefault() {
		this.startTimeDisplay.textContent = "00:00:00";
		this.endTimeDisplay.textContent = "00:00:00";
		this.trimSelection.style.setProperty("--start", "0%");
		this.trimSelection.style.setProperty("--end", "100%");
		this.playhead.style.setProperty("--pos", "0%");
		this.durationDisplay.textContent = "Duration: 0.000 s";
		this.currentTimeDisplay.textContent = "Current time: 0.000 s";
	}

	public toggleDisabled() {
		this.disabled = !this.disabled;
	}
}

export class SyncEditor {
	private videoA: VideoHandler;
	private videoB: VideoHandler;

	private playBtn: HTMLButtonElement;
	private startA: HTMLDivElement;
	private endA: HTMLDivElement;
	private startB: HTMLDivElement;
	private endB: HTMLDivElement;
	private durationA: HTMLDivElement;
	private durationB: HTMLDivElement;

	private trimA: HTMLDivElement;
	private trimB: HTMLDivElement;
	private linkUnlinkBtn: HTMLButtonElement;
	private linked = false;

	private matchDurationBtn: HTMLButtonElement;

	constructor(states: [VideoState, VideoState]) {
		this.videoA = new VideoHandler("A", states[0]);
		this.videoB = new VideoHandler("B", states[1]);

		states.forEach(state => {
			state.addEventListener("onImport", () => this.updateCard());
			state.addEventListener("timestampsChange", () => this.updateCard());
		})

		document.getElementById("open-sync-editor")!.addEventListener("click", () => {
			document.querySelector(".SyncEditor")!.classList.add("active");
			document.getElementById("loading-screen")!.classList.add("show");
		});

		document.getElementById("close-sync-editor")!.addEventListener("click", () => {
			document.querySelector(".SyncEditor")!.classList.remove("active");
			document.getElementById("loading-screen")!.classList.remove("show");
			this.close();
		});

		const playerBoth = document.getElementById("player-Both") as HTMLDivElement;
		playerBoth.querySelector(".to-start")!.addEventListener("click", () => this.toStartBoth());
		playerBoth.querySelector(".to-end")!.addEventListener("click", () => this.toEndBoth());
		playerBoth.querySelector(".back")!.addEventListener("click", () => this.backBoth());
		playerBoth.querySelector(".forward")!.addEventListener("click", () => this.forwardBoth());

		this.playBtn = playerBoth.querySelector(".play") as HTMLButtonElement;
		this.playBtn.addEventListener("click", () => this.toggleBoth());

		this.startA = document.getElementById("start-time-A")?.querySelector(".value") as HTMLDivElement;
		this.startB = document.getElementById("start-time-B")?.querySelector(".value") as HTMLDivElement;
		this.endA = document.getElementById("end-time-A")?.querySelector(".value") as HTMLDivElement;
		this.endB = document.getElementById("end-time-B")?.querySelector(".value") as HTMLDivElement;
		this.durationA = document.getElementById("duration-A")?.querySelector(".value") as HTMLDivElement;
		this.durationB = document.getElementById("duration-B")?.querySelector(".value") as HTMLDivElement;

		this.trimA = document.getElementById("trim-A") as HTMLDivElement;
		this.trimB = document.getElementById("trim-B") as HTMLDivElement;
		this.linkUnlinkBtn = document.getElementById("link-unlink") as HTMLButtonElement;
		this.linkUnlinkBtn.addEventListener("click", () => {this.toggleLink();});

		this.matchDurationBtn = document.getElementById("match-duration") as HTMLButtonElement;
		this.matchDurationBtn.addEventListener("click", () => this.matchDuration());
	}

	// Playback Both
	private async toggleBoth() {
		if (this.videoA.isPaused) {
			await Promise.all([
				this.videoA.video.play(),
				this.videoB.video.play(),
			]);
		} else {
			this.videoA.pause();
			this.videoB.pause();
		}
	}
	private toStartBoth() {
		this.videoA.seekToStart();
		this.videoB.seekToStart();
	}
	private toEndBoth() {
		this.videoA.seekToEnd();
		this.videoB.seekToEnd();
	}
	private forwardBoth() {
		const [controller, follower] =
			this.videoA.fps <= this.videoB.fps
				? [this.videoA, this.videoB]
				: [this.videoB, this.videoA];

		controller.seekForward();
		const targetTime = controller.timeAtFrame(controller.currentFrame) - controller.timeAtFrame(controller.startFrame) + follower.timeAtFrame(follower.startFrame);
		let targetFrame = follower.frameAtTime(targetTime);
		const delta1 = Math.abs(targetTime - follower.timeAtFrame(targetFrame));
		const delta2 = Math.abs(targetTime - follower.timeAtFrame(targetFrame - 1));
		if (delta2 < delta1) targetFrame -= 1;
		follower.seekToFrame(targetFrame);
	}
	private backBoth() {
		const [controller, follower] =
			this.videoA.fps <= this.videoB.fps
				? [this.videoA, this.videoB]
				: [this.videoB, this.videoA];

		controller.seekBack();
		const targetTime = controller.timeAtFrame(controller.currentFrame) - controller.timeAtFrame(controller.startFrame) + follower.timeAtFrame(follower.startFrame);
		let targetFrame = follower.frameAtTime(targetTime);
		const delta1 = Math.abs(targetTime - follower.timeAtFrame(targetFrame));
		const delta2 = Math.abs(targetTime - follower.timeAtFrame(targetFrame - 1));
		if (delta2 < delta1) targetFrame -= 1;
		follower.seekToFrame(targetFrame);
	}

	// Link
	private toggleLink() {
		this.linked = !this.linked;
		this.linkUnlinkBtn.classList.toggle("active");

		const [controller, follower, trim] =
			this.videoA.fps >= this.videoB.fps
				? [this.videoA, this.videoB, this.trimB]
				: [this.videoB, this.videoA, this.trimA];

		if (this.linked) {
			this.matchDurationBtn.setAttribute("disabled", "true");
			this.matchDurationBtn.classList.add("disabled");
			// trim.style.cssText = "opacity: 0.5; cursor: not-allowed;";
			trim.querySelectorAll("*").forEach(item => {
				item.setAttribute("disabled", "true");
				item.classList.add("disabled");
			});
			follower.toggleDisabled();

			// Mirror time delta from controller onto follower
			const initialControllerTimeStart = controller.timeAtFrame(controller.startFrame);
			const initialControllerTimeEnd = controller.timeAtFrame(controller.endFrame);
			const initialFollowerTimeStart = follower.timeAtFrame(follower.startFrame);
			const initialFollowerTimeEnd = follower.timeAtFrame(follower.endFrame);
			controller.onTrimChange = (which) => {
				if (!follower.hasVideo) return;
				if (which === "start") {
					const targetTime = initialFollowerTimeStart + (controller.timeAtFrame(controller.startFrame) - initialControllerTimeStart);
					let targetFrame = follower.frameAtTime(targetTime);
					const delta1 = Math.abs(targetTime - follower.timeAtFrame(targetFrame));
					const delta2 = Math.abs(targetTime - follower.timeAtFrame(targetFrame - 1));
					if (delta2 < delta1) targetFrame -= 1;
					follower.startFrame = Math.max(0, Math.min(follower.endFrame - 1, targetFrame));
					follower.seekToFrame(follower.startFrame);
				} else {
					const targetTime = initialFollowerTimeEnd + (controller.timeAtFrame(controller.endFrame) - initialControllerTimeEnd);
					let targetFrame = follower.frameAtTime(targetTime);
					const delta1 = Math.abs(targetTime - follower.timeAtFrame(targetFrame));
					const delta2 = Math.abs(targetTime - follower.timeAtFrame(targetFrame - 1));
					if (delta2 < delta1) targetFrame -= 1;
					follower.endFrame = Math.min(follower.totalFrames - 1, Math.max(follower.startFrame + 1, targetFrame));
					follower.seekToFrame(follower.endFrame);
				}
				follower.updateTrimDisplay();
			};

		} else {
			this.matchDurationBtn.removeAttribute("disabled");
			this.matchDurationBtn.classList.remove("disabled");
			// trim.style.cssText = "opacity: 1; cursor: default;";
			trim.querySelectorAll("*").forEach(item => {
				item.removeAttribute("disabled");
				item.classList.remove("disabled");
			});
			follower.toggleDisabled();
			controller.onTrimChange = null;
		}
	}

	// Match duration
	public matchDuration() {
		if (!this.videoA.hasVideo || !this.videoB.hasVideo) return;

		const timestartA = this.videoA.timeAtFrame(this.videoA.startFrame);
		const timeendA = this.videoA.timeAtFrame(this.videoA.endFrame);
		const timestartB = this.videoB.timeAtFrame(this.videoB.startFrame);
		const timeendB = this.videoB.timeAtFrame(this.videoB.endFrame);

		const DurationA = timeendA - timestartA;
		const DurationB = timeendB - timestartB;

		if (DurationA === DurationB) return;
		if (DurationA < DurationB) {
			const targetTime = timestartB + DurationA;
			const targetFrame = this.videoB.frameAtTime(targetTime);
			this.videoB.endFrame = targetFrame;
			this.videoB.updateTrimDisplay();
		} else {
			const targetTime = timestartA + DurationB;
			const targetFrame = this.videoA.frameAtTime(targetTime);
			this.videoA.endFrame = targetFrame;
			this.videoA.updateTrimDisplay();
		}
		this.videoA.seekToFrame(this.videoA.startFrame);
		this.videoB.seekToFrame(this.videoB.startFrame);
	}

	private updateCard() {
		if (this.videoA.hasVideo) {
			const startATime = this.videoA.timeAtFrame(this.videoA.startFrame);
			const endATime = this.videoA.timeAtFrame(this.videoA.endFrame);
			this.startA.textContent = startATime.toFixed(3);
			this.endA.textContent = endATime.toFixed(3);
			this.durationA.textContent = (endATime - startATime).toFixed(3);
		} else {
			this.startA.textContent = "-";
			this.endA.textContent = "-";
			this.durationA.textContent = "-";
		}

		if (this.videoB.hasVideo) {
			const startBTime = this.videoB.timeAtFrame(this.videoB.startFrame);
			const endBTime = this.videoB.timeAtFrame(this.videoB.endFrame);
			this.startB.textContent = startBTime.toFixed(3);
			this.endB.textContent = endBTime.toFixed(3);
			this.durationB.textContent = (endBTime - startBTime).toFixed(3);
		} else {
			this.startB.textContent = "-";
			this.endB.textContent = "-";
			this.durationB.textContent = "-";
		}
	}

	public close() {
		this.updateCard();
		if (this.linked) { this.toggleLink(); }
	}
}