export function updateStatus(Id: string, status: string) {
    const statusElement = document.querySelectorAll(`#${Id}`);
    if (!statusElement) {
        console.error(`Status element with ID ${Id} not found.`);
        return;
    }
    statusElement.forEach((element) => {
        element.classList.remove("inprogress", "done");
        if (status != "") {
            element.classList.add(status);
        }
    });
    updateProgressBar();
}

function updateProgressBar() {
    const progressText = document.getElementById("progress-label");
    const progressBar = document.getElementById("progress-bar");
    if (!progressText) {
        console.error("Progress text elements not found.");
        return;
    }
    if (!progressBar) {
        console.error("Progress bar elements not found.");
        return;
    }

    const totalSteps = document.querySelectorAll(".workflow .step").length;
    const completedSteps = document.querySelectorAll(".workflow .step.done").length;

    const progress = (completedSteps / totalSteps) * 100;
    if (progress == 100) {
        progressBar.classList.add("completed");
    }

    progressText.textContent = `${completedSteps}/${totalSteps}`;
    progressBar.style.setProperty("--level", `${progress}%`);
}

// Initialize progress bar on page load
document.addEventListener("DOMContentLoaded", () => {
    updateProgressBar();
});
