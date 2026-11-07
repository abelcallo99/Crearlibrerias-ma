/**
 * Lectura de la tabla DMX con Claude (visión + salida estructurada).
 *
 * La llamada se hace directamente desde el navegador con la API key del
 * usuario: la clave solo viaja a api.anthropic.com.
 */

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { ATTRIBUTES, ATTRIBUTE_KEYS, getAttribute } from './catalog';
import type { SourceFile } from './image';
import { emptyFixture, type BeamType, type Channel, type Fixture } from './model';

export const MODEL = 'claude-opus-5-5';
/** Precio por millón de tokens (entrada / salida) para mostrar un coste aproximado. */
const PRICE_IN = 4;
const PRICE_OUT = 20;

/**
 * Esquema de la respuesta. Con `strict` la IA solo puede elegir claves del
 * catálogo; con `strict = false` se aceptan textos libres y normalizeExtraction
 * los corrige (así una respuesta rara no rompe la lectura).
 */
function extractionSchema(strict: boolean) {
  const attr = strict ? z.enum(ATTRIBUTE_KEYS) : z.string();
  const beamType = strict ? z.enum(['Wash', 'Spot', 'None']) : z.string();
  const range = z.object({
    from: z.number(),
    to: z.number(),
    name: z.string(),
  });
  const channel = z.object({
    number: z.number(),
    fine: z.number().nullable(),
    label: z.string(),
    attr,
    cell: z.number(),
    defaultValue: z.number(),
    ranges: z.array(range),
  });
  return z.object({
    manufacturer: z.string(),
    name: z.string(),
    shortName: z.string(),
    beamType,
    beamAngle: z.number().nullable(),
    panDegrees: z.number().nullable(),
    tiltDegrees: z.number().nullable(),
    modes: z.array(z.object({ name: z.string(), channels: z.array(channel) })),
    notes: z.array(z.string()),
  });
}

const ResponseSchema = extractionSchema(false);

/**
 * Formato de salida para la API. Se usa el conversor del SDK (que adapta el
 * esquema a lo que admite la API) pero sin su parseo automático: así se puede
 * mirar stop_reason antes de leer el JSON y dar mensajes de error claros.
 */
const OUTPUT_FORMAT: Anthropic.Beta.BetaJSONOutputFormat = (() => {
  const { type, schema } = betaZodOutputFormat(extractionSchema(true));
  return { type, schema };
})();

type Extraction = z.infer<typeof ResponseSchema>;

const ATTRIBUTE_LIST = ATTRIBUTES.map((a) => `- ${a.key}: ${a.hint}`).join('\n');

const SYSTEM_PROMPT = `You are an expert lighting programmer who builds grandMA2 fixture types.
You receive photos or PDF pages of a lighting fixture's user manual. Read its DMX channel chart and return the fixture definition as JSON.

How to fill each field:
- manufacturer, name: as printed in the manual. If the user supplies them, use the user's values. shortName: a short version of the name (max ~12 characters).
- beamType: "Spot" for fixtures with gobos or a narrow beam (spot, profile, beam), "Wash" for wash, par, bar, blinder and LED fixtures, "None" for lasers, hazers and devices without a beam.
- beamAngle, panDegrees, tiltDegrees: only if printed (e.g. "Pan 540°"). Otherwise null.
- modes: one entry per DMX mode/personality in the chart (e.g. "9CH" and "14CH" columns are two modes). Name each mode as the manual does; if it has no name use the channel count, e.g. "12CH". Include every mode that is fully readable.
- channels: one entry per function, in DMX order.
  - number: DMX channel number within the mode (1 = first).
  - fine: when a function has a separate 16-bit fine channel (e.g. "Pan fine", "Tilt 16bit", "Dimmer fine"), put that channel number here and do NOT add the fine channel as its own entry. Otherwise null.
  - label: channel name as printed in the manual, short.
  - attr: the closest key from the attribute list below. Use NOFUNCTION for reserved / no function channels. Within the same cell an attr key may appear only once; if the manual has two channels for the same thing, choose the next closest key for the second one (or NOFUNCTION) and mention it in notes.
  - cell: 0 for normal channels. For fixtures with repeated sections or pixels (LED bars, multi-cell washes, "Section 1 R, G, B, Section 2 R, G, B..."), give each repeated section cell 1, 2, 3... in order; channels that control the whole fixture (master dimmer, strobe, programs) stay in cell 0.
  - defaultValue: DMX 0-255 value the fixture should rest at: the default if the manual gives one; 128 for pan and tilt; for shutter/strobe channels the value that gives an open (non-strobing) beam; otherwise 0.
  - ranges: only for channels whose chart lists distinct DMX ranges with different functions (color and gobo wheel slots, strobe/shutter modes, prism on/off, programs, sound mode, reset, dimmer curves...). Copy every range with its exact start and end DMX values (0-255). If the manual gives percentages, convert to DMX with value*255/100 rounded. Do not add ranges to a channel that is a single linear 0-255 function such as dimmer, red or pan. Range names: short (ideally under 25 characters), in the manual's language, keep color and gobo names.
- notes: short notes IN SPANISH for the user about anything unreadable, ambiguous, or assumed (e.g. "El canal 7 está borroso, revisa el rango 128-255"). Empty if everything is clear.

If the images contain no DMX chart, return an empty modes array and explain it in notes (in Spanish).
Read numbers carefully: a wrong DMX value means the console sends the wrong command. Prefer leaving a note over guessing.

Attribute list (key: meaning):
${ATTRIBUTE_LIST}`;

export interface ExtractResult {
  fixture: Fixture;
  notes: string[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
  model: string;
}

export type Progress = (stage: 'sending' | 'thinking' | 'writing', detail?: string) => void;

function clampInt(n: number | null | undefined, min: number, max: number, fallback: number): number {
  if (n == null || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Convierte la respuesta de la IA en un Fixture limpio y editable. */
export function normalizeExtraction(raw: Extraction, hints: { manufacturer?: string; name?: string }): Fixture {
  const base = emptyFixture();
  const manufacturer = hints.manufacturer?.trim() || raw.manufacturer.trim();
  const name = hints.name?.trim() || raw.name.trim();
  const beamType: BeamType = (['Wash', 'Spot', 'None'] as const).find((b) => b === raw.beamType) ?? 'Wash';

  return {
    manufacturer,
    name,
    shortName: (raw.shortName.trim() || name).slice(0, 16),
    beamType,
    beamAngle: raw.beamAngle && raw.beamAngle > 0 ? raw.beamAngle : base.beamAngle,
    panDegrees: raw.panDegrees && raw.panDegrees > 0 ? raw.panDegrees : base.panDegrees,
    tiltDegrees: raw.tiltDegrees && raw.tiltDegrees > 0 ? raw.tiltDegrees : base.tiltDegrees,
    modes: raw.modes
      .filter((m) => m.channels.length > 0)
      .map((m) => ({
        name: m.name.trim() || `${m.channels.length}CH`,
        channels: m.channels
          .map(
            (c): Channel => ({
              number: clampInt(c.number, 1, 512, 1),
              fine: c.fine == null ? null : clampInt(c.fine, 1, 512, 1),
              label: c.label.trim(),
              attr: getAttribute(c.attr).key,
              cell: clampInt(c.cell, 0, 512, 0),
              defaultValue: clampInt(c.defaultValue, 0, 255, 0),
              ranges: c.ranges
                .map((r) => {
                  const a = clampInt(r.from, 0, 255, 0);
                  const b = clampInt(r.to, 0, 255, 255);
                  return { from: Math.min(a, b), to: Math.max(a, b), name: r.name.trim() };
                })
                .sort((x, y) => x.from - y.from),
            }),
          )
          .sort((a, b) => a.number - b.number),
      })),
  };
}

function describeError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) {
    return new Error('La API key no es válida. Revísala en "API key de Anthropic".');
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new Error('Esta API key no tiene permiso para usar el modelo. Revisa tu cuenta en console.anthropic.com.');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new Error('Has alcanzado el límite de uso de la API. Espera un momento y vuelve a intentarlo.');
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new Error(`La API rechazó la petición: ${err.message}`);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new Error('No hay conexión con la API de Anthropic. Comprueba tu conexión a internet.');
  }
  if (err instanceof Anthropic.APIError) {
    return new Error(`Error de la API (${err.status ?? 'sin código'}): ${err.message}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

export async function extractFixture(options: {
  apiKey: string;
  files: SourceFile[];
  manufacturer?: string;
  name?: string;
  onProgress?: Progress;
  signal?: AbortSignal;
  /** Solo para pruebas: sustituye a fetch. */
  fetch?: typeof fetch;
}): Promise<ExtractResult> {
  const { apiKey, files, onProgress, signal } = options;
  if (!apiKey) throw new Error('Falta la API key de Anthropic.');
  if (files.length === 0) throw new Error('Añade al menos una foto o PDF del manual.');

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, fetch: options.fetch });

  const content: Anthropic.Beta.BetaContentBlockParam[] = files.map((f) =>
    f.kind === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } }
      : { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } },
  );
  const hintLines = [
    options.manufacturer?.trim() ? `Manufacturer (from the user): ${options.manufacturer.trim()}` : '',
    options.name?.trim() ? `Fixture name (from the user): ${options.name.trim()}` : '',
  ].filter(Boolean);
  content.push({
    type: 'text',
    text: [`Read the DMX chart in ${files.length === 1 ? 'this page' : `these ${files.length} pages`} of the manual.`, ...hintLines].join('\n'),
  });

  onProgress?.('sending');
  try {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high', format: OUTPUT_FORMAT },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      },
      { signal },
    );

    let channelsSeen = 0;
    stream.on('streamEvent', (event) => {
      if (event.type === 'content_block_start' && event.content_block.type === 'thinking') {
        onProgress?.('thinking');
      }
    });
    stream.on('text', (delta) => {
      // Cuenta los canales que ya se han escrito para mostrar el avance.
      channelsSeen += (delta.match(/"fine"/g) ?? []).length;
      onProgress?.('writing', String(channelsSeen));
    });

    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      throw new Error('La IA no ha podido procesar estas imágenes. Prueba con otra foto de la tabla DMX.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new Error('La respuesta se ha cortado por ser demasiado larga. Sube menos páginas a la vez.');
    }
    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('La respuesta de la IA no tiene el formato esperado. Vuelve a intentarlo.');
    }
    const result = ResponseSchema.safeParse(json);
    if (!result.success) {
      throw new Error('La respuesta de la IA no tiene el formato esperado. Vuelve a intentarlo.');
    }
    const parsed = result.data;

    const inputTokens =
      message.usage.input_tokens +
      (message.usage.cache_creation_input_tokens ?? 0) +
      (message.usage.cache_read_input_tokens ?? 0);
    const outputTokens = message.usage.output_tokens;

    return {
      fixture: normalizeExtraction(parsed, options),
      notes: parsed.notes.map((n) => n.trim()).filter(Boolean),
      usage: {
        inputTokens,
        outputTokens,
        costUsd: (inputTokens * PRICE_IN + outputTokens * PRICE_OUT) / 1_000_000,
      },
      model: message.model,
    };
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) throw new Error('Lectura cancelada.');
    throw describeError(err);
  }
}
