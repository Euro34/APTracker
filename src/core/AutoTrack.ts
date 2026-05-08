declare const cv: any;

import { Point2D } from "./Types";

/**
 * Capture a grayscale OpenCV Mat from a video element at its current frame.
 * Caller is responsible for calling .delete() on the returned Mat.
 */
export function captureGrayFrame(video: HTMLVideoElement): any {
	const canvas = document.createElement("canvas");
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;

	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(video, 0, 0);

	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const src = cv.matFromImageData(imageData);
	const gray = new cv.Mat();
	cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
	src.delete();
	return gray;
}

/**
 * Predict where a tracked point moved from prevFrame to currFrame.
 *
 * @param prevFrame  Grayscale Mat of the frame where the mark was placed
 * @param currFrame  Grayscale Mat of the frame we want to predict on
 * @param prevMark   Normalized [0,1] point on prevFrame
 * @returns          Normalized [0,1] predicted point on currFrame, or null if tracking failed
 */
export function trackPoint(
	prevFrame: any,
	currFrame: any,
	prevMark: Point2D
): Point2D | null {
	const w = prevFrame.cols;
	const h = prevFrame.rows;

	// Convert normalized point to pixel coordinates
	const prevPts = cv.matFromArray(1, 1, cv.CV_32FC2, [
		prevMark.x * w,
		prevMark.y * h,
	]);

	const nextPts = new cv.Mat();
	const status = new cv.Mat();
	const err = new cv.Mat();

	// opencv.js only exposes the 6-argument overload
	cv.calcOpticalFlowPyrLK(
		prevFrame,
		currFrame,
		prevPts,
		nextPts,
		status,
		err
	);

	const tracked = status.data[0] === 1;

	let result: Point2D | null = null;

	if (tracked) {
		result = new Point2D(
			nextPts.data32F[0] / w,
			nextPts.data32F[1] / h
		);
	}

	prevPts.delete();
	nextPts.delete();
	status.delete();
	err.delete();

	return result;
}