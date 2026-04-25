import { VideoState } from "../core/VideoState";
import { extractAllFrameTimestamps } from "../core/ExtractFrame";

export class Upload {
	private uploadArea = document.getElementById("upload-area") as HTMLDivElement;
	private previewGrid = document.getElementById("preview-grid") as HTMLDivElement;
	private fileInput = document.getElementById("video-upload") as HTMLInputElement;

	private fileCache = new Map<string, { file: File; }>();

	private states: [VideoState, VideoState];

	private frameExtractionController: AbortController | null = null;

	constructor(states: [VideoState, VideoState]) {
		this.states = states;
		this.uploadArea.addEventListener("click", () => this.fileInput.click());

		this.fileInput.addEventListener("change", () => {
			if (this.fileInput.files) this.handleNewFiles(Array.from(this.fileInput.files));
			this.fileInput.value = "";
		});

		this.uploadArea.addEventListener("dragover", (e) => {
			e.preventDefault();
			this.uploadArea.classList.add("drag-over");
		});
		this.uploadArea.addEventListener("dragleave", () => {
			this.uploadArea.classList.remove("drag-over");
		});
		this.uploadArea.addEventListener("drop", (e) => {
			e.preventDefault();
			this.uploadArea.classList.remove("drag-over");
			if (e.dataTransfer?.files) this.handleNewFiles(Array.from(e.dataTransfer.files));
		});
	}

	private handleNewFiles(newFiles: File[]): void {
		const videoFiles = newFiles.filter((f) => f.type.startsWith("video/"));
		const slots = 2 - this.fileCache.size;
		const toAdd = videoFiles.slice(0, slots);

		for (const file of toAdd) {
			// Prevent duplicate file
			if (!this.fileCache.has(file.name)) {
				this.fileCache.set(file.name, { file });
			}
		}

		this.assignSlotsAndExtract();
	}

	private removeFile(index: number): void {
		const state = this.states[index];
		if (state.file.name) this.fileCache.delete(state.file.name);

		const card = this.previewGrid.children[index] as HTMLElement;
		const video = card.querySelector("video");
		if (video?.src) URL.revokeObjectURL(video.src);

		this.assignSlotsAndExtract();
	}

	// Core slot management — mirrors SyncEditor.updateVideos logic
	private assignSlotsAndExtract(): void {
		const [stateA, stateB] = this.states;

		const aStillPresent = stateA.file.name !== "" && this.fileCache.has(stateA.file.name);
		const bStillPresent = stateB.file.name !== "" && this.fileCache.has(stateB.file.name);

		// Snapshot B's full state before any reset
		const bSnapshot = bStillPresent ? stateB.snapshot() : null;

		if (!aStillPresent) stateA.reset();
		if (!bStillPresent) stateB.reset();

		// Shift B -> A if A is empty but B has video
		if (!stateA.hasVideo && stateB.hasVideo && bSnapshot) {
			stateA.assignFromSnapshot(bSnapshot);
			stateB.reset();
		}

		// Assign new cache entries to empty slots
		const newFiles = [...this.fileCache.values()].filter(
			(d) => d.file.name !== stateA.file.name && d.file.name !== stateB.file.name
		);
		for (const data of newFiles) {
			if (!stateA.hasVideo) {
				stateA.updateVideo(data.file);
			} else if (!stateB.hasVideo) {
				stateB.updateVideo(data.file);
			}
		}
		
		this.render();
        this.extractAndUpdate();
	}

	private async extractAndUpdate(): Promise<void> {
        const videos = this.states.filter((s) => s.hasVideo).map((s) => s.file);

        if (this.frameExtractionController) { this.frameExtractionController.abort( videos ); }

        this.frameExtractionController = new AbortController();
        const { signal } = this.frameExtractionController;

		try {
			const frameTimestamps = await extractAllFrameTimestamps(videos, signal);
			frameTimestamps.forEach((ts, idx) => {
				this.states[idx].updateTimestamps(ts);
			});
		} catch (error: any) {
			if (error.name === 'AbortError') {
                console.log("Previous extraction cancelled.");
            } else {
                console.error("Error extracting frame timestamps:", error);
            }
		}
    }

	private render(): void {
		const count = this.fileCache.size;

		this.uploadArea.classList.toggle("hidden", count === 2);
		this.fileInput.classList.toggle("hidden", count === 2);
		this.previewGrid.classList.toggle("hidden", count === 0);

		if (count === 0) {
			this.uploadArea.querySelector("p")!.textContent = "Click or drag and drop to upload videos";
		} else if (count === 1) {
			this.uploadArea.querySelector("p")!.textContent = "Click or drag and drop to upload the second video";
		}

		this.previewGrid.innerHTML = "";

		// Render cards in slot order (A first, then B)
		this.states.forEach((state, index) => {
			if (!state.hasVideo) return;

			const objectURL = URL.createObjectURL(state.file);
			const card = document.createElement("div");
			card.className = "preview-card";

			const video = document.createElement("video");
			video.src = objectURL;
			video.muted = true;
			video.currentTime = 0.01;
			video.load();

			const filename = document.createElement("div");
			filename.className = "filename";
			filename.textContent = state.file.name;

			const removeBtn = document.createElement("button");
			removeBtn.className = "remove-btn";
			removeBtn.title = "Remove";
			removeBtn.textContent = "✕";
			removeBtn.addEventListener("click", () => this.removeFile(index));

			card.append(video, filename, removeBtn);
			this.previewGrid.appendChild(card);
		});
	}
}