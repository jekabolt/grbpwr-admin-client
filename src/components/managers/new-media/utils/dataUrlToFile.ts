/**
 * Converts a data URL (base64) to a File object with proper MIME type handling
 * @param dataUrl - The data URL string (e.g., "data:image/jpeg;base64,...")
 * @param fileName - Optional filename for the File object
 * @returns File object with correct MIME type
 */
export function dataUrlToFile(dataUrl: string, fileName?: string): File {
  // Extract MIME type from data URL (e.g., "data:image/jpeg;base64,..." or "data:image/webp;base64,...")
  const dataUrlMatch = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!dataUrlMatch) {
    throw new Error('Invalid data URL format');
  }

  const mimeType = dataUrlMatch[1] || 'image/jpeg';
  const base64Data = dataUrlMatch[2];

  // Convert base64 to binary
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });

  // Determine file extension from MIME type if fileName not provided
  if (!fileName) {
    const extension = mimeType.includes('webp') ? 'webp' : mimeType.includes('png') ? 'png' : 'jpg';
    fileName = `media.${extension}`;
  }

  return new File([blob], fileName, {
    type: mimeType,
    lastModified: Date.now(),
  });
}
