/**
 * Canalia dentro de claude.ai: lee la foto con la cuenta de Claude de quien
 * usa la página (capacidad `sample`) y entrega los archivos con la capacidad
 * `downloads`. Fuera de claude.ai, `window.claude` no existe y todo queda
 * desactivado.
 */

import { cleanNotes, coerceExtraction, hintLines, JSON_SHAPE, normalizeExtraction, READING_RULES, type ReadResult } from './reading';

interface SampleOptions {
  onText?: (update: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  images?: Blob[];
  modelTier?: 'default' | 'complex' | 'quick';
  cache?: boolean;
}

interface SampleFn {
  (input: string, options?: SampleOptions): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: string, options?: SampleOptions): Promise<T>;
  limits(): Promise<{ maxPromptBytes: number; images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] } }>;
}

interface DownloadsNs {
  save(request: { filename: string; data: Blob | string }): Promise<{ status: 'saved' | 'delivered' }>;
}

interface ClaudeGlobal {
  use(name: string): Promise<unknown>;
}

export interface ClaudeRuntime {
  sample: SampleFn | null;
  downloads: DownloadsNs | null;
  maxImages: number;
}

/** Conecta con claude.ai. Devuelve nulls si la página no se abre allí. */
export async function connectClaude(): Promise<ClaudeRuntime> {
  const claude = (window as unknown as { claude?: ClaudeGlobal }).claude;
  if (!claude?.use) return { sample: null, downloads: null, maxImages: 0 };
  const [sample, downloads] = await Promise.all([
    claude.use('sample').catch(() => null) as Promise<SampleFn | null>,
    claude.use('downloads').catch(() => null) as Promise<DownloadsNs | null>,
  ]);
  let maxImages = 0;
  if (sample) {
    const limits = await sample.limits().catch(() => null);
    maxImages = limits?.images?.maxCount ?? 0;
  }
  return { sample, downloads, maxImages };
}

// ---------------------------------------------------------------------------
// Trozos de imagen
// ---------------------------------------------------------------------------

/** claude.ai reduce cada imagen a ~1,2 megapíxeles: una página entera pierde detalle. */
const TARGET_PIXELS = 1_150_000;
const MAX_STRIPS = 3;
const OVERLAP = 0.08;

interface Piece {
  blob: Blob;
  label: string;
}

async function stripsOf(blob: Blob, page: number, budget: number): Promise<Piece[]> {
  const whole: Piece[] = [{ blob, label: `page ${page}` }];
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return whole;
  }
  const { width, height } = bitmap;
  const count = Math.min(MAX_STRIPS, budget, Math.ceil((width * height) / TARGET_PIXELS));
  if (count <= 1) {
    bitmap.close();
    return whole;
  }
  const vertical = height >= width; // página vertical: tiras horizontales, de arriba abajo
  const length = vertical ? height : width;
  const step = length / count;
  const pad = Math.round(step * OVERLAP);
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.max(0, Math.round(i * step) - pad);
    const end = Math.min(length, Math.round((i + 1) * step) + pad);
    const canvas = document.createElement('canvas');
    canvas.width = vertical ? width : end - start;
    canvas.height = vertical ? end - start : height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return whole;
    }
    if (vertical) ctx.drawImage(bitmap, 0, start, width, end - start, 0, 0, width, end - start);
    else ctx.drawImage(bitmap, start, 0, end - start, height, 0, 0, end - start, height);
    const piece = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!piece) {
      bitmap.close();
      return whole;
    }
    const where = vertical ? (i === 0 ? 'top' : i === count - 1 ? 'bottom' : 'middle') : i === 0 ? 'left' : i === count - 1 ? 'right' : 'middle';
    pieces.push({ blob: piece, label: `page ${page}, strip ${i + 1} of ${count} (${where})` });
  }
  bitmap.close();
  return pieces;
}

/** Corta las fotos grandes en tiras si caben en el número de imágenes permitido. */
export async function prepareImages(blobs: Blob[], maxImages: number): Promise<Piece[]> {
  if (blobs.length > maxImages) {
    throw new Error(`Se pueden enviar como mucho ${maxImages} fotos a la vez. Quita alguna.`);
  }
  const pieces: Piece[] = [];
  for (let i = 0; i < blobs.length; i++) {
    // Reparte las imágenes que sobran entre las fotos que quedan por cortar.
    const remainingPhotos = blobs.length - i - 1;
    const budget = Math.max(1, maxImages - pieces.length - remainingPhotos);
    pieces.push(...(await stripsOf(blobs[i], i + 1, budget)));
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

const ERROR_COPY: Record<string, string> = {
  cancelled: 'Lectura cancelada.',
  not_granted: 'No has permitido que Canalia use Claude. Recarga la página y acepta el aviso para leer fotos.',
  sampling_disabled: 'Tu cuenta u organización no permite usar Claude desde esta página.',
  not_declared: 'Esta versión de la página no puede usar Claude.',
  capability_disabled: 'Claude no está disponible en esta vista.',
  capability_removed: 'Actualiza la app de Claude para leer fotos desde esta página.',
  images_unavailable: 'Esta vista no puede enviar imágenes a Claude. Abre la página en claude.ai.',
  image_rejected: 'Una de las fotos no se puede usar. Prueba con un JPG o PNG más pequeño.',
  rate_limited: 'Has llegado al límite de uso de Claude por ahora. Prueba de nuevo más tarde.',
  session_expired: 'Tu sesión de Claude ha caducado. Vuelve a iniciar sesión y recarga la página.',
  refused: 'Claude no ha podido procesar estas fotos. Prueba con otra foto de la tabla DMX.',
  invalid_json: 'La respuesta no tenía el formato esperado. Vuelve a intentarlo; si se repite, sube menos páginas a la vez.',
  empty_completion: 'Claude no ha devuelto nada. Vuelve a intentarlo con una foto más nítida.',
  prompt_too_large: 'Demasiada información a la vez. Sube menos páginas.',
};

function describeSampleError(err: unknown): Error {
  if (err instanceof Error) return err;
  const code = (err as { code?: string } | null)?.code ?? '';
  return new Error(ERROR_COPY[code] ?? 'Ha fallado la conexión con Claude. Vuelve a intentarlo.');
}

export async function readWithClaude(options: {
  runtime: ClaudeRuntime;
  images: Blob[];
  manufacturer?: string;
  name?: string;
  signal?: AbortSignal;
  onProgress?: (text: string) => void;
}): Promise<ReadResult> {
  const { runtime, signal, onProgress } = options;
  if (!runtime.sample) throw new Error('Abre Canalia en claude.ai para leer fotos con Claude.');
  if (runtime.maxImages < 1) throw new Error(ERROR_COPY.images_unavailable);
  if (options.images.length === 0) throw new Error('Añade al menos una foto de la tabla DMX.');

  onProgress?.('Preparando fotos…');
  const pieces = await prepareImages(options.images, runtime.maxImages);
  const cut = pieces.length > options.images.length;
  const prompt = [
    READING_RULES,
    '',
    `You get ${pieces.length} image${pieces.length === 1 ? '' : 's'} of the manual, in this order:`,
    ...pieces.map((p, i) => `${i + 1}. ${p.label}`),
    cut
      ? 'Large pages were cut into strips that overlap a little. A row that appears in two strips is the same row: list each DMX channel once.'
      : '',
    ...hintLines(options),
    '',
    JSON_SHAPE,
  ]
    .filter((line) => line !== '')
    .join('\n');

  onProgress?.('Leyendo la tabla DMX…');
  try {
    const raw = await runtime.sample.json(prompt, {
      images: pieces.map((p) => p.blob),
      modelTier: 'complex',
      cache: false,
      signal,
      onText: ({ text }) => {
        const channels = (text.match(/"number"/g) ?? []).length;
        onProgress?.(channels > 0 ? `Escribiendo canales… ${channels} leídos` : 'Escribiendo canales…');
      },
    });
    const parsed = coerceExtraction(raw);
    return { fixture: normalizeExtraction(parsed, options), notes: cleanNotes(parsed.notes), usage: null };
  } catch (err) {
    throw describeSampleError(err);
  }
}
