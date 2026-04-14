import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

const progressBar = document.getElementById("loading-fill") as HTMLElement;
const loadingText = document.getElementById("loading-text") as HTMLElement;
const loadingScreen = document.getElementById("loading-screen") as HTMLElement;

// Track the pending hide timeout so we can cancel it if re-shown
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function updateProgress(value: number): void {
	const clamped = Math.min(100, value);
	progressBar.style.setProperty("--level", `${clamped}%`);
	loadingText.textContent = `${clamped.toFixed(2)}%`;

	if (clamped >= 100) {
		hideTimeout = setTimeout(() => {
			loadingScreen.classList.remove("active");
			hideTimeout = null;
		}, 500);
	}
}

function showLoadingScreen(): void {
	// Cancel any pending hide from a previous run
	if (hideTimeout !== null) {
		clearTimeout(hideTimeout);
		hideTimeout = null;
	}
	loadingScreen.classList.add("active");
	progressBar.style.setProperty("--level", "0%");
	loadingText.textContent = "0.00%";
}

let ffmpegInstance: FFmpeg | null = null;

class TimestampCache {
	private cache = new Map<string, number[]>();
	private readonly maxEntries: number;

	constructor(maxEntries = 10) {
		this.maxEntries = maxEntries;
	}

	get(key: string): number[] | undefined {
		if (!this.cache.has(key)) return undefined;
		const value = this.cache.get(key)!;
		this.cache.delete(key);
		this.cache.set(key, value);
		return value;
	}

	set(key: string, value: number[]): void {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxEntries) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey !== undefined) {
				this.cache.delete(oldestKey);
			}
		}
		this.cache.set(key, value);
	}
}

const timestampCache = new TimestampCache(10);

// Load FFmpeg once, no progress listener attached permanently
async function getFFmpeg(): Promise<FFmpeg> {
	if (ffmpegInstance) return ffmpegInstance;
	ffmpegInstance = new FFmpeg();
	await ffmpegInstance.load();
	return ffmpegInstance;
}

// Returns total frame count from a file using ffprobe-style log parsing
// Used to calculate progress percentage during extraction
async function getFrameCount(ffmpeg: FFmpeg, inputName: string): Promise<number> {
	let frameCount = 0;

	const logHandler = ({ message }: { message: string }) => {
		// "frame= 1234" appears in the final stats line
		const match = message.match(/frame=\s*(\d+)/);
		if (match) frameCount = parseInt(match[1]);
	};

	ffmpeg.on("log", logHandler);
	// Run a fast pass — no decoding, just container scan
	await ffmpeg.exec(["-i", inputName, "-map", "0:v:0", "-c", "copy", "-f", "null", "-"]);
	ffmpeg.off("log", logHandler);

	return frameCount;
}

async function extractFrameTimestamps(ffmpeg: FFmpeg, file: File, onProgress?: (p: number) => void): Promise<number[]> {
	const cacheKey = `${file.name}-${file.size}`;
	const cached = timestampCache.get(cacheKey);
	if (cached) {
		onProgress?.(100);
		return cached;
	}

	const inputName = `input_${file.name}`;
	await ffmpeg.writeFile(inputName, await fetchFile(file));

	// Get total frames first so we can compute real progress
	const totalFrames = await getFrameCount(ffmpeg, inputName);
	let processedFrames = 0;

	const timestamps: number[] = [];

	const logHandler = ({ message }: { message: string }) => {
		const tsMatch = message.match(/pts_time:([\d.]+)/);
		if (tsMatch) {
			timestamps.push(parseFloat(tsMatch[1]));

			// Each pts_time log = one frame processed
			processedFrames++;
			if (totalFrames > 0) {
				onProgress?.((processedFrames / totalFrames) * 100);
			}
		}
	};

	ffmpeg.on("log", logHandler);
	await ffmpeg.exec(["-i", inputName, "-vf", "showinfo", "-f", "null", "-"]);
	ffmpeg.off("log", logHandler);

	await ffmpeg.deleteFile(inputName);
	onProgress?.(100);
	timestampCache.set(cacheKey, timestamps);
	return timestamps;
}

export async function extractAllFrameTimestamps(files: File[]): Promise<number[][]> {
	if (files.length === 0) return [];

	showLoadingScreen();

	const ffmpeg = await getFFmpeg();
	const results: number[][] = [];

	for (let i = 0; i < files.length; i++) {
		const fileBaseProgress = 100 * (i / files.length);

		const timestamps = await extractFrameTimestamps(
			ffmpeg,
			files[i],
			(fileProgress) => {
				updateProgress(fileBaseProgress + (fileProgress / files.length));
			},
		);

		results.push(timestamps);
	}

	updateProgress(100);
	return results;
}