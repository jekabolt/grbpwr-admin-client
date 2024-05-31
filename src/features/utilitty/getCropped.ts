import { Area } from "react-easy-crop";

function findBestCrop(width: number, height: number, targetRatio: number) {
    let bestWidth = 0;
    let bestHeight = 0;
    let minDiff = Infinity;

    for (let h = height; h >= 1; h--) {
        let w = Math.round(targetRatio * h);
        if (w <= width) {
            let diff = Math.abs((w / h) - targetRatio);
            if (diff < minDiff) {
                minDiff = diff;
                bestWidth = w;
                bestHeight = h;
            }
        }
    }

    return { bestWidth, bestHeight };
}

export default async function getCroppedImg(imageSrc: string, crop: Area, aspect: number = 4 / 5, format: string = 'image/jpeg') {
    const image = new Image();
    image.crossOrigin = 'Anonymous'
    image.src = imageSrc;

    await new Promise((resolve) => {
        image.onload = resolve;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    // Calculate the best crop dimensions to maintain the aspect ratio
    const { bestWidth, bestHeight } = findBestCrop(crop.width, crop.height, aspect);

    canvas.width = bestWidth;
    canvas.height = bestHeight;

    if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
            image,
            crop.x * scaleX,
            crop.y * scaleY,
            crop.width * scaleX,
            crop.height * scaleY,
            0,
            0,
            bestWidth,
            bestHeight
        );
    }

    return canvas.toDataURL(format);
}
