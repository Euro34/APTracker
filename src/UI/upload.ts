import {updateStatus} from "./workflow.ts"
import { uploadedVideos } from "../main.ts";

const uploadArea = document.getElementById("upload-area") as HTMLDivElement;
const previewGrid = document.getElementById("preview-grid") as HTMLDivElement;
const fileInput = document.getElementById("video-upload") as HTMLInputElement;

uploadArea.addEventListener("click", () => fileInput.click());

// File picker selection
fileInput.addEventListener("change", () => {
    if (fileInput.files) handleNewFiles(Array.from(fileInput.files));
    // Reset so the same file can be re-selected after removal
    fileInput.value = "";
});

// Drag and drop
uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("drag-over");
});
uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("drag-over");
});
uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("drag-over");
    if (e.dataTransfer?.files) handleNewFiles(Array.from(e.dataTransfer.files));
});


// Only accept video files, only fill up to 2 total
function handleNewFiles(newFiles: File[]): void {
    const videoFiles = newFiles.filter((f) => f.type.startsWith("video/"));
    const slots = 2 - uploadedVideos.length;
    uploadedVideos.push(...videoFiles.slice(0, slots));
    render();
}

// Revoke the object URL to free memory
function removeFile(index: number): void {
    const card = previewGrid.children[index] as HTMLElement;
    const video = card.querySelector("video");
    if (video?.src) URL.revokeObjectURL(video.src);

    uploadedVideos.splice(index, 1);
    render();
}

function render(): void {
    const count = uploadedVideos.length;

    uploadArea.classList.toggle("hidden", count === 2);
    fileInput.classList.toggle("hidden", count === 2);
    previewGrid.classList.toggle("hidden", count === 0);

    if (count === 0) {
        uploadArea.querySelector("p")!.textContent ="Click or drag and drop to upload videos";
        updateStatus("Upload", "");
    } else if (count === 1) {
        uploadArea.querySelector("p")!.textContent = "Click or drag and drop to upload the second video";
        updateStatus("Upload", "inprogress");
    } else if (count === 2) {
        updateStatus("Upload", "done");
    }

    // Clear existing thumbnails
    previewGrid.innerHTML = "";

    // Render one card per file
    uploadedVideos.forEach((file, index) => {
        const objectURL = URL.createObjectURL(file);

        const card = document.createElement("div");
        card.className = "preview-card";

        const video = document.createElement("video");
        video.src = objectURL;
        video.muted = true;

        // video.currentTime = 0.01;
        video.load(); // explicitly kick off loading
        const filename = document.createElement("div");
        filename.className = "filename";
        filename.textContent = file.name;

        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-btn";
        removeBtn.title = "Remove";
        removeBtn.textContent = "✕";
        removeBtn.addEventListener("click", () => removeFile(index));

        card.append(video, filename, removeBtn);
        previewGrid.appendChild(card);
    });
}