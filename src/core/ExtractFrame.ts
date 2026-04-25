import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

const progressBar = document.getElementById("loading-fill") as HTMLElement;
const loadingText = document.getElementById("loading-text") as HTMLElement;
const loadingScreen = document.getElementById("loading-screen") as HTMLElement;
const export_btn = document.getElementById("export") as HTMLButtonElement;

// UI Management
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let activeUploads = 0;

function updateProgress(value: number): void {
    const clamped = Math.min(100, value);
    progressBar.style.setProperty("--level", `${clamped}%`);
    loadingText.textContent = `${clamped.toFixed(2)}%`;

    if (clamped >= 100 && activeUploads > 0) {
        if (!hideTimeout) {
            hideTimeout = setTimeout(() => {
                activeUploads--;
                if (activeUploads <= 0) {
                    activeUploads = 0;
                    loadingScreen.classList.remove("active");
                }
                hideTimeout = null;
            }, 500);
        }
    }
}

function showLoadingScreen(): void {
    activeUploads++;
    if (hideTimeout !== null) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
    loadingScreen.classList.add("active");
    progressBar.style.setProperty("--level", "0%");
    loadingText.textContent = "0.00%";
}

function abortLoadingScreen(): void {
    activeUploads--;
    if (activeUploads <= 0) {
        activeUploads = 0;
        loadingScreen.classList.remove("active");
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
    }
}

// ffmpeg & caching
let ffmpegInstance: FFmpeg | null = null;

class TimestampCache {
    private cache = new Map<string, number[]>();
	private readonly maxEntries: number;
	constructor(maxEntries: number = 10) {
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
        if (this.cache.has(key)) this.cache.delete(key);
        else if (this.cache.size >= this.maxEntries) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) this.cache.delete(oldestKey);
        }
        this.cache.set(key, value);
    }
}
const timestampCache = new TimestampCache(10);

async function getFFmpeg(): Promise<FFmpeg> {
    if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;
    ffmpegInstance = new FFmpeg();
    await ffmpegInstance.load();
    return ffmpegInstance;
}

async function getFrameCount(ffmpeg: FFmpeg, inputName: string): Promise<number> {
    let frameCount = 0;
    const logHandler = ({ message }: { message: string }) => {
        const match = message.match(/frame=\s*(\d+)/);
        if (match) frameCount = parseInt(match[1]);
    };
    ffmpeg.on("log", logHandler);
    await ffmpeg.exec(["-i", inputName, "-map", "0:v:0", "-c", "copy", "-f", "null", "-"]);
    ffmpeg.off("log", logHandler);
    return frameCount;
}

// in-flight extraction tracker
interface InFlightTask {
    promise: Promise<number[]>;
    progressCallbacks: ((p: number) => void)[];
}
const inFlight = new Map<string, InFlightTask>();

async function extractFrameTimestamps(file: File, signal?: AbortSignal, onProgress?: (p: number) => void): Promise<number[]> {
    const cacheKey = `${file.name}-${file.size}`;
    
    const cached = timestampCache.get(cacheKey);
    if (cached) {
        onProgress?.(100);
        return cached;
    }

    // Smart-Abort Hook: Unbind old UI callbacks if the request is aborted
    const handleProgressUnbind = (task: InFlightTask) => {
        if (!onProgress) return;
        const unbind = () => {
            const idx = task.progressCallbacks.indexOf(onProgress);
            if (idx > -1) task.progressCallbacks.splice(idx, 1);
        };
        signal?.addEventListener('abort', unbind);
    };

    // If it's already processing, just attach the new progress callback and await it!
    if (inFlight.has(cacheKey)) {
        const task = inFlight.get(cacheKey)!;
        if (onProgress) task.progressCallbacks.push(onProgress);
        handleProgressUnbind(task);
        return task.promise;
    }

    const task: InFlightTask = {
        promise: null as any,
        progressCallbacks: onProgress ? [onProgress] : []
    };
    handleProgressUnbind(task);

    task.promise = (async () => {
        const ffmpeg = await getFFmpeg();

        const abortHandler = () => {
            // Check if the current file is in the new file list passed during abort()
            let isStillNeeded = false;
            if (signal?.reason && Array.isArray(signal.reason)) {
                isStillNeeded = signal.reason.some((v: File) => `${v.name}-${v.size}` === cacheKey);
            }

            if (!isStillNeeded) {
                try {
                    if (ffmpegInstance) {
                        ffmpegInstance.terminate(); 
                        ffmpegInstance = null;
                    }
                } catch (e) {}
            }
        };
        
        signal?.addEventListener("abort", abortHandler);

        try {
            const inputName = `input_${file.name}`;
            await ffmpeg.writeFile(inputName, await fetchFile(file));

            const totalFrames = await getFrameCount(ffmpeg, inputName);
            let processedFrames = 0;
            const timestamps: number[] = [];

            const logHandler = ({ message }: { message: string }) => {
                const tsMatch = message.match(/pts_time:([\d.]+)/);
                if (tsMatch) {
                    let isStillNeeded = false;
                    if (signal?.aborted && signal?.reason && Array.isArray(signal.reason)) {
                        isStillNeeded = signal.reason.some((v: File) => `${v.name}-${v.size}` === cacheKey);
                    }
                    if (signal?.aborted && !isStillNeeded) return;

                    timestamps.push(parseFloat(tsMatch[1]));
                    processedFrames++;
                    if (totalFrames > 0) {
                        const p = (processedFrames / totalFrames) * 100;
                        // Fire all bound UI callbacks
                        task.progressCallbacks.forEach(cb => cb(p));
                    }
                }
            };

            ffmpeg.on("log", logHandler);
            await ffmpeg.exec(["-i", inputName, "-vf", "showinfo", "-f", "null", "-"]);
            ffmpeg.off("log", logHandler);
            await ffmpeg.deleteFile(inputName);
            
            task.progressCallbacks.forEach(cb => cb(100));
            timestampCache.set(cacheKey, timestamps);
            return timestamps;

        } finally {
            signal?.removeEventListener("abort", abortHandler);
            inFlight.delete(cacheKey); // Clean up flight status
        }
    })();

    inFlight.set(cacheKey, task);
    return task.promise;
}

export async function extractAllFrameTimestamps(files: File[], signal?: AbortSignal): Promise<number[][]> {
    export_btn.disabled = true;
    export_btn.title = "Extracting frame timestamps...";

    if (files.length === 0) return [];

    showLoadingScreen();
    const results: number[][] = [];

    try {
        for (let i = 0; i < files.length; i++) {
            if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

            const fileBaseProgress = 100 * (i / files.length);
            
            const timestamps = await extractFrameTimestamps(
                files[i],
                signal,
                (p) => updateProgress(fileBaseProgress + (p / files.length))
            );

            results.push(timestamps);
        }
        updateProgress(100);
        return results;
    } catch (error: any) {
        const isAbort = signal?.aborted || error.message?.includes("terminate");

        if (isAbort) {
            abortLoadingScreen(); // Safely steps down the UI counter
            throw new DOMException("Extraction aborted", "AbortError");
        }
        abortLoadingScreen(); // Hide on fatal error
        throw error;
    } finally {
        export_btn.disabled = false;
        export_btn.title = "Export";
    }

}