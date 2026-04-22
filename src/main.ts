import { Point2D } from "./core/Types";
import { ReferenceObject } from "./core/ReferenceObject";

import { updateStatus } from "./UI/workflow";
import { upload } from "./UI/upload";
import { extractAllFrameTimestamps } from "./core/ExtractFrame";
import { syncEditor } from "./UI/sync";
import { refObjDim } from "./UI/reference_object_dimension";
import { refObjMarker } from "./UI/reference_object_marker";

interface ExportedVideo {
    name: string;
    type: string;
    lastModified: number;
    dataUrl?: string; // base64, present only if size allows
}

interface APTrackerExport {
    version: 1;
    exportedAt: string;
    hasVideoData: boolean;
    videos: ExportedVideo[];
    frameTimestamps: number[][];
    trimStates: (number | null)[];
    referenceObject: ReferenceObject | null;
    referenceCorners: (Point2D | null)[][];
    projectionMatrix: number[][];
}

class APTracker {
    private export_btn = document.getElementById("export") as HTMLButtonElement;
    private import_btn = document.getElementById("import") as HTMLButtonElement;

    public uploadedVideos: File[] = [];
    public frameTimestamps: number[][] = [];
    public trimStates: (number | null)[] = []; // [start1, end1, start2, end2] (in frame number)
    public referenceObject: ReferenceObject | null = null;
    public referenceCorners: (Point2D | null)[][] = [];
    public projectionMatrix: number[][] = [];

    private frameExtractionController: AbortController | null = null;

    constructor() {
        this.export_btn.addEventListener("click", () => this.exportData());
        this.import_btn.addEventListener("click", () => this.importData());
    }

    public updateVideos(videos: File[]) {
        this.uploadedVideos = videos;
        this.uploadStatus();
        this.updateFrameTimestamps();
    }

    private uploadStatus() {
        if (this.uploadedVideos.length === 2) {
            updateStatus("Upload", "done");
        } else if (this.uploadedVideos.length === 1) {
            updateStatus("Upload", "inprogress");
        } else if (this.uploadedVideos.length === 0) {
            updateStatus("Upload", "");
        }
    }

    public async updateFrameTimestamps() {
        if (this.frameExtractionController) {
            this.frameExtractionController.abort(this.uploadedVideos);
        }

        this.frameExtractionController = new AbortController();
        const { signal } = this.frameExtractionController;
        this.export_btn.disabled = true;
        this.export_btn.title = "Extracting frame timestamps...";
        
        try {
            this.frameTimestamps = await extractAllFrameTimestamps(this.uploadedVideos, signal);
            refObjMarker.updateVideo(this.uploadedVideos, this.frameTimestamps);
            syncEditor.updateVideos(this.uploadedVideos, this.frameTimestamps);
        } catch (error: any) {
            this.frameTimestamps = [];
            if (error.name === 'AbortError') {
                console.log("Previous extraction cancelled.");
            } else {
                console.error("Error extracting frame timestamps:", error);
            }
        } finally {
		    this.export_btn.disabled = false;
            this.export_btn.title = "Export";
        }
    }

    public updateSync(trimStates: (number | null)[]) {
        this.trimStates = trimStates;
        this.syncStatus();
        refObjMarker.updateTrim(this.trimStates);
    }

    private syncStatus() {
        const [start1, end1, start2, end2] = this.trimStates;
        const duration1 = end1 !== null && start1 !== null ? this.frameTimestamps[0][end1] - this.frameTimestamps[0][start1] : null;
        const duration2 = end2 !== null && start2 !== null ? this.frameTimestamps[1][end2] - this.frameTimestamps[1][start2] : null;

        if (start1 === null || end1 === null || start2 === null || end2 === null) {
            updateStatus("Sync", "");
        } else if (Math.abs(duration1! - duration2!) < 0.05) {// Allow tolerance of 50ms
            updateStatus("Sync", "done");
        } else {
            updateStatus("Sync", "inprogress");
        }
    }

    public updateReferenceObject(width: number | null, length: number | null, height: number | null) {
        let nullCount = 0;
        if (Number.isNaN(width)) nullCount++;
        if (Number.isNaN(length)) nullCount++;
        if (Number.isNaN(height)) nullCount++;

        if (nullCount == 0) {
            this.referenceObject = new ReferenceObject(width!, length!, height!);
            updateStatus("RefDim", "done");
        } else {
            this.referenceObject = null;
            if (nullCount != 3) {
                updateStatus("RefDim", "inprogress");
            } else {
                updateStatus("RefDim", "");
            }
        }

        refObjMarker.updateBoxDimensions(width, length, height);
    }

    public updateReferenceCorners(referenceCorners: (Point2D | null)[][]) {
        this.referenceCorners = referenceCorners;
        this.updateReferenceCornersStatus();
    }

    private updateReferenceCornersStatus() {
        let markedCount = [0, 0];
        this.referenceCorners.forEach((video, index) => {
            video.forEach((corner) => {
                if (corner !== null) markedCount[index]++;
            });
        });
        if (markedCount[0] >= 6 && markedCount[1] >= 6) {
            updateStatus("RefCorner", "done");
        } else if (markedCount[0] > 0 || markedCount[1] > 0) {
            updateStatus("RefCorner", "inprogress");
        } else {
            updateStatus("RefCorner", "");
        }
    }

    private async exportData(): Promise<void> {
        // Attempt to read each video as base64; fall back to metadata-only if too large
        const videos: ExportedVideo[] = await Promise.all(
            this.uploadedVideos.map(async (file) => {
                const dataUrl = await this.fileToDataUrl(file).catch(() => null);
                return {
                    name: file.name,
                    type: file.type,
                    lastModified: file.lastModified,
                    ...(dataUrl ? { dataUrl } : {}),
                };
            })
        );

        const hasVideoData = videos.every((v) => v.dataUrl !== undefined);

        const payload: APTrackerExport = {
            version: 1,
            exportedAt: new Date().toISOString(),
            hasVideoData,
            videos,
            frameTimestamps: this.frameTimestamps,
            trimStates: this.trimStates,
            referenceObject: this.referenceObject,
            referenceCorners: this.referenceCorners,
            projectionMatrix: this.projectionMatrix,
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `APTracker_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        if (!hasVideoData) {
            alert(
                "Note: One or more videos exceeded 50 MB and were not embedded.\n" +
                "You will need to re-upload them after importing this file."
            );
        }
    }

    private importData(): void {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";

        input.addEventListener("change", async () => {
            const file = input.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data: APTrackerExport = JSON.parse(text);

                if (data.version !== 1) {
                    alert("Incompatible export file version.");
                    return;
                }

                // Restore video Files if base64 data is present
                if (data.hasVideoData) {
                    this.uploadedVideos = data.videos.map((v) =>this.dataUrlToFile(v.dataUrl!, v));
                    this.frameTimestamps = data.frameTimestamps;

                    upload.imported(this.uploadedVideos);
                    this.uploadStatus();
                } else {
                    alert("Session restored (no video data in file).\nPlease re-upload the original video files before importing this file.");
                }

                // Trim
                if (data.trimStates !== undefined) {
                    this.trimStates = data.trimStates;
                    syncEditor.imported(this.uploadedVideos, this.frameTimestamps, this.trimStates);
                    this.syncStatus();
                }

                // RefObjDim
                if (data.referenceObject !== undefined) {
                    this.referenceObject = data.referenceObject;
                    refObjDim.imported(this.referenceObject?.width ?? NaN, this.referenceObject?.length ?? NaN, this.referenceObject?.height ?? NaN);
                    this.updateReferenceObject(this.referenceObject?.width ?? NaN, this.referenceObject?.length ?? NaN, this.referenceObject?.height ?? NaN);
                }

                // RefObjMarker
                if (data.referenceCorners !== undefined) {
                    this.referenceCorners = data.referenceCorners;
                    refObjMarker.imported(this.uploadedVideos, this.frameTimestamps, this.trimStates, this.referenceCorners);
                    this.updateReferenceCornersStatus();
                }
                this.projectionMatrix = data.projectionMatrix;

            } catch (err) {
                alert("Failed to import: file is corrupted or not a valid APTracker export.");
                console.error(err);
            }
        });
        input.click();
    }

    // Helpers
    // Read a File as a base64 data URL. Returns null if the file is too large (>50 MB)
    private async fileToDataUrl(file: File): Promise<string | null> {
        const MAX_BYTES = 50 * 1024 * 1024; // 50 MB per video
        if (file.size > MAX_BYTES) return null;

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    // Reconstruct a File from a base64 data URL
    private dataUrlToFile(dataUrl: string, meta: ExportedVideo): File {
        const [header, base64] = dataUrl.split(",");
        const mime = header.match(/:(.*?);/)![1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new File([bytes], meta.name, {
            type: mime,
            lastModified: meta.lastModified,
        });
    }
}


export let apTracker = new APTracker();
// Add info: Play Both don't sync on Safari