/** Modelo de datos de Canalia: lo que se lee del manual y se edita antes de exportar. */

export type BeamType = 'Wash' | 'Spot' | 'None';

export interface DmxRange {
  /** Valor DMX inicial (0-255). */
  from: number;
  /** Valor DMX final (0-255). */
  to: number;
  /** Nombre del rango, tal como aparece en el manual (p. ej. "Strobe lento-rápido"). */
  name: string;
}

export interface Channel {
  /** Canal DMX (1 = primer canal del aparato). */
  number: number;
  /** Canal fine (16 bit) o null si el canal es de 8 bit. */
  fine: number | null;
  /** Nombre del canal en el manual. */
  label: string;
  /** Clave del catálogo de atributos (ver catalog.ts). */
  attr: string;
  /** 0 = canal general; 1..N = celda/píxel repetido (barras LED, etc.). */
  cell: number;
  /** Valor por defecto en DMX de 8 bit (0-255). */
  defaultValue: number;
  ranges: DmxRange[];
}

export interface Mode {
  name: string;
  channels: Channel[];
}

export interface Fixture {
  manufacturer: string;
  name: string;
  shortName: string;
  beamType: BeamType;
  /** Apertura del haz en grados. */
  beamAngle: number;
  /** Recorrido total de pan en grados (p. ej. 540). */
  panDegrees: number;
  /** Recorrido total de tilt en grados (p. ej. 270). */
  tiltDegrees: number;
  modes: Mode[];
}

export function emptyChannel(number: number): Channel {
  return { number, fine: null, label: '', attr: 'NOFUNCTION', cell: 0, defaultValue: 0, ranges: [] };
}

export function emptyFixture(): Fixture {
  return {
    manufacturer: '',
    name: '',
    shortName: '',
    beamType: 'Wash',
    beamAngle: 25,
    panDegrees: 540,
    tiltDegrees: 270,
    modes: [],
  };
}
