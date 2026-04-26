import { ReferenceObject } from "./core/ReferenceObject";
import { Point2D } from "./core/Types";
import { VideoState } from "./core/VideoState";

import { updateStatus } from "./Module/workflow";
import { Upload } from "./Module/upload";
import { SyncEditor } from "./Module/sync";
import { ReferenceObjectDimension } from "./Module/reference_object_dimension";
import { ReferenceMarker } from "./Module/reference_marker";

const version = 1;

interface ExportedVideo {
	name: string;
	type: string;
	lastModified: number;
	dataUrl?: string;
}

interface ExportedState {
	frameTimestamps: number[];
	startFrame: number;
	endFrame: number;
	refCurrentTime: number;
	referenceMarks: (Point2D | null)[];
	targetMarks: (Point2D | null)[];
}

interface APTrackerExport {
	version: 1;
	exportedAt: string;
	hasVideoData: boolean;
	videos: ExportedVideo[];
	states: ExportedState[];
	referenceObject: ReferenceObject | null;
}

class APTracker {
    public states: [VideoState, VideoState] = [new VideoState(), new VideoState()];
    public upload = new Upload(this.states);
    public syncEditor = new SyncEditor(this.states);
    public refObjDim = new ReferenceObjectDimension();
    public referenceObject: ReferenceObject | null = null;
    public refObjMarker: ReferenceMarker = new ReferenceMarker(this.states);

    constructor() {
        document.getElementById("export")!.addEventListener("click", () => this.exportData());
        document.getElementById("import")!.addEventListener("click", () => this.importData());

        // DEBUG PURPOSE
        document.getElementById("setting")!.addEventListener("click", () => this.output());

        this.states.forEach((state) => {
            state.addEventListener("onUpload", () => this.updateUploadStatus());
            state.addEventListener("timestampsChange", () => this.updateSyncStatus());
            state.addEventListener("trimChange", () => this.updateSyncStatus());
            state.addEventListener("referenceChange", () => this.updateRefMarkerStatus());
            state.addEventListener("onReset", () => this.updateAllStatus());
        });
    }

    private updateAllStatus() {
        this.updateUploadStatus();
        this.updateSyncStatus();
        this.updateRefMarkerStatus();
    }

    private output() {
        this.states.forEach((state, idx) => {
            console.log((idx+1) + "\n" + state.toString());
        })
    }

    private updateUploadStatus() {
        if (this.states[0].hasVideo && this.states[1].hasVideo) {
            updateStatus("Upload", "done");
        } else if (this.states[0].hasVideo || this.states[1].hasVideo) {
            updateStatus("Upload", "inprogress");
        } else {
            updateStatus("Upload", "");
        }
    }

    private updateSyncStatus() {
        if (this.states[0].hasTimestamps && this.states[1].hasTimestamps) {
            if (Math.abs(this.states[0].duration - this.states[1].duration) <= 0.05) {
                updateStatus("Sync", "done");
            } else {
                updateStatus("Sync", "inprogress");
            }
        } else {
            updateStatus("Sync", "");
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

        this.refObjMarker.updateBoxDimensions(width, length, height);
    }

    private updateRefMarkerStatus() {
        let markedCount = [0, 0];
        this.states.forEach((state, index) => {
            state.referenceMarks.forEach((corner) => {
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
        const videos: ExportedVideo[] = await Promise.all(
            this.states.map(async (state) => {
                const dataUrl = state.hasVideo
                    ? await this.fileToDataUrl(state.file).catch(() => null)
                    : null;
                return {
                    name: state.file.name,
                    type: state.file.type,
                    lastModified: state.file.lastModified,
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
            states: this.states.map((s) => ({
                frameTimestamps: s.frameTimestamps,
                startFrame: s.startFrame,
                endFrame: s.endFrame,
                refCurrentTime: s.refCurrentTime,
                referenceMarks: s.referenceMarks,
                targetMarks: s.targetMarks,
            })),
            referenceObject: this.referenceObject,
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
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

                if (data.version !== version) {
                    alert("Incompatible export file version.");
                    return;
                }

                // Restore video files into states
                if (data.hasVideoData && data.videos.length > 0) {
                    const restoredFiles = data.videos.map((v) => this.dataUrlToFile(v.dataUrl!, v));
                    restoredFiles.forEach((file, i) => {
                        this.states[i].updateVideo(file);
                    });
                } else {
                    alert("Session restored (no video data in file).\nPlease re-upload the original video files.");
                }

                // Restore per-state data
                data.states.forEach((saved, i) => {
                    const state = this.states[i];
                    if (!state) return;
                    if (saved.frameTimestamps.length !== 0)state.updateTimestamps(saved.frameTimestamps);
                    if (!Number.isNaN(saved.startFrame) && !Number.isNaN(saved.endFrame)) state.updateTrim(saved.startFrame, saved.endFrame);
                    if (!Number.isNaN(saved.refCurrentTime)) state.refCurrentTime = saved.refCurrentTime;
                    saved.referenceMarks.forEach((mark, j) => state.updateReferenceMarks(j, mark));
                    saved.targetMarks.forEach((mark, j) => state.updateTargetMarks(j, mark));
                    
                    state.dispatchEvent(new Event("onImport"));
                });

                // RefObjDim
                if (data.referenceObject !== null) {
                    this.updateReferenceObject(data.referenceObject.width, data.referenceObject.length, data.referenceObject.height);
                    this.refObjDim.imported(data.referenceObject.width, data.referenceObject.length, data.referenceObject.height);
                }

                console.log("Import successful");
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