// import { Point_2D, Point_3D } from "./core/Types";
import { ReferenceObject } from "./core/ReferenceObject";

import { updateStatus } from "./UI/workflow";
import { extractAllFrameTimestamps } from "./core/ExtractFrame";
import { syncEditor } from "./UI/sync";
import {} from "./UI/reference_object_dimension";

class APTracker {
    uploadedVideos: File[] = [];
    frameTimestamps: number[][] = [];
    sync: number[] | null = null; // [start1, end1, offsets(start2-start1)]
    referenceObject: ReferenceObject | null = null;

    updateVideos(videos: File[]) {
        console.log("Updating videos:", videos);
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
        console.log("Updating trim states:", trimStates);
        const [trim1, trim2] = trimStates;
        if (!trim1 || !trim2) {
            updateStatus("Sync", "");
            return;
        }

        const [start1, end1] = trim1;
        const [start2, end2] = trim2;

        const duration1 = end1 - start1;
        const duration2 = end2 - start2;

        if (duration1 == duration2) {
            this.sync = [start1, end1, start2 - start1];
            updateStatus("Sync", "done");
        } else {
            updateStatus("Sync", "inprogress");
        }
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

        console.log("Updated reference object:", this.referenceObject);
    }
}


export let apTracker = new APTracker();