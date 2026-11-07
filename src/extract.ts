/**
 * Lectura de la tabla DMX con Claude (visión + salida estructurada).
 *
 * La llamada se hace directamente desde el navegador con la API key del
 * usuario: la clave solo viaja a api.anthropic.com.
 */

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { ATTRIBUTE_KEYS } from './catalog';
import type { SourceFile } from './image';
import { cleanNotes, coerceExtraction, hintLines, normalizeExtraction, READING_RULES, type ReadResult } from './reading';

export const MODEL = 'claude-opus-5-5';
/** Precio por millón de tokens (entrada / salida) para mostrar un coste aproximado. */
const PRICE_IN = 4;
const PRICE_OUT = 20;

/** Esquema de la respuesta: la IA solo puede elegir claves del catálogo. */
function extractionSchema() {
  const range = z.object({ from: z.number(), to: z.number(), name: z.string() });
  const channel = z.object({
    number: z.number(),
    fine: z.number().nullable(),
    label: z.string(),
    attr: z.enum(ATTRIBUTE_KEYS),
    cell: z.number(),
    defaultValue: z.number(),
    ranges: z.array(range),
  });
  return z.object({
    manufacturer: z.string(),
    name: z.string(),
    shortName: z.string(),
    beamType: z.enum(['Wash', 'Spot', 'None']),
    beamAngle: z.number().nullable(),
    panDegrees: z.number().nullable(),
    tiltDegrees: z.number().nullable(),
    modes: z.array(z.object({ name: z.string(), channels: z.array(channel) })),
    notes: z.array(z.string()),
  });
}

/**
 * Formato de salida para la API. Se usa el conversor del SDK (que adapta el
 * esquema a lo que admite la API) pero sin su parseo automático: así se puede
 * mirar stop_reason antes de leer el JSON y dar mensajes de error claros.
 */
const OUTPUT_FORMAT: Anthropic.Beta.BetaJSONOutputFormat = (() => {
  const { type, schema } = betaZodOutputFormat(extractionSchema());
  return { type, schema };
})();

export type ExtractResult = ReadResult & { model: string };

export type Progress = (stage: 'sending' | 'thinking' | 'writing', detail?: string) => void;

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
  content.push({
    type: 'text',
    text: [`Read the DMX chart in ${files.length === 1 ? 'this page' : `these ${files.length} pages`} of the manual.`, ...hintLines(options)].join('\n'),
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
        system: READING_RULES,
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
    const parsed = coerceExtraction(json);

    const inputTokens =
      message.usage.input_tokens +
      (message.usage.cache_creation_input_tokens ?? 0) +
      (message.usage.cache_read_input_tokens ?? 0);
    const outputTokens = message.usage.output_tokens;

    return {
      fixture: normalizeExtraction(parsed, options),
      notes: cleanNotes(parsed.notes),
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
