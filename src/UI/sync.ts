import { apTracker } from "../main";

// Card
const openSyncEditorBtn = document.getElementById("open-sync-editor") as HTMLButtonElement;
const closeSyncEditorBtn = document.getElementById("close-sync-editor") as HTMLButtonElement;

openSyncEditorBtn.addEventListener("click", () => {
    const syncEditorContainer = document.querySelector(".SyncEditor") as HTMLDivElement;
    syncEditorContainer.classList.add("active");
});

closeSyncEditorBtn.addEventListener("click", () => {
	syncEditor.updateMain();
    const syncEditorContainer = document.querySelector(".SyncEditor") as HTMLDivElement;
    syncEditorContainer.classList.remove("active");
});


// SyncEditor
class VideoHandler {
	public file: File;
	public frameTimestamps: number[] = [];

	private label: HTMLDivElement;
	public video: HTMLVideoElement;

	private playBtn: HTMLButtonElement;

	private startTimeDisplay: HTMLDivElement;
	private endTimeDisplay: HTMLDivElement;
    
	private trimSelection: HTMLDivElement;
	private playhead: HTMLDivElement;
	private durationDisplay: HTMLDivElement;
	private currentTimeDisplay: HTMLDivElement;

	private disabled = false;
    
    public startFrame: number = 0;
    public endFrame: number = 0;
    
    get hasVideo(): boolean {return this.file.size > 0 && this.frameTimestamps.length > 0;}

    get isPaused(): boolean {return this.video.paused;}
	
    get totalFrames(): number {return this.frameTimestamps.length;}

	get currentFrame(): number {return this.frameAtTime(this.video.currentTime);}

	get duration(): number {
		if (!this.hasVideo) return 0;
		return this.timeAtFrame(this.endFrame) - this.timeAtFrame(this.startFrame);
	}


	constructor(name: string) {
		this.file = new File([], "");

		const videoContainer = document.getElementById(`video-container-${name}`) as HTMLDivElement;
		this.label = videoContainer.querySelector(".video-label") as HTMLDivElement;
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
	}

	
	public frameAtTime(time: number): number {
		return this.frameTimestamps.findIndex(t => t >= time);
	}

	public timeAtFrame(frame: number): number {
		return this.frameTimestamps[frame];
	}

	private formatTime(frame: number): string {
        const seconds = this.timeAtFrame(frame);
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);

        // Count how many frames fall within the same whole second
        const secondStart = Math.floor(seconds);
        const secondToFrame = this.frameTimestamps.filter(t => t >= secondStart && t < seconds).length;

        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(secondToFrame).padStart(2, "0")}`;
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
		this.updatePlayBtn(this.isPaused);
		this.movePlayhead();
	}

	public pause() {
		if (!this.hasVideo) return;
		this.video.pause();
		this.updatePlayBtn(this.isPaused);
		this.movePlayhead();
	}

	private updatePlayBtn(playing: boolean) {this.playBtn.textContent = playing ? "⏸" : "▶";}

	public seekToStart() {this.seekToFrame(this.startFrame);}
	public seekToEnd() {this.seekToFrame(this.endFrame);}
	public seekBack() {this.seekToFrame(this.currentFrame - 1);}
	public seekForward() {this.seekToFrame(this.currentFrame + 1);}

	public seekToFrame(frame: number) {
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
	}

	public stepEndFrame(delta: number) {
		if (!this.hasVideo) return;
		this.endFrame = Math.max(this.startFrame + 1, Math.min(this.totalFrames - 1, this.endFrame + delta));
		this.seekToFrame(this.endFrame);
		this.updateTrimDisplay();
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
            } else if (dragging === "end-handle") {
                this.endFrame = Math.max(this.startFrame + 1, Math.min(this.totalFrames - 1, frameFromFrac(frac)));
                this.seekToFrame(this.endFrame);
                this.updateTrimDisplay();
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
		this.currentTimeDisplay.textContent = `Current time: ${currentFrame.toFixed(3)}s`;
	}

	public updateTrimDisplay() {
		const total = this.totalFrames - 1;
		const startPct = this.startFrame / total * 100;
		const endPct = this.endFrame / total * 100;

		this.startTimeDisplay.textContent = this.formatTime(this.startFrame);
		this.endTimeDisplay.textContent = this.formatTime(this.endFrame);

		this.trimSelection.style.setProperty("--start", `${startPct}%`);
		this.trimSelection.style.setProperty("--end", `${endPct}%`);
		// this.movePlayhead()
;
        this.durationDisplay.textContent = `Duration: ${this.duration.toFixed(3)}s`;
	}

	public updateVideo(file: File, timestamps: number[], startTrim: number | null = null, endTrim: number | null = null) {
        this.file = file;
        this.frameTimestamps = timestamps;

        const src = URL.createObjectURL(file);
        this.label.textContent = file.name;
        this.video.src = src;
        this.video.load();

		if (startTrim === null) {
			this.startFrame = 0;
		} else {
			this.startFrame = startTrim;
		}
		if (endTrim === null) {
			this.endFrame = this.totalFrames - 1;
		} else {
			this.endFrame = endTrim;
		}

        // Seek to start frame once ready
        this.video.addEventListener("loadedmetadata", () => {
            this.seekToStart();
			this.updateTrimDisplay();
        }, { once: true });
    }

	public reset() {
		this.file = new File([], "");
		this.frameTimestamps = [];
		this.label.textContent = "No video";
		this.video.src = "";
		this.video.load();
		this.startFrame = 0;
		this.endFrame = 0;
		this.setDefault();
	}

	private setDefault() {
		this.startTimeDisplay.textContent = "00:00.00";
		this.endTimeDisplay.textContent = "00:00.00";
		this.trimSelection.style.setProperty("--start", "0%");
		this.trimSelection.style.setProperty("--end", "100%");
		this.playhead.style.setProperty("--pos", "0%");
		this.durationDisplay.textContent = "Duration: 00:00.00";
		this.currentTimeDisplay.textContent = "Current time: 00:00.00";
	}

	public toggleDisabled() {
		this.disabled = !this.disabled;
	}
}

class SyncEditor {
	private videoA: VideoHandler;
	private videoB: VideoHandler;

	private playBtn: HTMLButtonElement;
	private startA: HTMLDivElement;
	private endA: HTMLDivElement;
	private startB: HTMLDivElement;
	private endB: HTMLDivElement;
	private durationA: HTMLDivElement;
	private durationB: HTMLDivElement;

	private linkUnlinkBtn: HTMLButtonElement;
	private linked = false;
	private playerB: HTMLDivElement;
	private trimB: HTMLDivElement;

	// Cache by filename so we can detect which slot each file belongs to
	private fileCache: Map<string, { file: File; timestamps: number[] }> = new Map();

	constructor() {
		this.videoA = new VideoHandler("A");
		this.videoB = new VideoHandler("B");

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

		this.linkUnlinkBtn = document.getElementById("link-unlink") as HTMLButtonElement;
		this.linkUnlinkBtn.addEventListener("click", () => {this.linkBoth();});
		this.playerB = document.getElementById("player-B") as HTMLDivElement;
		this.trimB = document.getElementById("trim-B") as HTMLDivElement;

		document.getElementById("match-duration")!.addEventListener("click", () => this.matchDuration());
	}

	// Playback Both
	private toggleBoth() {
        if (this.videoA.isPaused) {
            this.videoA.play();
            this.videoB.play();
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
	private backBoth() {
		this.videoA.seekBack();
		this.videoB.seekBack();
	}
	private forwardBoth() {
		this.videoA.seekForward();
		this.videoB.seekForward();
	}

	// Link
	private linkBoth() {
		this.linked = !this.linked;
		this.videoB.toggleDisabled();
		this.linkUnlinkBtn.classList.toggle("active");
		// if (!this.videoA.hasVideo || !this.videoB.hasVideo) return;
		if (this.linked) {
			this.playerB.style = "opacity: 0.5; cursor: not-allowed;";
			this.playerB.querySelectorAll("*").forEach(item => {
				item.setAttribute("disabled", "true");
				item.classList.add("disabled");
			});
			this.trimB.style = "opacity: 0.5; cursor: not-allowed;";
			this.trimB.querySelectorAll("*").forEach(item => {
				item.setAttribute("disabled", "true");
				item.classList.add("disabled");
			});
		} else {
			this.trimB.style = "opacity: 1; cursor: default; z-index: 100;";
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
	}
	
	// File management
	public updateVideos(files: File[], frameTimestamps: number[][]) {
		// Build incoming map
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

		// Snapshot B's trim
		const bTrimSnapshot = bStillPresent ? {startFrame: this.videoB.startFrame, endFrame: this.videoB.endFrame,} : null;

		if (!aStillPresent) this.videoA.reset();
		if (!bStillPresent) this.videoB.reset();

		// Shift B into A
		if (!this.videoA.hasVideo && this.videoB.hasVideo && bTrimSnapshot) {
			this.videoA.updateVideo(this.videoB.file, this.videoB.frameTimestamps, bTrimSnapshot.startFrame, bTrimSnapshot.endFrame);
			this.videoB.reset();
		}
		this.videoA.seekToStart();

		// Assign new files to empty slots
		const newFiles = [...this.fileCache.values()].filter(
			d => d.file.name !== this.videoA.file.name && d.file.name !== this.videoB.file.name
		);
		for (const data of newFiles) {
			if (!this.videoA.hasVideo) {
				this.videoA.updateVideo(data.file, data.timestamps);
			} else if (!this.videoB.hasVideo) {
				this.videoB.updateVideo(data.file, data.timestamps);
			}
		}
		this.updateMain();
	}

	// Return
	private getTrimState(): (number[] | null)[] {
		return [
			this.videoA.hasVideo ? [this.videoA.startFrame, this.videoA.endFrame] : null,
			this.videoB.hasVideo ? [this.videoB.startFrame, this.videoB.endFrame] : null,
			this.videoA.hasVideo && this.videoB.hasVideo ? [this.videoA.duration, this.videoB.duration,] : null
		];
	}

	public updateMain() {
		apTracker.updateSync(this.getTrimState());
		const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

		if (this.videoA.hasVideo) {
			const startATime = this.videoA.timeAtFrame(this.videoA.startFrame);
			const endATime = this.videoA.timeAtFrame(this.videoA.endFrame);
			this.startA.textContent = fmt(startATime);
			this.endA.textContent = fmt(endATime);
			this.durationA.textContent = fmt(endATime - startATime);
		} else {
			this.startA.textContent = "-";
			this.endA.textContent = "-";
			this.durationA.textContent = "-";
		}

		if (this.videoB.hasVideo) {
			const startBTime = this.videoB.timeAtFrame(this.videoB.startFrame);
			const endBTime = this.videoB.timeAtFrame(this.videoB.endFrame);
			this.startB.textContent = fmt(startBTime);
			this.endB.textContent = fmt(endBTime);
			this.durationB.textContent = fmt(endBTime - startBTime);
		} else {
			this.startB.textContent = "-";
			this.endB.textContent = "-";
			this.durationB.textContent = "-";
		}
	}
}

export let syncEditor = new SyncEditor();