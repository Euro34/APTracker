import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { apTracker } from '../main';

export class ReferenceObjectDimension {
    private width: number | null = NaN;
    private length: number | null = NaN;
    private height: number | null = NaN;

    private renderer: THREE.WebGLRenderer | null = null;
    private animationFrameId: number | null = null;
    private controls: OrbitControls | null = null;

    constructor() {
        document.getElementById('ref-width')!.addEventListener('input', () => {
            this.width = parseFloat((document.getElementById('ref-width') as HTMLInputElement).value);
            apTracker.updateReferenceObject(this.width, this.length, this.height);
            this.render();
        });
        document.getElementById('ref-length')!.addEventListener('input', () => {
            this.length = parseFloat((document.getElementById('ref-length') as HTMLInputElement).value);
            apTracker.updateReferenceObject(this.width, this.length, this.height);
            this.render();
        });
        document.getElementById('ref-height')!.addEventListener('input', () => {
            this.height = parseFloat((document.getElementById('ref-height') as HTMLInputElement).value);
            apTracker.updateReferenceObject(this.width, this.length, this.height);
            this.render();
        });

        // Fix 1: arrow function preserves `this`
        setTimeout(() => this.initializeWidget(), 300);
    }

    private initializeWidget() {
        const container = document.getElementById('refObjDiagram')!;
        const W = container.clientWidth;
        const H = container.clientHeight;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(W, H);
        container.appendChild(this.renderer.domElement);

        new ResizeObserver(() => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            this.renderer!.setSize(w, h);
        }).observe(container);

        this.render();
    }

    private render() {
        const width  = (this.width  == null || Number.isNaN(this.width))  ? 0 : this.width;
        const length = (this.length == null || Number.isNaN(this.length)) ? 0 : this.length;
        const height = (this.height == null || Number.isNaN(this.height)) ? 0 : this.height;

        if (this.renderer === null) {
            console.error('Call initializeWidget() before render()');
            return;
        }

        if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);

        const container = document.getElementById('refObjDiagram')!;
        const W = container.clientWidth;
        const H = container.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);

        const maxDim = Math.max(width, length, height, 1);

        const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 1000);
        camera.up.set(0, 0, 1);
        camera.position.set(maxDim * 2, -maxDim * 3, maxDim * 2);
        camera.lookAt(width / 2, length / 2, height / 2);

        if (this.controls !== null) this.controls.dispose();
        this.controls = new OrbitControls(camera, this.renderer.domElement);
        this.controls.target.set(width / 2, length / 2, height / 2);
        camera.up.set(0, 0, 1);
        this.controls.update();

        const boxGeo = new THREE.BoxGeometry(
            Math.max(Math.abs(width),  0.001),
            Math.max(Math.abs(length), 0.001),
            Math.max(Math.abs(height), 0.001)
        );
        const boxMat = new THREE.MeshPhongMaterial({ color: 0x4fc3f7, opacity: 0.4, transparent: true });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set(width / 2, length / 2, height / 2);
        scene.add(box);

        const wireframe = new THREE.LineSegments(
            new THREE.EdgesGeometry(boxGeo),
            new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.6, transparent: true })
        );
        wireframe.position.copy(box.position);
        scene.add(wireframe);

        const arrowLength = maxDim * 0.8;
        const headLength  = arrowLength * 0.2;
        const headWidth   = arrowLength * 0.15;

        const arrows: [THREE.Vector3, number][] = [
            [new THREE.Vector3(1, 0, 0), 0xff4444],
            [new THREE.Vector3(0, 1, 0), 0x44ff44],
            [new THREE.Vector3(0, 0, 1), 0x4444ff],
        ];
        for (const [dir, color] of arrows) {
            scene.add(new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), arrowLength, color, headLength, headWidth));
        }

        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(maxDim * 3, maxDim * 3, maxDim * 3);
        scene.add(dirLight);

        const animate = () => {
            this.animationFrameId = requestAnimationFrame(animate);
            this.controls!.update();
            this.renderer!.render(scene, camera);
        };
        animate();
    }

    public imported(width: number, length: number, height: number) {
        this.width = width;
        this.length = length;
        this.height = height;
        
        (document.getElementById('ref-width') as HTMLInputElement).value = isNaN(width) ? '' : width.toString();
        (document.getElementById('ref-length') as HTMLInputElement).value = isNaN(length) ? '' : length.toString();
        (document.getElementById('ref-height') as HTMLInputElement).value = isNaN(height) ? '' : height.toString();

        this.render();
    }
}