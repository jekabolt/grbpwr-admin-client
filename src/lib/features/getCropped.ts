import { Area } from 'react-easy-crop';

async function urlToDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('blob:')) {
    return imageUrl;
  }

  try {
    const response = await fetch(imageUrl, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'default',
    });
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
