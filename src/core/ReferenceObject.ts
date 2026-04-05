import { Point_3D, Point_2D } from './Types.ts';
import { Matrix, SingularValueDecomposition } from 'ml-matrix';

export class ReferenceObject {
    public width: number;
    public length: number;
    public height: number;
    public corners_list: Point_3D[];

    public constructor(width: number, length: number, height: number) {
        this.width = width;
        this.length = length;
        this.height = height;
        this.corners_list = [
            new Point_3D(0, 0, 0),
            new Point_3D(width, 0, 0),
            new Point_3D(0, length, 0),
            new Point_3D(0, 0, height),
            new Point_3D(width, length, 0),
            new Point_3D(width, 0, height),
            new Point_3D(0, length, height),
            new Point_3D(width, length, height)
        ];
    }

    private matchCornersToImagePoints(image_2D_points: Point_2D[]): [Point_2D[], Point_3D[]] {
        const matched_image_points: Point_2D[] = [];
        const matched_world_points: Point_3D[] = [];

        for (const [i, point] of image_2D_points.entries()) {
            if (point !== new Point_2D()) {
                matched_image_points.push(point);
                matched_world_points.push(this.corners_list[i]);
            }
        }
        return [matched_image_points, matched_world_points];
    }


    public calculateProjectionMatrix(image_2D_points: Point_2D[]): Matrix {
        const [image_points, world_points] = this.matchCornersToImagePoints(image_2D_points);
        if (image_points.length !== world_points.length || image_points.length < 6) {
            throw new Error("There must be at least 6 point correspondences for a 3x4 matrix.");
        }
        const rows: number[][] = [];

        // Construct the matrix rows
        for (let i = 0; i < image_points.length; i++) {
            const [x, y] = [image_points[i].x!, image_points[i].y!];
            const [X, Y, Z] = [world_points[i].x, world_points[i].y, world_points[i].z];

            rows.push([ -X, -Y, -Z, -1,  0,  0,  0,  0, x * X, x * Y, x * Z, x ]);
            rows.push([  0,  0,  0,  0, -X, -Y, -Z, -1, y * X, y * Y, y * Z, y ]);
        }

        const A = new Matrix(rows);
        const svd = new SingularValueDecomposition(A);
        
        // The solution is the last column of V
        const V = svd.rightSingularVectors;;
        const lastColIndex = V.columns - 1;
        const L = V.getColumn(lastColIndex);

        // return reshape L (12 elements) into a 3x4 Matrix
        return Matrix.from1DArray(3, 4, L);
    }

    toString(): string {
        return `ReferenceObject: width=${this.width}, length=${this.length}, height=${this.height}`;
    }
}