import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { ReferenceObject } from '../core/ReferenceObject'
import { updateStatus } from './workflow';

export let referenceObject: ReferenceObject | null = null;

const width_input = document.getElementById('ref-width')!;
const length_input = document.getElementById('ref-length')!;
const height_input = document.getElementById('ref-height')!;

let width: number | null = NaN;
let length: number | null = NaN;
let height: number | null = NaN;

width_input.addEventListener('input', () => {
    width = parseFloat((document.getElementById('ref-width') as HTMLInputElement).value);
    updateReferenceObject();
});
length_input.addEventListener('input', () => {
    length = parseFloat((document.getElementById('ref-length') as HTMLInputElement).value);
    updateReferenceObject();
});
height_input.addEventListener('input', () => {
    height = parseFloat((document.getElementById('ref-height') as HTMLInputElement).value);
    updateReferenceObject();
});

function updateReferenceObject(): void {
    let nullCount = 0;
    if (Number.isNaN(width)) nullCount++;
    if (Number.isNaN(length)) nullCount++;
    if (Number.isNaN(height)) nullCount++;

    if (nullCount == 0) {
        referenceObject = new ReferenceObject(width!, length!, height!);
        updateStatus("RefDim", "done");
    } else {
        referenceObject = null;
        if (nullCount == 3) {
            updateStatus("RefDim", "");
        } else {
            updateStatus("RefDim", "inprogress");
        }
    }

    render(width, length, height);
}

let renderer: THREE.WebGLRenderer | null = null;
let animationFrameId: number | null = null;

function render(width: number | null, length: number | null, height: number | null): void {
    width  = (width  == null || Number.isNaN(width))  ? 0 : width;
    length = (length == null || Number.isNaN(length)) ? 0 : length;
    height = (height == null || Number.isNaN(height)) ? 0 : height;

    // Cleanup previous renderer if re-called
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    if (renderer !== null) {
        renderer.dispose();
        renderer.domElement.remove();
    }

    // Scene setup
    const container = document.getElementById('refObjDiagram')!;
    
    const W = container.clientWidth;
    const H = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1000);
    const maxDim = Math.max(width, length, height, 1);
    camera.lookAt(width / 2, length / 2, height / 2);
    camera.position.set(maxDim * 2, -maxDim * 3, maxDim * 2); // x-right, y-back, z-up view
    camera.up.set(0, 0, 1); 
    camera.fov = 30;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(width / 2, length / 2, height / 2);
    camera.up.set(0, 0, 1);
    controls.update();

    // Box
    const boxGeo = new THREE.BoxGeometry(
        Math.max(Math.abs(width),  0.001),
        Math.max(Math.abs(length), 0.001),
        Math.max(Math.abs(height), 0.001)
    );
    const boxMat = new THREE.MeshPhongMaterial({
        color: 0x4fc3f7,
        opacity: 0.4,
        transparent: true,
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(width / 2, length / 2, height / 2);
    scene.add(box);

    // Wireframe overlay
    const wireframe = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.6, transparent: true })
    );
    wireframe.position.copy(box.position);
    scene.add(wireframe);

    // Arrows 
    // ArrowHelper(direction, origin, length, color)
    const arrowLength = maxDim * 0.8;
    const headLength  = arrowLength * 0.2;
    const headWidth   = arrowLength * 0.15;

    const arrows: [THREE.Vector3, number, string][] = [
        [new THREE.Vector3(1, 0, 0),  0xff4444, 'X (width)'],   // right
        [new THREE.Vector3(0, 1, 0),  0x44ff44, 'Y (length)'],  // back
        [new THREE.Vector3(0, 0, 1),  0x4444ff, 'Z (height)'],  // up
    ];

    for (const [dir, color] of arrows) {
        const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), arrowLength, color, headLength, headWidth);
        scene.add(arrow);
    }

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(maxDim * 3, maxDim * 3, maxDim * 3);
    scene.add(dirLight);

    // Animate
    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        controls.update();
        renderer!.render(scene, camera);
    }
    animate();

    // Resize handler
    new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer!.setSize(w, h);
    }).observe(container);
}

// Initialize render
render(width, length, height);