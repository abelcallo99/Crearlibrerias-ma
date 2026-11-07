/**
 * Instrucciones de lectura y normalización de la respuesta de la IA.
 *
 * Se comparten entre las dos formas de leer la foto: la API de Anthropic con
 * la clave del usuario (extract.ts) y la cuenta de Claude del usuario dentro
 * de claude.ai (sampleReader.ts). No depende del SDK ni de zod para que la
 * versión de claude.ai sea ligera.
 */

import { ATTRIBUTES, getAttribute } from './catalog';
import { emptyFixture, type BeamType, type Channel, type Fixture } from './model';

/** Lo que devuelve la IA, ya comprobado campo a campo. */
export interface Extraction {
  manufacturer: string;
  name: string;
  shortName: string;
  beamType: string;
  beamAngle: number | null;
  panDegrees: number | null;
  tiltDegrees: number | null;
  modes: {
    name: string;
    channels: {
      number: number;
      fine: number | null;
      label: string;
      attr: string;
      cell: number;
      defaultValue: number;
      ranges: { from: number; to: number; name: string }[];
    }[];
  }[];
  notes: string[];
}

export interface ReadResult {
  fixture: Fixture;
  notes: string[];
  /** Solo con la API: tokens y coste aproximado. */
  usage: { inputTokens: number; outputTokens: number; costUsd: number } | null;
}

const ATTRIBUTE_LIST = ATTRIBUTES.map((a) => `- ${a.key}: ${a.hint}`).join('\n');

export const READING_RULES = `You are an expert lighting programmer who builds grandMA2 fixture types.
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

/** Forma del JSON, para cuando no se puede imponer un esquema (claude.ai). */
export const JSON_SHAPE = `Reply with only one JSON object, no other text, with exactly this shape:
{
  "manufacturer": "string",
  "name": "string",
  "shortName": "string",
  "beamType": "Wash" | "Spot" | "None",
  "beamAngle": number | null,
  "panDegrees": number | null,
  "tiltDegrees": number | null,
  "modes": [
    {
      "name": "string",
      "channels": [
        {
          "number": 1,
          "fine": null,
          "label": "Dimmer",
          "attr": "DIM",
          "cell": 0,
          "defaultValue": 0,
          "ranges": [ { "from": 0, "to": 9, "name": "Open" } ]
        }
      ]
    }
  ],
  "notes": ["string"]
}`;

export function hintLines(hints: { manufacturer?: string; name?: string }): string[] {
  return [
    hints.manufacturer?.trim() ? `Manufacturer (from the user): ${hints.manufacturer.trim()}` : '',
    hints.name?.trim() ? `Fixture name (from the user): ${hints.name.trim()}` : '',
  ].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Comprobación tolerante de la respuesta
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function num(v: unknown, fallback: number): number {
  return numOrNull(v) ?? fallback;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Convierte la respuesta en una Extraction aunque venga con tipos raros
 * (números como texto, campos que faltan...). Lanza un error si no es un
 * objeto con una lista de modos.
 */
export function coerceExtraction(value: unknown): Extraction {
  const root = obj(value);
  if (!Array.isArray(root.modes)) {
    throw new Error('La respuesta de la IA no tiene el formato esperado. Vuelve a intentarlo.');
  }
  return {
    manufacturer: str(root.manufacturer),
    name: str(root.name),
    shortName: str(root.shortName),
    beamType: str(root.beamType),
    beamAngle: numOrNull(root.beamAngle),
    panDegrees: numOrNull(root.panDegrees),
    tiltDegrees: numOrNull(root.tiltDegrees),
    modes: arr(root.modes).map((m) => {
      const mode = obj(m);
      return {
        name: str(mode.name),
        channels: arr(mode.channels).map((c) => {
          const ch = obj(c);
          return {
            number: num(ch.number, 0),
            fine: numOrNull(ch.fine),
            label: str(ch.label),
            attr: str(ch.attr),
            cell: num(ch.cell, 0),
            defaultValue: num(ch.defaultValue, 0),
            ranges: arr(ch.ranges).map((r) => {
              const range = obj(r);
              return { from: num(range.from, 0), to: num(range.to, 255), name: str(range.name) };
            }),
          };
        }),
      };
    }),
    notes: arr(root.notes).map(str),
  };
}

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
      .map((m) => {
        const channels = m.channels
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
          .sort((a, b) => a.number - b.number);
        // Si la tabla se leyó en varios trozos que se solapan, un mismo canal
        // puede venir dos veces: se queda la versión con más rangos.
        const byNumber = new Map<number, Channel>();
        for (const ch of channels) {
          const prev = byNumber.get(ch.number);
          if (!prev || ch.ranges.length > prev.ranges.length) byNumber.set(ch.number, ch);
        }
        return { name: m.name.trim() || `${byNumber.size}CH`, channels: [...byNumber.values()] };
      }),
  };
}

export function cleanNotes(notes: string[]): string[] {
  return notes.map((n) => n.trim()).filter(Boolean);
}
