export class Point_3D {
    x: number;
    y: number;
    z: number;

    constructor(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    toString(): string {
        return `Point_3D: x=${this.x}, y=${this.y}, z=${this.z}`;
    }
}

export class Point_2D {
    x?: number;
    y?: number;

    constructor(x?: number, y?: number) {
        this.x = x;
        this.y = y;
    }

    toString(): string {
        const xStr = this.x === undefined ? 'uninitialized' : String(this.x);
        const yStr = this.y === undefined ? 'uninitialized' : String(this.y);
        return `Point_2D: x=${xStr}, y=${yStr}`;
    }
}