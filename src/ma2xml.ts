/**
 * Generador de fixture types de grandMA2 en XML.
 *
 * La estructura copia la de los ficheros que exporta una grandMA2 3.9.60
 * (Export de un FixtureType): Modules > Module > ChannelType > ChannelFunction >
 * ChannelSet, seguido de Instances y los bloques vacíos que la consola espera.
 * Cada modo DMX del manual es un fixture type distinto en grandMA2.
 */

import { getAttribute, type Ma2Attribute } from './catalog';
import type { Channel, Fixture, Mode } from './model';

export interface Issue {
  level: 'error' | 'warning';
  message: string;
}

export interface GeneratedFile {
  fileName: string;
  xml: string;
}

const MAX_24 = 16777215;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Caracteres de control no válidos en XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function num(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(6)));
}

function clampDmx(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(255, Math.max(0, Math.round(n)));
}

/** Nombre de fichero con el formato de la librería de MA: fabricante@aparato@modo.xml */
export function fileNameFor(fixture: Fixture, mode: Mode): string {
  const slug = (s: string, fallback: string) =>
    (s || fallback)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9.+-]+/g, '_')
      .replace(/^_+|_+$/g, '') || fallback;
  return `${slug(fixture.manufacturer, 'generic')}@${slug(fixture.name, 'fixture')}@${slug(mode.name, 'mode')}.xml`;
}

function channelLabel(ch: Channel): string {
  return ch.label ? `canal ${ch.number} (${ch.label})` : `canal ${ch.number}`;
}

/** Comprueba un modo antes de exportarlo. Los errores bloquean la descarga. */
export function validateMode(mode: Mode): Issue[] {
  const issues: Issue[] = [];
  if (!mode.name.trim()) issues.push({ level: 'error', message: 'El modo no tiene nombre.' });
  if (mode.channels.length === 0) {
    issues.push({ level: 'error', message: 'El modo no tiene canales.' });
    return issues;
  }

  const used = new Map<number, string>();
  for (const ch of mode.channels) {
    const slots = ch.fine == null ? [ch.number] : [ch.number, ch.fine];
    for (const slot of slots) {
      if (!Number.isInteger(slot) || slot < 1 || slot > 512) {
        issues.push({ level: 'error', message: `El ${channelLabel(ch)} tiene un número DMX no válido (${slot}).` });
        continue;
      }
      const prev = used.get(slot);
      if (prev) {
        issues.push({ level: 'error', message: `El canal DMX ${slot} está repetido: ${prev} y ${channelLabel(ch)}.` });
      } else {
        used.set(slot, channelLabel(ch));
      }
    }
    if (!Number.isInteger(ch.cell) || ch.cell < 0) {
      issues.push({ level: 'error', message: `El ${channelLabel(ch)} tiene una celda no válida.` });
    }
    for (const r of ch.ranges) {
      if (r.from < 0 || r.to > 255 || r.from > r.to) {
        issues.push({
          level: 'warning',
          message: `Rango ${r.from}-${r.to} del ${channelLabel(ch)} fuera de 0-255 o invertido; se ajustará.`,
        });
      }
    }
  }

  // grandMA2 no admite el mismo atributo dos veces dentro de un módulo.
  const byCell = groupByCell(mode.channels);
  for (const [cell, channels] of byCell) {
    const seen = new Map<string, Channel>();
    for (const ch of channels) {
      const attr = getAttribute(ch.attr).attribute;
      if (attr === 'DUMMY') continue;
      const prev = seen.get(attr);
      if (prev) {
        const where = cell === 0 ? '' : ` de la celda ${cell}`;
        issues.push({
          level: 'error',
          message:
            `${attr} aparece dos veces${where} (${channelLabel(prev)} y ${channelLabel(ch)}). ` +
            'Si son píxeles o secciones repetidas, asígnales celdas distintas; si no, cambia uno de los atributos.',
        });
      } else {
        seen.set(attr, ch);
      }
    }
  }

  // Una celda repetida debe ocupar canales seguidos para poder parchearla como instancia.
  for (const [cell, channels] of byCell) {
    if (cell === 0) continue;
    const slots = channels.flatMap((c) => (c.fine == null ? [c.number] : [c.number, c.fine]));
    const span = Math.max(...slots) - Math.min(...slots) + 1;
    if (span !== slots.length) {
      issues.push({
        level: 'warning',
        message: `La celda ${cell} no ocupa canales DMX seguidos; revisa la numeración de celdas.`,
      });
    }
  }

  const hasDim = mode.channels.some((c) => c.attr === 'DIM');
  if (!hasDim) {
    issues.push({
      level: 'warning',
      message: 'El modo no tiene canal de dimmer. Es normal en algunos LED RGB, pero compruébalo en el manual.',
    });
  }
  return issues;
}

function groupByCell(channels: Channel[]): Map<number, Channel[]> {
  const map = new Map<number, Channel[]>();
  for (const ch of [...channels].sort((a, b) => a.number - b.number)) {
    const list = map.get(ch.cell) ?? [];
    list.push(ch);
    map.set(ch.cell, list);
  }
  return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}

interface ModuleDef {
  name: string;
  /** Canales con números relativos al inicio de la instancia. */
  channels: Channel[];
}

interface InstanceDef {
  moduleIndex: number;
  patch: number;
}

/**
 * Reparte los canales en módulos e instancias.
 * - Celda 0: módulo principal, parcheado en el canal 1 (números absolutos).
 * - Celdas 1..N: un módulo por cada estructura distinta, una instancia por celda.
 */
function buildModules(mode: Mode): { modules: ModuleDef[]; instances: InstanceDef[] } {
  const byCell = groupByCell(mode.channels);
  const modules: ModuleDef[] = [];
  const instances: InstanceDef[] = [];
  const signatures = new Map<string, number>();

  for (const [cell, channels] of byCell) {
    if (cell === 0) {
      modules.push({ name: 'Main', channels });
      instances.push({ moduleIndex: modules.length - 1, patch: 1 });
      continue;
    }
    const start = Math.min(...channels.flatMap((c) => (c.fine == null ? [c.number] : [c.number, c.fine])));
    const relative = channels.map((c) => ({
      ...c,
      number: c.number - start + 1,
      fine: c.fine == null ? null : c.fine - start + 1,
    }));
    const signature = JSON.stringify(
      relative.map((c) => [c.attr, c.number, c.fine, c.defaultValue, c.ranges.map((r) => [r.from, r.to, r.name])]),
    );
    let moduleIndex = signatures.get(signature);
    if (moduleIndex === undefined) {
      const n = signatures.size + 1;
      modules.push({ name: n === 1 ? 'Cell' : `Cell ${n}`, channels: relative });
      moduleIndex = modules.length - 1;
      signatures.set(signature, moduleIndex);
    }
    instances.push({ moduleIndex, patch: start });
  }
  return { modules, instances };
}

function physRange(attr: Ma2Attribute, fixture: Fixture): [number, number] | null {
  if (attr.attribute === 'PAN') {
    const half = (fixture.panDegrees > 0 ? fixture.panDegrees : 540) / 2;
    return [-half, half];
  }
  if (attr.attribute === 'TILT') {
    const half = (fixture.tiltDegrees > 0 ? fixture.tiltDegrees : 270) / 2;
    return [-half, half];
  }
  if (attr.physFrom !== undefined && attr.physTo !== undefined) return [attr.physFrom, attr.physTo];
  return null;
}

function defaultValue(ch: Channel, attr: Ma2Attribute): number {
  const d8 = clampDmx(ch.defaultValue);
  if (ch.fine == null) return d8;
  if ((attr.attribute === 'PAN' || attr.attribute === 'TILT') && (d8 === 127 || d8 === 128)) return 32767.5;
  return d8 * 257;
}

function channelTypeXml(ch: Channel, index: number, fixture: Fixture, indent: string): string {
  const attr = getAttribute(ch.attr);
  const is16 = ch.fine != null;
  const typeAttrs = [
    `index="${index}"`,
    `attribute="${escapeXml(attr.attribute)}"`,
    `feature="${escapeXml(attr.feature)}"`,
    `preset="${escapeXml(attr.preset)}"`,
    `coarse="${ch.number}"`,
  ];
  if (is16) typeAttrs.push(`fine="${ch.fine}"`);
  const def = defaultValue(ch, attr);
  if (def > 0) typeAttrs.push(`default="${num(def)}"`);
  if (attr.highlight !== undefined) typeAttrs.push(`highlight_value="${attr.highlight}"`);
  if (attr.color) typeAttrs.push(`color="${attr.color}"`);

  const fnAttrs = [
    'index="0"',
    'from="0"',
    'to="100"',
    'min_dmx_24="0"',
    `max_dmx_24="${MAX_24}"`,
  ];
  const phys = physRange(attr, fixture);
  if (phys) fnAttrs.push(`physfrom="${num(phys[0])}"`, `physto="${num(phys[1])}"`);
  fnAttrs.push(
    `subattribute="${escapeXml(attr.subattribute)}"`,
    `subattribute_user_name="${escapeXml(attr.subattributeUserName)}"`,
    `attribute="${escapeXml(attr.attribute)}"`,
    `attribute_user_name="${escapeXml(attr.attributeUserName)}"`,
    `feature="${escapeXml(attr.feature)}"`,
    `feature_user_name="${escapeXml(attr.featureUserName)}"`,
    `preset="${escapeXml(attr.preset)}"`,
    `preset_user_name="${escapeXml(attr.presetUserName)}"`,
  );

  const sets = [...ch.ranges]
    .map((r) => {
      let from = clampDmx(r.from);
      let to = clampDmx(r.to);
      if (from > to) [from, to] = [to, from];
      return { from, to, name: r.name.trim() || `${from}-${to}` };
    })
    .sort((a, b) => a.from - b.from || a.to - b.to);

  const lines: string[] = [];
  lines.push(`${indent}<ChannelType ${typeAttrs.join(' ')}>`);
  if (sets.length === 0) {
    lines.push(`${indent}\t<ChannelFunction ${fnAttrs.join(' ')} />`);
  } else {
    lines.push(`${indent}\t<ChannelFunction ${fnAttrs.join(' ')}>`);
    sets.forEach((s, i) => {
      // En canales de 16 bit los rangos del manual (8 bit) se pasan a 16 bit.
      const from = is16 ? s.from * 256 : s.from;
      const to = is16 ? s.to * 256 + 255 : s.to;
      lines.push(`${indent}\t\t<ChannelSet index="${i}" name="${escapeXml(s.name)}" from_dmx="${from}" to_dmx="${to}" />`);
    });
    lines.push(`${indent}\t</ChannelFunction>`);
  }
  lines.push(`${indent}</ChannelType>`);
  return lines.join('\n');
}

function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Genera el XML de un modo. Lanza un error si el modo tiene errores de validación. */
export function generateFixtureXml(fixture: Fixture, mode: Mode, now: Date = new Date()): GeneratedFile {
  const errors = validateMode(mode).filter((i) => i.level === 'error');
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join('\n'));
  }

  const { modules, instances } = buildModules(mode);
  const date = isoLocal(now);
  const name = fixture.name.trim() || 'Fixture';
  const shortName = fixture.shortName.trim() || name.slice(0, 16);
  const manufacturer = fixture.manufacturer.trim() || 'Generic';
  const beamAngle = fixture.beamAngle > 0 ? fixture.beamAngle : 25;

  const out: string[] = [];
  out.push('﻿<?xml version="1.0" encoding="utf-8"?>');
  out.push(
    '<MA xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://schemas.malighting.de/grandma2/xml/MA" ' +
      'xsi:schemaLocation="http://schemas.malighting.de/grandma2/xml/MA http://schemas.malighting.de/grandma2/xml/3.9.60/MA.xsd" ' +
      'major_vers="3" minor_vers="9" stream_vers="60">',
  );
  out.push(`\t<Info datetime="${date}" showfile="canalia" />`);
  out.push(`\t<FixtureType index="1" name="${escapeXml(name)}" mode="${escapeXml(mode.name.trim())}">`);
  out.push('\t\t<InfoItems>');
  out.push(
    `\t\t\t<Info date="${date}">${escapeXml(
      'Creado con Canalia a partir de una foto del manual. Revísalo en el Fixture Type Editor antes de usarlo en un show.',
    )}</Info>`,
  );
  out.push('\t\t</InfoItems>');
  out.push(`\t\t<short_name>${escapeXml(shortName)}</short_name>`);
  out.push(`\t\t<manufacturer>${escapeXml(manufacturer)}</manufacturer>`);
  out.push(`\t\t<short_manufacturer>${escapeXml(manufacturer)}</short_manufacturer>`);
  out.push('\t\t<Modules index="0">');
  modules.forEach((m, mi) => {
    out.push(
      `\t\t\t<Module index="${mi}" name="${escapeXml(m.name)}" class="None" beamtype="${fixture.beamType}" ` +
        `beam_angle="${num(beamAngle)}" beam_intensity="10000">`,
    );
    m.channels.forEach((ch, ci) => out.push(channelTypeXml(ch, ci, fixture, '\t\t\t\t')));
    out.push('\t\t\t</Module>');
  });
  out.push('\t\t</Modules>');
  out.push('\t\t<Instances index="1">');
  if (instances.length === 1 && instances[0].patch === 1) {
    out.push(`\t\t\t<Instance index="0" module_index="${instances[0].moduleIndex}" />`);
  } else {
    instances.forEach((inst, i) =>
      out.push(`\t\t\t<Instance index="${i}" module_index="${inst.moduleIndex}" patch="${inst.patch}" />`),
    );
  }
  out.push('\t\t</Instances>');
  out.push('\t\t<Wheels index="2" />');
  out.push('\t\t<VirtualFunctionBlocks index="3" />');
  out.push('\t\t<FixtureMacroCollect index="5" />');
  out.push('\t\t<Body />');
  out.push('\t\t<AutoPresets index="4" />');
  out.push('\t\t<RdmNotifications index="6">');
  out.push('\t\t\t<RdmNotification index="0" Type="Absent" Subcategory="RDM Warning" />');
  out.push('\t\t</RdmNotifications>');
  out.push('\t</FixtureType>');
  out.push('</MA>');

  return { fileName: fileNameFor(fixture, mode), xml: out.join('\n') + '\n' };
}

/** Número de canales DMX que ocupa el modo. */
export function footprint(mode: Mode): number {
  let max = 0;
  for (const ch of mode.channels) max = Math.max(max, ch.number, ch.fine ?? 0);
  return max;
}
