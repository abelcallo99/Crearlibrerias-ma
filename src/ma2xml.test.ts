import { describe, expect, it } from 'vitest';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { generateFixtureXml, validateMode, fileNameFor, footprint } from './ma2xml';
import type { Fixture, Mode } from './model';

const NOW = new Date(2026, 10, 7, 12, 30, 0);

function fixture(modes: Mode[]): Fixture {
  return {
    manufacturer: 'Acme Luz',
    name: 'Beam 230 "Pro"',
    shortName: 'Beam230',
    beamType: 'Spot',
    beamAngle: 3,
    panDegrees: 540,
    tiltDegrees: 270,
    modes,
  };
}

const movingHead: Mode = {
  name: '16CH',
  channels: [
    { number: 1, fine: 2, label: 'Pan', attr: 'PAN', cell: 0, defaultValue: 128, ranges: [] },
    { number: 3, fine: 4, label: 'Tilt', attr: 'TILT', cell: 0, defaultValue: 128, ranges: [] },
    { number: 5, fine: null, label: 'Velocidad P/T', attr: 'POSITIONMSPEED', cell: 0, defaultValue: 0, ranges: [] },
    { number: 6, fine: null, label: 'Dimmer', attr: 'DIM', cell: 0, defaultValue: 0, ranges: [] },
    {
      number: 7, fine: null, label: 'Strobe', attr: 'SHUTTER', cell: 0, defaultValue: 255,
      ranges: [
        { from: 0, to: 3, name: 'Cerrado' },
        { from: 4, to: 251, name: 'Strobe lento > rápido' },
        { from: 252, to: 255, name: 'Abierto' },
      ],
    },
    {
      number: 8, fine: null, label: 'Color', attr: 'COLOR1', cell: 0, defaultValue: 0,
      ranges: [
        { from: 0, to: 4, name: 'White' },
        { from: 5, to: 9, name: 'Red' },
        { from: 128, to: 255, name: 'Rainbow <>' },
      ],
    },
    { number: 9, fine: null, label: 'Gobo', attr: 'GOBO1', cell: 0, defaultValue: 0, ranges: [{ from: 0, to: 7, name: 'Open' }] },
    { number: 10, fine: null, label: 'Prisma', attr: 'PRISMA1', cell: 0, defaultValue: 0, ranges: [] },
    { number: 11, fine: null, label: 'Rot. prisma', attr: 'PRISMA1_POS', cell: 0, defaultValue: 0, ranges: [] },
    { number: 12, fine: null, label: 'Frost', attr: 'FROST', cell: 0, defaultValue: 0, ranges: [] },
    { number: 13, fine: null, label: 'Focus', attr: 'FOCUS', cell: 0, defaultValue: 0, ranges: [] },
    { number: 14, fine: null, label: 'Reset', attr: 'CONTROL', cell: 0, defaultValue: 0, ranges: [{ from: 250, to: 255, name: 'Reset (5 s)' }] },
  ],
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', isArray: (name) =>
  ['Module', 'ChannelType', 'ChannelSet', 'Instance', 'ChannelFunction'].includes(name) });

function parse(xml: string) {
  expect(XMLValidator.validate(xml.replace(/^﻿/, ''))).toBe(true);
  return parser.parse(xml.replace(/^﻿/, '')).MA;
}

describe('generateFixtureXml', () => {
  it('genera un XML válido con la estructura de una exportación de grandMA2', () => {
    const fx = fixture([movingHead]);
    const { xml, fileName } = generateFixtureXml(fx, movingHead, NOW);
    expect(fileName).toBe('acme_luz@beam_230_pro@16ch.xml');
    expect(xml.startsWith('﻿<?xml version="1.0" encoding="utf-8"?>')).toBe(true);

    const ma = parse(xml);
    expect(ma.xmlns).toBe('http://schemas.malighting.de/grandma2/xml/MA');
    expect(ma.major_vers).toBe('3');
    const ft = ma.FixtureType;
    expect(ft.name).toBe('Beam 230 "Pro"');
    expect(ft.mode).toBe('16CH');
    expect(ft.short_name).toBe('Beam230');
    expect(ft.manufacturer).toBe('Acme Luz');
    for (const block of ['Wheels', 'VirtualFunctionBlocks', 'FixtureMacroCollect', 'AutoPresets', 'RdmNotifications', 'Instances']) {
      expect(ft[block]).toBeDefined();
    }

    const modules = ft.Modules.Module;
    expect(modules).toHaveLength(1);
    const types = modules[0].ChannelType;
    expect(types).toHaveLength(12);

    const pan = types[0];
    expect(pan).toMatchObject({ attribute: 'PAN', feature: 'POSITION', preset: 'POSITION', coarse: '1', fine: '2', default: '32767.5' });
    expect(pan.ChannelFunction[0]).toMatchObject({ physfrom: '-270', physto: '270', min_dmx_24: '0', max_dmx_24: '16777215' });
    expect(types[1].ChannelFunction[0]).toMatchObject({ physfrom: '-135', physto: '135' });

    const dim = types.find((t: any) => t.attribute === 'DIM');
    expect(dim).toMatchObject({ coarse: '6', highlight_value: '100' });

    const shutter = types.find((t: any) => t.attribute === 'SHUTTER');
    expect(shutter.default).toBe('255');
    expect(shutter.ChannelFunction[0].ChannelSet.map((s: any) => [s.name, s.from_dmx, s.to_dmx])).toEqual([
      ['Cerrado', '0', '3'],
      ['Strobe lento > rápido', '4', '251'],
      ['Abierto', '252', '255'],
    ]);

    const reset = types.find((t: any) => t.coarse === '14');
    expect(reset.attribute).toBe('FIXTUREGLOBALRESET');

    expect(ft.Instances.Instance).toEqual([{ index: '0', module_index: '0' }]);
    // Caracteres especiales escapados
    expect(xml).toContain('name="Beam 230 &quot;Pro&quot;"');
    expect(xml).toContain('name="Rainbow &lt;&gt;"');
  });

  it('separa barras LED con celdas repetidas en módulos e instancias', () => {
    const channels = [
      { number: 1, fine: null, label: 'Dimmer', attr: 'DIM', cell: 0, defaultValue: 0, ranges: [] },
      { number: 2, fine: null, label: 'Strobe', attr: 'SHUTTER', cell: 0, defaultValue: 0, ranges: [] },
    ];
    for (let cell = 1; cell <= 4; cell++) {
      const base = 3 + (cell - 1) * 3;
      channels.push(
        { number: base, fine: null, label: `R${cell}`, attr: 'RED', cell, defaultValue: 0, ranges: [] },
        { number: base + 1, fine: null, label: `G${cell}`, attr: 'GREEN', cell, defaultValue: 0, ranges: [] },
        { number: base + 2, fine: null, label: `B${cell}`, attr: 'BLUE', cell, defaultValue: 0, ranges: [] },
      );
    }
    const mode: Mode = { name: '14CH', channels };
    expect(validateMode(mode).filter((i) => i.level === 'error')).toEqual([]);
    expect(footprint(mode)).toBe(14);

    const ma = parse(generateFixtureXml(fixture([mode]), mode, NOW).xml);
    const modules = ma.FixtureType.Modules.Module;
    expect(modules).toHaveLength(2);
    expect(modules[1].ChannelType.map((t: any) => [t.attribute, t.coarse])).toEqual([
      ['COLORRGB1', '1'], ['COLORRGB2', '2'], ['COLORRGB3', '3'],
    ]);
    expect(ma.FixtureType.Instances.Instance).toEqual([
      { index: '0', module_index: '0', patch: '1' },
      { index: '1', module_index: '1', patch: '3' },
      { index: '2', module_index: '1', patch: '6' },
      { index: '3', module_index: '1', patch: '9' },
      { index: '4', module_index: '1', patch: '12' },
    ]);
  });

  it('pasa los rangos de 8 bit a 16 bit en canales con fine', () => {
    const mode: Mode = {
      name: 'Ext',
      channels: [{ number: 1, fine: 2, label: 'Dimmer', attr: 'DIM', cell: 0, defaultValue: 0, ranges: [{ from: 0, to: 9, name: 'Off' }] }],
    };
    const ma = parse(generateFixtureXml(fixture([mode]), mode, NOW).xml);
    expect(ma.FixtureType.Modules.Module[0].ChannelType[0].ChannelFunction[0].ChannelSet[0]).toMatchObject({
      from_dmx: '0',
      to_dmx: '2559',
    });
  });
});

describe('validateMode', () => {
  it('detecta canales DMX repetidos y atributos duplicados', () => {
    const mode: Mode = {
      name: 'X',
      channels: [
        { number: 1, fine: null, label: 'R', attr: 'RED', cell: 0, defaultValue: 0, ranges: [] },
        { number: 1, fine: null, label: 'G', attr: 'GREEN', cell: 0, defaultValue: 0, ranges: [] },
        { number: 2, fine: null, label: 'R2', attr: 'RED', cell: 0, defaultValue: 0, ranges: [] },
      ],
    };
    const errors = validateMode(mode).filter((i) => i.level === 'error').map((i) => i.message);
    expect(errors.some((m) => m.includes('canal DMX 1 está repetido'))).toBe(true);
    expect(errors.some((m) => m.includes('COLORRGB1 aparece dos veces'))).toBe(true);
    expect(() => generateFixtureXml(fixture([mode]), mode, NOW)).toThrow();
  });

  it('permite varios canales sin función', () => {
    const mode: Mode = {
      name: 'X',
      channels: [
        { number: 1, fine: null, label: 'Dim', attr: 'DIM', cell: 0, defaultValue: 0, ranges: [] },
        { number: 2, fine: null, label: '-', attr: 'NOFUNCTION', cell: 0, defaultValue: 0, ranges: [] },
        { number: 3, fine: null, label: '-', attr: 'NOFUNCTION', cell: 0, defaultValue: 0, ranges: [] },
      ],
    };
    expect(validateMode(mode)).toEqual([]);
  });
});

describe('fileNameFor', () => {
  it('quita acentos y símbolos', () => {
    expect(fileNameFor({ ...fixture([]), manufacturer: 'Iluminación Ñ', name: 'Wash 7x40 RGBW' }, { name: '10 canales', channels: [] }))
      .toBe('iluminacion_n@wash_7x40_rgbw@10_canales.xml');
  });
});
