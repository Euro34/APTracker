import { Point2D } from "./Types";

export class VideoState extends EventTarget {
    public file: File = new File([], '');
    public frameTimestamps: number[] = [];
    public referenceMarks: (Point2D | null)[] = Array(8).fill(null);
    public targetMarks: (Point2D | null)[] = [];
    public startFrame = NaN;
    public endFrame = NaN;
    private _refCurrentTime = NaN;

    get hasVideo(): boolean { return this.file.size > 0; }
    get hasTimestamps(): boolean { return this.frameTimestamps.length != 0; }
    get startTime(): number { return this.frameTimestamps[this.startFrame] ?? 0; }
    get endTime(): number { return this.frameTimestamps[this.endFrame] ?? 0; }
    get refCurrentTime(): number { return this._refCurrentTime; }
    get duration(): number { return this.endTime - this.startTime; }

    set refCurrentTime(time: number) { this._refCurrentTime = Math.min(Math.max(time, this.startTime), this.endTime); }

    public updateVideo(file: File, timestamps: number[] | null = null, currentTime : number | null = null, referenceMarks: (Point2D | null)[] | null = null, targetMarks: (Point2D | null)[] | null = null) {
        this.file = file;
        this.frameTimestamps = timestamps ?? [];
        this.refCurrentTime = currentTime ?? this.startTime;
        if (referenceMarks) this.referenceMarks = referenceMarks;
        if (targetMarks) this.targetMarks = targetMarks
        this.dispatchEvent(new Event("onUpload"));
        // console.log("Upload\n" + this.toString());
    }

    public updateTimestamps(timestamps: number[]) {
        if (!this.hasTimestamps) {
            this.startFrame = 0;
            this.endFrame = timestamps.length > 0 ? timestamps.length - 1 : 0;
        }
        this.frameTimestamps = timestamps;
        this.refCurrentTime = Math.min(Math.max(this.refCurrentTime, this.startTime), this.endTime);
        this.dispatchEvent(new Event("timestampsChange"));
        // console.log("Timestamps\n" + this.toString());
    }

    public updateTrim(startFrame: number | null = null, endFrame: number | null = null) {
        if (startFrame) this.startFrame = startFrame;
        if (endFrame) this.endFrame = endFrame;
        this.refCurrentTime = Math.min(Math.max(this.refCurrentTime, this.startTime), this.endTime);
        this.dispatchEvent(new Event("trimChange"));
        // console.log("Trim\n" + this.toString());
    }

    public reset() {
        this.file = new File([], '');
        this.frameTimestamps = [];
        this.referenceMarks = Array(8).fill(null);
        this.targetMarks = Array(8).fill(null);
        this.startFrame = NaN;
        this.endFrame = NaN;
        this._refCurrentTime = NaN;
        this.dispatchEvent(new Event("onReset"));
        // console.log("Reset state\n" + this.toString());
    }

    public snapshot(): {
        file: File;
        frameTimestamps: number[];
        startFrame: number;
        endFrame: number;
        refCurrentTime: number;
        referenceMarks: (Point2D | null)[];
        targetObjMarks: (Point2D | null)[];
    } {
        return {
			file: this.file,
			frameTimestamps: this.frameTimestamps,
			startFrame: this.startFrame,
			endFrame: this.endFrame,
			refCurrentTime: this.refCurrentTime,
			referenceMarks: this.referenceMarks,
            targetObjMarks: this.targetMarks,
		}
    }

    public assignFromSnapshot(dict: {
        file: File;
        frameTimestamps: number[];
        startFrame: number;
        endFrame: number;
        refCurrentTime: number;
        referenceMarks: (Point2D | null)[];
        targetObjMarks: (Point2D | null)[];
    }) {
        this.file = dict.file;
        this.frameTimestamps = dict.frameTimestamps;
        this.startFrame = dict.startFrame;
        this.endFrame = dict.endFrame;
        this._refCurrentTime = dict.refCurrentTime;
        this.referenceMarks = dict.referenceMarks;
        this.targetMarks = dict.targetObjMarks;
        this.dispatchEvent(new Event("onUpload"))
        this.dispatchEvent(new Event("timestampsChange"))
        this.dispatchEvent(new Event("trimChange"))
    }

    public toString(): string {
        return `file = ${this.file.name}\nframes count=${this.frameTimestamps.length}\nstartFrame=${this.startFrame}\nendFrame=${this.endFrame}\ncurrentTime=${this.refCurrentTime}\nrefObjMarks=${this.referenceMarks.map(m => m ? m.toString() : 'null').join(', ')}\ntargObjMarks=${this.targetMarks.map(m => m ? m.toString() : 'null').join(', ')}`;
    }
}