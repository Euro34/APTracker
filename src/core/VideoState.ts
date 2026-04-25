import { Matrix } from 'ml-matrix';
import { Point2D } from "./Types";

export class VideoState extends EventTarget {
    private _file: File = new File([], '');
    private _frameTimestamps: number[] = [];

    private _startFrame = NaN;
    private _endFrame = NaN;
    private _refCurrentTime = NaN;

    private _referenceMarks: (Point2D | null)[] = Array(8).fill(null);
    private _targetMarks: (Point2D | null)[] = [];

    public projectionMatrix: Matrix | null = null

    get file(): File { return this._file; }
    get frameTimestamps(): number[] { return this._frameTimestamps; }
    get startFrame(): number { return this._startFrame; }
	get endFrame(): number { return this._endFrame; }
    get refCurrentTime(): number { return this._refCurrentTime; }
    get referenceMarks(): (Point2D | null)[] { return this._referenceMarks; }
    get targetMarks(): (Point2D | null)[] { return this._targetMarks; }
    
    get hasVideo(): boolean { return this._file.size > 0; }
    get hasTimestamps(): boolean { return this._frameTimestamps.length != 0; }

    get startTime(): number { return this._frameTimestamps[this._startFrame] ?? 0; }
    get endTime(): number { return this._frameTimestamps[this._endFrame] ?? 0; }
    get duration(): number { return this.endTime - this.startTime; }

    set startFrame(v: number) { this._startFrame = Math.max(0, Math.min(v, this._frameTimestamps.length - 1)); }
	set endFrame(v: number) { this._endFrame = Math.max(0, Math.min(v, this._frameTimestamps.length - 1)); }
    set refCurrentTime(time: number) { this._refCurrentTime = Math.min(Math.max(time, this.startTime), this.endTime); }

    public updateVideo(file: File) {
        this._file = file;
        this.dispatchEvent(new Event("onUpload"));
        // console.log("Upload\n" + this.toString());
    }

    public updateTimestamps(timestamps: number[]) {
        if (!this.hasTimestamps) {
            this._frameTimestamps = timestamps;
            this.startFrame = 0;
            this.endFrame = timestamps.length > 0 ? timestamps.length - 1 : 0;
            this.refCurrentTime = Math.min(Math.max(this.refCurrentTime, this.startTime), this.endTime);
        } else {
            this._frameTimestamps = timestamps;
        }
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

    public updateReferenceMarks(index: number, point: Point2D | null) {
        this._referenceMarks[index] = point;
        this.dispatchEvent(new Event("referenceChange"));
    }

    public updateTargetMarks(index: number, point: Point2D | null) {
        this._targetMarks[index] = point;
        this.dispatchEvent(new Event("targetChange"));
    }

    public reset() {
        this._file = new File([], '');
        this._frameTimestamps = [];
        this._referenceMarks = Array(8).fill(null);
        this._targetMarks = Array(8).fill(null);
        this._startFrame = NaN;
        this._endFrame = NaN;
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
			file: this._file,
			frameTimestamps: this._frameTimestamps,
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
        this._file = dict.file;
        this._frameTimestamps = dict.frameTimestamps;
        this._startFrame = dict.startFrame;
        this._endFrame = dict.endFrame;
        this._refCurrentTime = dict.refCurrentTime;
        this._referenceMarks = dict.referenceMarks;
        this._targetMarks = dict.targetObjMarks;
        this.dispatchEvent(new Event("onUpload"))
        this.dispatchEvent(new Event("timestampsChange"))
        this.dispatchEvent(new Event("trimChange"))
    }

    public toString(): string {
        return `file = ${this._file.name}\nframes count=${this._frameTimestamps.length}\nstartFrame=${this.startFrame}\nendFrame=${this.endFrame}\ncurrentTime=${this.refCurrentTime}\nrefObjMarks=${this._referenceMarks.map(m => m ? m.toString() : 'null').join(', ')}\ntargObjMarks=${this._targetMarks.map(m => m ? m.toString() : 'null').join(', ')}`;
    }
}