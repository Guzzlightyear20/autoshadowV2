import JSZip from 'jszip';
import saveAs from 'file-saver';
import { BatchImageItem } from './types';

/**
 * Run `processor` over every item in `items`, but never more than `concurrency`
 * processors running at the same time. Each call to `processor` is expected to
 * handle its own errors so that one failure doesn't abort the remaining items.
 */
export const processWithConcurrency = async <T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  concurrency = 3
): Promise<void> => {
  let index = 0;

  const worker = async () => {
    while (index < items.length) {
      const i = index++;
      await processor(items[i]); // errors are caught inside processor
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Downloads an image, optionally resizing it to specific dimensions.
 * Useful for ensuring the output matches the input size exactly.
 */
export const downloadResizedImage = (
  url: string,
  filename: string,
  format: 'image/png' | 'image/jpeg' | 'image/webp',
  targetWidth?: number,
  targetHeight?: number
) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  
  img.onload = () => {
    const canvas = document.createElement('canvas');
    // Use target dimensions if provided, otherwise use the image's natural dimensions
    canvas.width = targetWidth || img.width;
    canvas.height = targetHeight || img.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // For JPEG, fill background with white (removes transparency)
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw image stretched/scaled to exactly fit the canvas dimensions
    // content-box, fill
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const quality = format === 'image/jpeg' ? 0.9 : format === 'image/webp' ? 0.92 : 1.0;
    const dataUrl = canvas.toDataURL(format, quality);
    
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  img.src = url;
};

// Legacy helper, kept for compatibility if needed, but downloadResizedImage is preferred
export const downloadImage = (url: string, filename: string) => {
  downloadResizedImage(url, filename, 'image/png');
};

/**
 * Compress a File before sending to the Gemini API.
 * Scales down to maxWidth if the image is larger, then re-encodes.
 * Returns the raw base64 string (no data-URL prefix) — same as fileToBase64.
 * Images already ≤ maxWidth pass through without quality loss.
 */
export const compressImageForAPI = (
  file: File,
  maxWidth = 1920,
  quality = 0.88
): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));
      ctx.drawImage(img, 0, 0, w, h);
      // Preserve PNG for transparency; use JPEG for everything else
      const fmt = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(fmt, fmt === 'image/jpeg' ? quality : 1);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = reject;
    img.src = url;
  });

/**
 * Retry a promise-returning function up to maxRetries times using exponential backoff.
 * Only retries on rate-limit (429) and transient server errors — other errors throw immediately.
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 2000
): Promise<T> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
      const isRetryable =
        msg.includes('429') || msg.includes('503') || msg.includes('500') ||
        msg.includes('rate') || msg.includes('quota') || msg.includes('overloaded');
      if (!isRetryable) throw error;
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
    }
  }
  throw new Error('Max retries exceeded');
};

/**
 * Resizes a base64 image to specific dimensions and returns a new base64 string.
 */
export const resizeBase64Image = (
  base64: string,
  targetWidth: number,
  targetHeight: number,
  format: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      
      if (format === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL(format));
    };
    img.onerror = (error) => reject(error);
    img.src = base64;
  });
};

/**
 * Share an image via Web Share API (mobile/modern browsers).
 * Falls back to copying the data URL to the clipboard.
 * Returns: 'shared' | 'copied' | 'unsupported'
 */
export const shareImage = async (
  dataUrl: string,
  filename: string
): Promise<'shared' | 'copied' | 'unsupported'> => {
  // Convert data URL to Blob
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], filename, { type: blob.type });

  // Prefer Web Share API (works on mobile / modern browsers)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: 'AutoShadow AI' });
    return 'shared';
  }

  // Fallback: copy data URL to clipboard
  if (navigator.clipboard) {
    try {
      // Attempt to write image directly if supported
      const clipItem = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([clipItem]);
      return 'copied';
    } catch {
      // Last resort: write text URL
      await navigator.clipboard.writeText(dataUrl);
      return 'copied';
    }
  }

  return 'unsupported';
};

/**
 * Creates a zip file of all successfully generated batch images and triggers a download.
 */
export const downloadAllBatchImages = async (batchItems: BatchImageItem[]) => {
  const zip = new JSZip();
  let imageCount = 0;

  for (const item of batchItems) {
    if (item.resultImage) {
      const base64Data = item.resultImage.split(',')[1]; // Remove data URL prefix
      const fileName = `autoshadow_batch_${item.id}.png`; // Unique name for each image
      zip.file(fileName, base64Data, { base64: true });
      imageCount++;
    }
  }

  if (imageCount === 0) {
    alert("No se generaron imágenes exitosamente para descargar.");
    return;
  }

  try {
    const zipBlob = await zip.generateAsync({ type: "blob" });
    saveAs(zipBlob, `autoshadow_batch_results_${Date.now()}.zip`);
    alert(`Descargando ${imageCount} imagen(es) en un archivo zip.`);
  } catch (error) {
    console.error("Error creating or downloading zip file:", error);
    alert("Error al generar el archivo zip.");
  }
};