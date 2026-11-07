import type { Fixture } from './model';

/** Aparato de ejemplo para probar la herramienta sin API key. */
export function demoFixture(): Fixture {
  return {
    manufacturer: 'Ejemplo',
    name: 'Beam 230',
    shortName: 'Beam230',
    beamType: 'Spot',
    beamAngle: 3,
    panDegrees: 540,
    tiltDegrees: 270,
    modes: [
      {
        name: '16CH',
        channels: [
          {
            number: 1, fine: null, label: 'Color', attr: 'COLOR1', cell: 0, defaultValue: 0,
            ranges: [
              { from: 0, to: 4, name: 'White' },
              { from: 5, to: 9, name: 'Red' },
              { from: 10, to: 14, name: 'Orange' },
              { from: 15, to: 19, name: 'Aquamarine' },
              { from: 20, to: 24, name: 'Green' },
              { from: 25, to: 29, name: 'Light green' },
              { from: 30, to: 34, name: 'Lavender' },
              { from: 35, to: 39, name: 'Pink' },
              { from: 40, to: 44, name: 'Yellow' },
              { from: 45, to: 49, name: 'Magenta' },
              { from: 50, to: 54, name: 'Cyan' },
              { from: 55, to: 59, name: 'CTO' },
              { from: 128, to: 191, name: 'Rainbow CW' },
              { from: 192, to: 255, name: 'Rainbow CCW' },
            ],
          },
          {
            number: 2, fine: null, label: 'Strobe', attr: 'SHUTTER', cell: 0, defaultValue: 255,
            ranges: [
              { from: 0, to: 3, name: 'Closed' },
              { from: 4, to: 103, name: 'Strobe slow-fast' },
              { from: 104, to: 107, name: 'Open' },
              { from: 108, to: 207, name: 'Pulse slow-fast' },
              { from: 208, to: 212, name: 'Open' },
              { from: 213, to: 251, name: 'Random strobe' },
              { from: 252, to: 255, name: 'Open' },
            ],
          },
          { number: 3, fine: null, label: 'Dimmer', attr: 'DIM', cell: 0, defaultValue: 0, ranges: [] },
          {
            number: 4, fine: null, label: 'Gobo', attr: 'GOBO1', cell: 0, defaultValue: 0,
            ranges: [
              { from: 0, to: 3, name: 'Open' },
              { from: 4, to: 7, name: 'Gobo 1' },
              { from: 8, to: 11, name: 'Gobo 2' },
              { from: 12, to: 15, name: 'Gobo 3' },
              { from: 16, to: 19, name: 'Gobo 4' },
              { from: 64, to: 127, name: 'Gobo shake' },
              { from: 128, to: 255, name: 'Gobo wheel spin' },
            ],
          },
          {
            number: 5, fine: null, label: 'Prism', attr: 'PRISMA1', cell: 0, defaultValue: 0,
            ranges: [
              { from: 0, to: 127, name: 'No prism' },
              { from: 128, to: 255, name: '8-facet prism' },
            ],
          },
          { number: 6, fine: null, label: 'Prism rotation', attr: 'PRISMA1_POS', cell: 0, defaultValue: 0, ranges: [] },
          { number: 7, fine: null, label: 'Frost', attr: 'FROST', cell: 0, defaultValue: 0, ranges: [] },
          { number: 8, fine: null, label: 'Focus', attr: 'FOCUS', cell: 0, defaultValue: 0, ranges: [] },
          { number: 9, fine: 10, label: 'Pan', attr: 'PAN', cell: 0, defaultValue: 128, ranges: [] },
          { number: 11, fine: 12, label: 'Tilt', attr: 'TILT', cell: 0, defaultValue: 128, ranges: [] },
          { number: 13, fine: null, label: 'Pan/Tilt speed', attr: 'POSITIONMSPEED', cell: 0, defaultValue: 0, ranges: [] },
          {
            number: 14, fine: null, label: 'Reset', attr: 'CONTROL', cell: 0, defaultValue: 0,
            ranges: [
              { from: 0, to: 199, name: 'No function' },
              { from: 200, to: 255, name: 'Reset (3 s)' },
            ],
          },
          { number: 15, fine: null, label: 'Lamp', attr: 'NOFUNCTION', cell: 0, defaultValue: 0, ranges: [] },
          {
            number: 16, fine: null, label: 'Programs', attr: 'EFFECTMACROS', cell: 0, defaultValue: 0,
            ranges: [
              { from: 0, to: 9, name: 'No function' },
              { from: 10, to: 255, name: 'Auto programs' },
            ],
          },
        ],
      },
    ],
  };
}
