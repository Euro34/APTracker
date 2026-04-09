// import { apTracker } from "../main";

// Card
const openSyncEditorBtn = document.getElementById("open-sync-editor") as HTMLButtonElement;
const closeSyncEditorBtn = document.getElementById("close-sync-editor") as HTMLButtonElement;

openSyncEditorBtn.addEventListener("click", () => {
    const syncEditor = document.querySelector(".SyncEditor") as HTMLDivElement;
    syncEditor.classList.add("active");
});

closeSyncEditorBtn.addEventListener("click", () => {
    const syncEditor = document.querySelector(".SyncEditor") as HTMLDivElement;
    syncEditor.classList.remove("active");
});



// SyncEditor
type TrimState = {
	startFrame: number;
	endFrame: number;
};

class VideoHandler {
	public file: File;
	public frameTimestamps: number[] = [];

	private label: HTMLDivElement;
	public video: HTMLVideoElement;
	private toStartBtn: HTMLButtonElement;
	private playBtn: HTMLButtonElement;
	private toEndBtn: HTMLButtonElement;

	private startTimeDisplay: HTMLDivElement;
	private startBackBtn: HTMLButtonElement;
	private startForwardBtn: HTMLButtonElement;

	private endTimeDisplay: HTMLDivElement;
	private endBackBtn: HTMLButtonElement;
	private endForwardBtn: HTMLButtonElement;

	private trimSelection: HTMLDivElement;
	private playhead: HTMLDivElement;
	private durationDisplay: HTMLDivElement;

	public startFrame: number = 0;
	public endFrame: number = 0;

	// Getters so SyncEditor can read times directly
	get startTime(): number {
		return this.frameTimestamps[this.startFrame] ?? 0;
	}
	get endTime(): number {
		return this.frameTimestamps[this.endFrame] ?? this.video.duration ?? 0;
	}
	get totalFrames(): number {
		return this.frameTimestamps.length;
	}
	get hasVideo(): boolean {
		return this.file.size > 0 && this.frameTimestamps.length > 0;
	}

	constructor(name: string) {
		this.file = new File([], "");

		const videoContainer = document.getElementById(`video-container-${name}`) as HTMLDivElement;
		if (!videoContainer) console.warn(`Container for video ${name} not found.`);

		const player = document.getElementById(`player-${name}`) as HTMLDivElement;
		if (!player) console.warn(`Player for ${name} not found.`);

		const trim = document.getElementById(`trim-${name}`) as HTMLDivElement;
		if (!trim) console.warn(`Trim control for ${name} not found.`);

		this.label = videoContainer.querySelector(".video-label") as HTMLDivElement;
		this.video = videoContainer.querySelector("video") as HTMLVideoElement;

		this.toStartBtn = player.querySelector(".to-start") as HTMLButtonElement;
		this.playBtn = player.querySelector(".play") as HTMLButtonElement;
		this.toEndBtn = player.querySelector(".to-end") as HTMLButtonElement;

		const startControl = trim.querySelector(".start") as HTMLDivElement;
		this.startTimeDisplay = startControl.querySelector(".label") as HTMLDivElement;
		this.startBackBtn = startControl.querySelector(".back") as HTMLButtonElement;
		this.startForwardBtn = startControl.querySelector(".forward") as HTMLButtonElement;

		const endControl = trim.querySelector(".end") as HTMLDivElement;
		this.endTimeDisplay = endControl.querySelector(".label") as HTMLDivElement;
		this.endBackBtn = endControl.querySelector(".back") as HTMLButtonElement;
		this.endForwardBtn = endControl.querySelector(".forward") as HTMLButtonElement;

		this.trimSelection = trim.querySelector(".trim-selection") as HTMLDivElement;
		this.playhead = trim.querySelector(".playhead") as HTMLDivElement;
		this.durationDisplay = trim.querySelector(".duration") as HTMLDivElement;

		// Trim bar drag
		this.initTrimBarDrag(trim);

		// Playback
		this.playBtn.addEventListener("click", () => this.togglePlay());
		this.toStartBtn.addEventListener("click", () => this.seekToStart());
		this.toEndBtn.addEventListener("click", () => this.seekToEnd());

		// Frame stepping — back/forward wired externally by SyncEditor
        this.startBackBtn.addEventListener("click", () => this.stepStartFrame(-1));
        this.startForwardBtn.addEventListener("click", () => this.stepStartFrame(1));
        this.endBackBtn.addEventListener("click", () => this.stepEndFrame(-1));
        this.endForwardBtn.addEventListener("click", () => this.stepEndFrame(1));

		// Sync playhead display while playing
		this.video.addEventListener("timeupdate", () => this.updatePlayhead());
		this.video.addEventListener("pause", () => this.updatePlayBtn(false));
		this.video.addEventListener("play", () => this.updatePlayBtn(true));
		this.video.addEventListener("ended", () => {
			this.updatePlayBtn(false);
			this.seekToStart();
		});

		// this.setDefault();
	}

	// ── Playback ──────────────────────────────────────────────────────────────

	public togglePlay() {
		if (!this.hasVideo) return;
		if (this.video.paused) {
			// If at or past end trim, rewind first
			if (this.video.currentTime >= this.endTime) {
				this.video.currentTime = this.startTime;
			}
			this.video.play();
		} else {
			this.video.pause();
		}
	}

	public pause() {
		this.video.pause();
	}

	public seekToStart() {
		this.seekToTime(this.startTime);
	}

	public seekToEnd() {
		this.seekToTime(this.endTime);
	}

	public seekToTime(time: number) {
		if (!this.hasVideo) return;
		this.video.currentTime = time;
	}

	private updatePlayBtn(playing: boolean) {
		this.playBtn.textContent = playing ? "⏸" : "▶";
	}

	// ── Frame stepping ────────────────────────────────────────────────────────

	// Called directly for unlinked mode, or by SyncEditor for linked mode
	public stepStartFrame(delta: number) {
		if (!this.hasVideo) return;
		const next = Math.max(0, Math.min(this.endFrame - 1, this.startFrame + delta));
		this.startFrame = next;
		this.seekToTime(this.startTime);
		this.updateTrimDisplay();
	}

	public stepEndFrame(delta: number) {
		if (!this.hasVideo) return;
		const next = Math.max(this.startFrame + 1, Math.min(this.totalFrames - 1, this.endFrame + delta));
		this.endFrame = next;
		this.seekToTime(this.endTime);
		this.updateTrimDisplay();
	}
	// ── Trim bar drag ─────────────────────────────────────────────────────────

	private initTrimBarDrag(trim: HTMLDivElement) {
        const bar = trim.querySelector(".trim-selection") as HTMLDivElement;
        if (!bar) { console.warn("trim-bar not found"); return; }

        const PLAYHEAD_HIT = 0.1;
        const HANDLE_HIT = 0.1;

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
            const frac = fracFromEvent(e);
            const startFrac = getStartFrac();
            const endFrac = getEndFrac();
            const playFrac = getPlayFrac();

            if (Math.abs(frac - startFrac) < HANDLE_HIT) {
                dragging = "start-handle";
            } else if (Math.abs(frac - endFrac) < HANDLE_HIT) {
                dragging = "end-handle";
            } else if (Math.abs(frac - playFrac) < PLAYHEAD_HIT) {
                dragging = "playhead";
            } else if (frac > startFrac && frac < endFrac) {
                dragging = "window";
                windowDragStartFrac = frac;
                windowDragStartFrame = this.startFrame;
                windowDragEndFrame = this.endFrame;
            }
            e.preventDefault();
        };

        const onMove = (e: MouseEvent | TouchEvent) => {
            if (!dragging || !this.hasVideo) return;
            const frac = fracFromEvent(e);

            if (dragging === "start-handle") {
                this.startFrame = Math.max(0, Math.min(this.endFrame - 1, frameFromFrac(frac)));
                this.seekToTime(this.startTime);
                this.updateTrimDisplay();
            } else if (dragging === "end-handle") {
                this.endFrame = Math.max(this.startFrame + 1, Math.min(this.totalFrames - 1, frameFromFrac(frac)));
                this.seekToTime(this.endTime);
                this.updateTrimDisplay();
            } else if (dragging === "playhead") {
                const clamped = Math.max(getStartFrac(), Math.min(getEndFrac(), frac));
                this.seekToTime(clamped * this.video.duration);
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

	// ── Display updates ───────────────────────────────────────────────────────

	private updatePlayhead() {
		if (!this.hasVideo || !this.video.duration) return;
		// Stop playback at end trim
		if (this.video.currentTime >= this.endTime) {
			this.video.pause();
			this.video.currentTime = this.endTime;
		}
        
		const frac = this.video.currentTime / this.video.duration;
		this.playhead.style.setProperty("--pos", `${frac * 100}%`);
	}

	public updateTrimDisplay() {
		if (!this.hasVideo) return;
		const total = this.totalFrames - 1;
		const startFrac = this.startFrame / total;
		const endFrac = this.endFrame / total;

		this.trimSelection.style.setProperty("--start", `${startFrac * 100}%`);
		this.trimSelection.style.setProperty("--end", `${endFrac * 100}%`);

		this.startTimeDisplay.textContent = this.formatTime(this.startTime);
		this.endTimeDisplay.textContent = this.formatTime(this.endTime);

		const duration = this.endTime - this.startTime;
		if (this.durationDisplay) {
			this.durationDisplay.textContent = `Duration: ${this.formatTime(duration)}`;
		}
	}

	private formatTime(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);

        // Count how many frames fall within the same whole second
        const secondStart = Math.floor(seconds);
        const framesIntoSecond = this.frameTimestamps.filter(t => t >= secondStart && t < seconds).length;

        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(framesIntoSecond).padStart(2, "0")}`;
    }

	// ── Load / reset ──────────────────────────────────────────────────────────

	public updateVideo(file: File, timestamps: number[]) {
        this.file = file;
        this.frameTimestamps = timestamps;

        const src = URL.createObjectURL(file);
        this.label.textContent = file.name;
        this.video.src = src;
        this.video.load();

        this.startFrame = 0;
        this.endFrame = timestamps.length - 1;

        // Seek to first frame once metadata is ready
        this.video.addEventListener("loadedmetadata", () => {
            this.video.currentTime = timestamps[0] ?? 0;
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
		if (this.durationDisplay) this.durationDisplay.textContent = "Duration: 00:00.00";
	}
}

// ── SyncEditor ────────────────────────────────────────────────────────────────

class SyncEditor {
	private videoA: VideoHandler;
	private videoB: VideoHandler;

	// Cache by filename so we can detect which slot each file belongs to
	private fileCache: Map<string, { file: File; timestamps: number[] }> = new Map();

	constructor() {
		this.videoA = new VideoHandler("A");
		this.videoB = new VideoHandler("B");

		// Both player
		const playerBoth = document.getElementById("player-Both") as HTMLDivElement;
		playerBoth.querySelector(".play")!.addEventListener("click", () => this.playBoth());
		playerBoth.querySelector(".to-start")!.addEventListener("click", () => this.toStartBoth());
		playerBoth.querySelector(".to-end")!.addEventListener("click", () => this.toEndBoth());
	}

	// ── Playback ──────────────────────────────────────────────────────────────

	private playBoth() {
        
		this.videoA.video.play();
		this.videoB.video.play();
	}

	private toStartBoth() {
		this.videoA.seekToStart();
		this.videoB.seekToStart();
	}

	private toEndBoth() {
		this.videoA.seekToEnd();
		this.videoB.seekToEnd();
	}

	// ── Match duration ────────────────────────────────────────────────────────

	public matchBDurationToA() {
		if (!this.videoA.hasVideo || !this.videoB.hasVideo) return;
		const targetDuration = this.videoA.endTime - this.videoA.startTime;
		const bStart = this.videoB.startTime;
		const targetEndTime = bStart + targetDuration;

		// Find the closest frame in B to targetEndTime
		const timestamps = this.videoB.frameTimestamps;
		let closest = timestamps.length - 1;
		let minDiff = Infinity;
		for (let i = 0; i < timestamps.length; i++) {
			const diff = Math.abs(timestamps[i] - targetEndTime);
			if (diff < minDiff) { minDiff = diff; closest = i; }
		}
		this.videoB.endFrame = Math.max(this.videoB.startFrame + 1, closest);
		this.videoB.updateTrimDisplay();
	}

	// ── File management ───────────────────────────────────────────────────────

	// Returns the trim state for both videos — call this when proceeding to tracking
	public getTrimState(): { a: TrimState | null; b: TrimState | null } {
		return {
			a: this.videoA.hasVideo ? { startFrame: this.videoA.startFrame, endFrame: this.videoA.endFrame } : null,
			b: this.videoB.hasVideo ? { startFrame: this.videoB.startFrame, endFrame: this.videoB.endFrame } : null,
		};
	}

	public updateVideos(files: File[], frameTimestamps: number[][]) {
		// Build a name->data map from incoming files
		const incoming = new Map<string, { file: File; timestamps: number[] }>();
		files.forEach((f, i) => {
			incoming.set(f.name, { file: f, timestamps: frameTimestamps[i] ?? [] });
		});

		// Merge into cache (add new, remove deleted)
		// Remove files no longer present
		for (const name of this.fileCache.keys()) {
			if (!incoming.has(name)) this.fileCache.delete(name);
		}
		// Add/update incoming files
		for (const [name, data] of incoming) {
			this.fileCache.set(name, data);
		}

		// Determine A and B slots
		// A = files[0] if present, B = files[1] if present
		// But since array only contains remaining files, we preserve slot
		// by checking if the existing slot's filename is still in the cache
		const aStillPresent = this.videoA.file.name !== "" && this.fileCache.has(this.videoA.file.name);
		const bStillPresent = this.videoB.file.name !== "" && this.fileCache.has(this.videoB.file.name);

		// Collect truly new files (not currently loaded in either slot)
		const newFiles = [...this.fileCache.values()].filter(
			d => d.file.name !== this.videoA.file.name && d.file.name !== this.videoB.file.name
		);

		// Reset slots that lost their file
		if (!aStillPresent) this.videoA.reset();
		if (!bStillPresent) this.videoB.reset();

		// Assign new files to empty slots, A first then B
		for (const data of newFiles) {
			if (!this.videoA.hasVideo) {
				this.videoA.updateVideo(data.file, data.timestamps);
			} else if (!this.videoB.hasVideo) {
				this.videoB.updateVideo(data.file, data.timestamps);
			}
		}
	}
}

export let syncEditor = new SyncEditor();