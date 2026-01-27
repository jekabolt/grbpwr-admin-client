import { Area } from 'react-easy-crop';

/**
 * Converts an image URL to a data URL to avoid CORS issues
 * Falls back to original URL if conversion fails
 */
async function urlToDataUrl(imageUrl: string): Promise<string> {
  // If it's already a data URL, return as is
  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  // If it's a blob URL, return as is (already local)
  if (imageUrl.startsWith('blob:')) {
    return imageUrl;
  }

  try {
    // Try to fetch the image as a blob and convert to data URL
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          resolve(reader.result.toString());
        } else {
          reject(new Error('Could not convert image to data URL'));
        }
      };
      reader.onerror = () => {
        reject(new Error('Error reading image blob'));
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    // If fetch fails due to CORS, throw a more descriptive error
    if (
      error instanceof TypeError &&
      (error.message.includes('fetch') ||
        error.message.includes('CORS') ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError'))
    ) {
      throw new Error(
        'Cannot crop this image due to CORS restrictions. The image server (files.grbpwr.com) does not allow cross-origin requests. Please contact the server administrator to enable CORS headers.',
      );
    }
    // Re-throw with more context
    if (error instanceof Error) {
      throw new Error(`Failed to load image for cropping: ${error.message}`);
    }
    throw error;
  }
}

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
      let diff = Math.abs(w / h - targetRatio);
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
  // Convert URL to data URL first to avoid CORS issues
  const dataUrl = await urlToDataUrl(imageSrc);

  const image = new Image();
  image.src = dataUrl;

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => {
      reject(new Error('Failed to load image'));
    };
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
  rotation = 0,
): Promise<string> {
  const rotatedCanvas = await getRotatedImage(imageSrc, rotation);
  const rotatedImage = new Image();
  rotatedImage.src = rotatedCanvas.toDataURL();

  await new Promise((resolve) => {
    rotatedImage.onload = resolve;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const scaleX = rotatedImage.naturalWidth / rotatedImage.width;
  const scaleY = rotatedImage.naturalHeight / rotatedImage.height;

  const { bestWidth, bestHeight } = findBestCrop(crop.width, crop.height, aspect);

  canvas.width = bestWidth;
  canvas.height = bestHeight;

  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.imageSmoothingEnabled = true;

    ctx.drawImage(
      rotatedImage,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      bestWidth,
      bestHeight,
    );
  }

  const quality = format === 'image/webp' ? 1.0 : 0.95;
  return canvas.toDataURL(format, quality);
}
