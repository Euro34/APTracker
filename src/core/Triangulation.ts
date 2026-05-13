import { Point2D, Point3D } from "./Types";
import { ReferenceObject } from "./ReferenceObject";
import { Matrix, SingularValueDecomposition } from "ml-matrix";

function triangulate(p1: Point2D, p2: Point2D, P1: Matrix, P2: Matrix): Point3D {
	const buildRows = (p: Point2D, P: Matrix): number[][] => {
		const x = p.x!;
		const y = p.y!;
		return [
			[x * P.get(2,0) - P.get(0,0),  x * P.get(2,1) - P.get(0,1),  x * P.get(2,2) - P.get(0,2),  x * P.get(2,3) - P.get(0,3)],
			[y * P.get(2,0) - P.get(1,0),  y * P.get(2,1) - P.get(1,1),  y * P.get(2,2) - P.get(1,2),  y * P.get(2,3) - P.get(1,3)],
		];
	};

	const rows = [...buildRows(p1, P1), ...buildRows(p2, P2)];
	const A = new Matrix(rows);
	const svd = new SingularValueDecomposition(A);
	const V = svd.rightSingularVectors;
	const lastCol = V.getColumn(V.columns - 1);

	// De-homogenize: divide by w
	const w = lastCol[3];
	return new Point3D(lastCol[0] / w, lastCol[1] / w, lastCol[2] / w);
}

export function triangulateAll(
	cam1CornerPoints: Array<Point2D | null>,
	cam2CornerPoints: Array<Point2D | null>,
	ref: ReferenceObject,
	cam1TrackedPoints: Array<Point2D | null>,
	cam2TrackedPoints: Array<Point2D | null>,
): Array<Point3D | null> {
	const P1 = ref.calculateProjectionMatrix(cam1CornerPoints);
	const P2 = ref.calculateProjectionMatrix(cam2CornerPoints);

	const results: Array<Point3D | null> = [];

	const frameCount = Math.min(cam1TrackedPoints.length, cam2TrackedPoints.length);
	for (let i = 0; i < frameCount; i++) {
		const p1 = cam1TrackedPoints[i];
		const p2 = cam2TrackedPoints[i];
		if (p1 === null || p2 === null) {
			results.push(null);
			continue;
		}
		results.push(triangulate(p1, p2, P1, P2));
	}

	return results;
}