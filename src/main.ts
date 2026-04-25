import { VideoState } from "./core/VideoState";
import { ReferenceObject } from "./core/ReferenceObject";

import { updateStatus } from "./Module/workflow";
import { Upload } from "./Module/upload";
import { SyncEditor } from "./Module/sync";
// refObjDim
import {  } from "./Module/reference_object_dimension";
import { ReferenceMarker } from "./Module/reference_marker";

// const version = 1;

// interface ExportedVideo {
//     name: string;
//     type: string;
//     lastModified: number;
//     dataUrl?: string; // base64, present only if size allows
// }

// interface APTrackerExport {
//     version: 1;
//     exportedAt: string;
//     hasVideoData: boolean;
//     videos: ExportedVideo[];
//     frameTimestamps: number[][];
//     trimStates: (number | null)[];
//     referenceObject: ReferenceObject | null;
//     referenceCorners: (Point2D | null)[][];
//     projectionMatrix: number[][];
// }

class APTracker {
    // New
    public states: [VideoState, VideoState] = [new VideoState(), new VideoState()];
    public upload = new Upload(this.states);
    public syncEditor = new SyncEditor(this.states);
    public referenceObject: ReferenceObject | null = null;
    public refObjMarker: ReferenceMarker = new ReferenceMarker(this.states);

    constructor() {
        // document.getElementById("export")!.addEventListener("click", () => this.exportData());
        // document.getElementById("export")!.addEventListener("click", () => this.importData());

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

    }

    // private async exportData(): Promise<void> {
    //     // Attempt to read each video as base64; fall back to metadata-only if too large
    //     const videos: ExportedVideo[] = await Promise.all(
    //         this.uploadedVideos.map(async (file) => {
    //             const dataUrl = await this.fileToDataUrl(file).catch(() => null);
    //             return {
    //                 name: file.name,
    //                 type: file.type,
    //                 lastModified: file.lastModified,
    //                 ...(dataUrl ? { dataUrl } : {}),
    //             };
    //         })
    //     );

    //     const hasVideoData = videos.every((v) => v.dataUrl !== undefined);

    //     const payload: APTrackerExport = {
    //         version: version,
    //         exportedAt: new Date().toISOString(),
    //         hasVideoData,
    //         videos,
    //         frameTimestamps: this.frameTimestamps,
    //         trimStates: this.trimStates,
    //         referenceObject: this.referenceObject,
    //         referenceCorners: this.referenceCorners,
    //         projectionMatrix: this.projectionMatrix,
    //     };

    //     const blob = new Blob([JSON.stringify(payload, null, 2)], {
    //         type: "application/json",
    //     });
    //     const url = URL.createObjectURL(blob);
    //     const a = document.createElement("a");
    //     a.href = url;
    //     a.download = `APTracker_${Date.now()}.json`;
    //     a.click();
    //     URL.revokeObjectURL(url);

    //     if (!hasVideoData) {
    //         alert(
    //             "Note: One or more videos exceeded 50 MB and were not embedded.\n" +
    //             "You will need to re-upload them after importing this file."
    //         );
    //     }
    // }

    // private importData(): void {
    //     const input = document.createElement("input");
    //     input.type = "file";
    //     input.accept = ".json,application/json";

    //     input.addEventListener("change", async () => {
    //         const file = input.files?.[0];
    //         if (!file) return;

    //         try {
    //             const text = await file.text();
    //             const data: APTrackerExport = JSON.parse(text);

    //             if (data.version !== version) {
    //                 alert("Incompatible export file version.");
    //                 return;
    //             }

    //             // Restore video Files if base64 data is present
    //             if (data.hasVideoData && data.videos.length > 0) {
    //                 this.uploadedVideos = data.videos.map((v) =>this.dataUrlToFile(v.dataUrl!, v));
    //                 this.frameTimestamps = data.frameTimestamps;

    //                 upload.imported(this.uploadedVideos);
    //                 this.uploadStatus();
    //             } else {
    //                 alert("Session restored (no video data in file).\nPlease re-upload the original video files before importing this file.");
    //             }

    //             // Trim
    //             if (!data.trimStates.every((v) => v === null)) {
    //                 this.trimStates = data.trimStates;
    //                 syncEditor.imported(this.uploadedVideos, this.frameTimestamps, this.trimStates);
    //                 this.syncStatus();
    //             }

    //             // RefObjDim
    //             if (data.referenceObject !== null) {
    //                 this.referenceObject = data.referenceObject;
    //                 refObjDim.imported(this.referenceObject?.width ?? NaN, this.referenceObject?.length ?? NaN, this.referenceObject?.height ?? NaN);
    //                 this.updateReferenceObject(this.referenceObject?.width ?? NaN, this.referenceObject?.length ?? NaN, this.referenceObject?.height ?? NaN);
    //             }

    //             // RefObjMarker
    //             if (!data.referenceCorners[0].every((corner) => corner === null) || !data.referenceCorners[1].every((corner) => corner === null)) {
    //                 this.referenceCorners = data.referenceCorners;
    //                 refObjMarker.imported(this.uploadedVideos, this.frameTimestamps, this.trimStates, this.referenceCorners);
    //                 this.updateReferenceCornersStatus();
    //             }
    //             this.projectionMatrix = data.projectionMatrix;

    //             console.log("Import successful");
    //         } catch (err) {
    //             alert("Failed to import: file is corrupted or not a valid APTracker export.");
    //             console.error(err);
    //         }
    //     });
    //     input.click();
    // }

    // // Helpers
    // // Read a File as a base64 data URL. Returns null if the file is too large (>50 MB)
    // private async fileToDataUrl(file: File): Promise<string | null> {
    //     const MAX_BYTES = 50 * 1024 * 1024; // 50 MB per video
    //     if (file.size > MAX_BYTES) return null;

    //     return new Promise((resolve, reject) => {
    //         const reader = new FileReader();
    //         reader.onload = () => resolve(reader.result as string);
    //         reader.onerror = () => reject(reader.error);
    //         reader.readAsDataURL(file);
    //     });
    // }

    // // Reconstruct a File from a base64 data URL
    // private dataUrlToFile(dataUrl: string, meta: ExportedVideo): File {
    //     const [header, base64] = dataUrl.split(",");
    //     const mime = header.match(/:(.*?);/)![1];
    //     const binary = atob(base64);
    //     const bytes = new Uint8Array(binary.length);
    //     for (let i = 0; i < binary.length; i++) {
    //         bytes[i] = binary.charCodeAt(i);
    //     }
    //     return new File([bytes], meta.name, {
    //         type: mime,
    //         lastModified: meta.lastModified,
    //     });
    // }
}


export let apTracker = new APTracker();
// Add info: Play Both don't sync on Safari