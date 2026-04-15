document.getElementById("open-refObjMarker")!.addEventListener("click", () => {
    document.querySelector(".RefObjMarker")!.classList.add("active");
    document.getElementById("loading-screen")!.classList.add("show");
});

document.getElementById("close-refObjMarker")!.addEventListener("click", () => {
    document.querySelector(".RefObjMarker")!.classList.remove("active");
    document.getElementById("loading-screen")!.classList.remove("show");
});