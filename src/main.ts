import { Point2D } from "./core/Types";
import { ReferenceObject } from "./core/ReferenceObject";

import { updateStatus } from "./UI/workflow";
import { extractAllFrameTimestamps } from "./core/ExtractFrame";
import { syncEditor } from "./UI/sync";
import {} from "./UI/reference_object_dimension";
import { refObjMarker } from "./UI/reference_object_marker";

class APTracker {
    uploadedVideos: File[] = [];
    frameTimestamps: number[][] = [];
    trimStates: (number | null)[] = []; // [start1, end1, start2, end2] (in frames)
    referenceObject: ReferenceObject | null = null;
    referenceCorners: (Point2D | null)[][] = [];

    updateVideos(videos: File[]) {
        this.uploadedVideos = videos;
        if (this.uploadedVideos.length === 2) {
            updateStatus("Upload", "done");
        } else if (this.uploadedVideos.length === 1) {
            updateStatus("Upload", "inprogress");
        } else if (this.uploadedVideos.length === 0) {
            updateStatus("Upload", "");
        }
        this.updateFrameTimestamps();
    }

    async updateFrameTimestamps() {
        try {
            this.frameTimestamps = await extractAllFrameTimestamps(this.uploadedVideos);
            syncEditor.updateVideos(this.uploadedVideos, this.frameTimestamps);
            console.log("Extracted frame timestamps:", this.frameTimestamps);
        } catch (error) {
            console.error("Error extracting frame timestamps:", error);
            this.frameTimestamps = [];
        }
    }

    updateSync(trimStates: (number[] | null)[]) {
        
        const [trim1, trim2, durations] = trimStates;
        const [start1, end1] = trim1 ?? [null, null];
        const [start2, end2] = trim2 ?? [null, null];
        const [duration1, duration2] = durations ?? [null, null];
        
        this.trimStates = [start1, end1, start2, end2];
        console.log("Updating trim states:", this.trimStates);
        
        if (!trim1 || !trim2 || !durations) {
            updateStatus("Sync", "");
        } else if (Math.abs(duration1! - duration2!) < 0.05) {    // Allow tolerance of 50ms
            updateStatus("Sync", "done");
        } else {
            updateStatus("Sync", "inprogress");
        }

        refObjMarker.updateVideo(this.uploadedVideos, this.frameTimestamps, this.trimStates);
    }

    updateReferenceObject(width: number | null, length: number | null, height: number | null) {
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
        console.log("Updated reference object:", this.referenceObject);
    }

    updateReferenceCorners(referenceCorners: (Point2D | null)[][]) {
        this.referenceCorners = referenceCorners;

        let markedCount = [0, 0];
        referenceCorners.forEach((video, index) => {
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


        console.log("Updated reference corners:", this.referenceCorners);
    }
}


export let apTracker = new APTracker();
// Add info: Play Both don't sync on Safari