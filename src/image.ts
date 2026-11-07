/** Preparación de las fotos y PDFs del manual antes de enviarlos a la IA. */

export interface SourceFile {
  id: string;
  name: string;
  kind: 'image' | 'pdf';
  mediaType: 'image/jpeg' | 'application/pdf';
  /** Contenido en base64 (sin el prefijo data:). */
  data: string;
  /** El archivo ya preparado (JPEG reducido o el PDF original). */
  blob: Blob;
  /** URL para la miniatura (solo imágenes). */
  previewUrl: string | null;
  bytes: number;
}

/** Lado largo máximo que aprovecha el modelo con visión de alta resolución. */
const MAX_EDGE = 2576;
const MAX_PIXELS = 3_750_000;
const MAX_PDF_BYTES = 30 * 1024 * 1024;

let counter = 0;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(blob);
  });
}

export async function prepareFile(file: File): Promise<SourceFile> {
  const id = `f${Date.now()}-${counter++}`;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`"${file.name}" pesa más de 30 MB. Sube solo las páginas de la tabla DMX.`);
    }
    return {
      id,
      name: file.name,
      kind: 'pdf',
      mediaType: 'application/pdf',
      data: await blobToBase64(file),
      blob: file,
      previewUrl: null,
      bytes: file.size,
    };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`No se puede abrir "${file.name}". Usa una foto JPG, PNG o WebP, o un PDF.`);
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite procesar imágenes.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen.'))), 'image/jpeg', 0.9),
  );

  return {
    id,
    name: file.name,
    kind: 'image',
    mediaType: 'image/jpeg',
    data: await blobToBase64(blob),
    blob,
    previewUrl: URL.createObjectURL(blob),
    bytes: blob.size,
  };
}
