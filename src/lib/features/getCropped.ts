import { Area } from "react-easy-crop";

function findBestCrop(width: number, height: number, targetRatio: number | undefined) {
    if (targetRatio === undefined) {
        return { bestWidth: width, bestHeight: height };
    }

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

async function getRotatedImage(imageSrc: string, rotation: number): Promise<HTMLCanvasElement> {
    const image = new Image();
    image.crossOrigin = 'Anonymous';
    image.src = imageSrc;

    await new Promise((resolve) => {
        image.onload = resolve;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const angleInRads = (rotation * Math.PI) / 180;
    const sin = Math.sin(angleInRads);
    const cos = Math.cos(angleInRads);

    const width = image.width;
    const height = image.height;

    const newWidth = Math.abs(width * cos) + Math.abs(height * sin);
    const newHeight = Math.abs(width * sin) + Math.abs(height * cos);

    canvas.width = newWidth;
    canvas.height = newHeight;

    if (ctx) {
        ctx.translate(newWidth / 2, newHeight / 2);
        ctx.rotate(angleInRads);
        ctx.drawImage(image, -width / 2, -height / 2);
    }

    return canvas;
}

export default async function getCroppedImg(
    imageSrc: string,
    crop: Area,
    aspect?: number,
    format: string = 'image/jpeg',
    rotation = 0
): Promise<string> {
    const rotatedCanvas = await getRotatedImage(imageSrc, rotation);
    const rotatedImage = new Image();
    rotatedImage.src = rotatedCanvas.toDataURL();

    await new Promise((resolve) => {
        rotatedImage.onload = resolve;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const scaleX = rotatedImage.width / rotatedImage.width;
    const scaleY = rotatedImage.height / rotatedImage.height;

    const { bestWidth, bestHeight } = findBestCrop(crop.width, crop.height, aspect);

    canvas.width = bestWidth;
    canvas.height = bestHeight;

    if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
            rotatedImage,
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
