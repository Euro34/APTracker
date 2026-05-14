import { Point2D, Point3D } from "./Types";
import { VideoState } from "./VideoState";
import { ReferenceObject } from "./ReferenceObject";
import { Matrix, SingularValueDecomposition } from "ml-matrix";

function triangulate(p1: Point2D, p2: Point2D, PM1: Matrix, PM2: Matrix): Point3D {
	const buildRows = (p: Point2D, P: Matrix): number[][] => {
		const x = p.x!;
		const y = p.y!;
		return [
			[x * P.get(2,0) - P.get(0,0),  x * P.get(2,1) - P.get(0,1),  x * P.get(2,2) - P.get(0,2),  x * P.get(2,3) - P.get(0,3)],
			[y * P.get(2,0) - P.get(1,0),  y * P.get(2,1) - P.get(1,1),  y * P.get(2,2) - P.get(1,2),  y * P.get(2,3) - P.get(1,3)],
		];
	};

	const rows = [...buildRows(p1, PM1), ...buildRows(p2, PM2)];
	const A = new Matrix(rows);
	const svd = new SingularValueDecomposition(A);
	const V = svd.rightSingularVectors;
	const lastCol = V.getColumn(V.columns - 1);

	// De-homogenize: divide by w
	const w = lastCol[3];
	return new Point3D(lastCol[0] / w, lastCol[1] / w, lastCol[2] / w);
}

// Returns interpolated Point2D at time t, given sorted marked frames.
// Returns null if the two surrounding marks are farther apart than maxGapMs.
function interpolatePoint(marks: (Point2D | null)[],timestamps: number[],startFrame: number,t: number,maxGapMs: number): Point2D | null {
	// Build list of (time, point) for non-null marks only
	const keyed: { t: number; p: Point2D }[] = [];
	for (let i = 0; i < marks.length; i++) {
		if (marks[i] !== null) {
			keyed.push({ t: timestamps[i] - startFrame, p: marks[i]! });
		}
	}

	if (keyed.length === 0) return null;

	// Find surrounding bracket
	let lo = -1, hi = -1;
	for (let i = 0; i < keyed.length - 1; i++) {
		if (keyed[i].t <= t && keyed[i + 1].t >= t) {
			lo = i;
			hi = i + 1;
			break;
		}
	}

	// Exact match or out of range
	if (lo === -1) {
		const first = keyed[0];
		const last = keyed[keyed.length - 1];
		if (Math.abs(t - first.t) < 1e-9) return first.p;
		if (Math.abs(t - last.t) < 1e-9) return last.p;
		return null; // t is outside the marked range entirely
	}

	const dt = keyed[hi].t - keyed[lo].t;
	if (dt > maxGapMs) return null; // gap too large — don't fabricate

	const alpha = (t - keyed[lo].t) / dt;
	return new Point2D(
		keyed[lo].p.x! + alpha * (keyed[hi].p.x! - keyed[lo].p.x!),
		keyed[lo].p.y! + alpha * (keyed[hi].p.y! - keyed[lo].p.y!),
	);
}

export function triangulateAll(videoStates: [VideoState, VideoState], referenceObject: ReferenceObject): (Point3D | null)[] {
	const [s1, s2] = videoStates;

	const PM1 = referenceObject.calculateProjectionMatrix(s1.referenceMarks);
	const PM2 = referenceObject.calculateProjectionMatrix(s2.referenceMarks);

	const fps1 = s1.frameTimestamps.length / (s1.frameTimestamps[s1.frameTimestamps.length - 1] - s1.frameTimestamps[0]);
	const fps2 = s2.frameTimestamps.length / (s2.frameTimestamps[s2.frameTimestamps.length - 1] - s2.frameTimestamps[0]);
	const master = fps1 <= fps2 ? s1 : s2;

	const slowInterval = 1000 / Math.min(fps1, fps2);
	const maxGapMs = slowInterval * 1.5;

	const results: (Point3D | null)[] = [];

	for (let i = 0; i < master.targetMarks.length; i++) {
		const t = master.frameTimestamps[i] - master.startFrame;

		const p1 = interpolatePoint(s1.targetMarks, s1.frameTimestamps, s1.startFrame, t, maxGapMs);
		const p2 = interpolatePoint(s2.targetMarks, s2.frameTimestamps, s2.startFrame, t, maxGapMs);

		if (p1 === null || p2 === null) {
			results.push(null);
			continue;
		}

		results.push(triangulate(p1, p2, PM1, PM2));
	}

	return results;
}