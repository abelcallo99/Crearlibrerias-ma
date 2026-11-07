/**
 * Catálogo de atributos de grandMA2.
 *
 * Cada entrada traduce una función típica de un manual (dimmer, pan, rueda de
 * color...) al nombre de atributo de la librería de grandMA2 y a su feature y
 * preset type. Los nombres y agrupaciones están tomados de fixture types
 * exportados desde consolas grandMA2 (versión 3.x).
 */

export interface Ma2Attribute {
  /** Clave interna de Canalia (es lo que elige la IA). */
  key: string;
  /** Texto en español para la interfaz. */
  label: string;
  /** Grupo para el desplegable de la interfaz. */
  group: string;
  /** Pista para la IA: qué canales del manual corresponden a este atributo. */
  hint: string;
  /** Nombre de atributo de la librería de grandMA2. */
  attribute: string;
  attributeUserName: string;
  subattribute: string;
  subattributeUserName: string;
  feature: string;
  featureUserName: string;
  preset: string;
  presetUserName: string;
  /** Rango físico (physfrom/physto). Pan y tilt lo calculan aparte. */
  physFrom?: number;
  physTo?: number;
  /** Color de la mezcla RGB que muestra la consola (hex sin #). */
  color?: string;
  /** Valor de highlight (0-100). */
  highlight?: number;
}

type Def = Omit<Ma2Attribute, 'subattribute' | 'subattributeUserName'> &
  Partial<Pick<Ma2Attribute, 'subattribute' | 'subattributeUserName'>>;

const DIMMER = { feature: 'DIMMER', featureUserName: 'Dimmer', preset: 'DIMMER', presetUserName: 'Dimmer' };
const POSITION = { feature: 'POSITION', featureUserName: 'Position', preset: 'POSITION', presetUserName: 'Position' };
const MIXCOLOR = { feature: 'COLORRGB', featureUserName: 'MixColor', preset: 'COLOR', presetUserName: 'Color' };
const BEAM = { preset: 'BEAM', presetUserName: 'Beam' };
const BEAM1 = { feature: 'BEAM1', featureUserName: 'Beam', ...BEAM };
const FOCUS = { feature: 'FOCUS', featureUserName: 'Focus', preset: 'FOCUS', presetUserName: 'Focus' };
const CONTROL = { preset: 'CONTROL', presetUserName: 'Control' };

const DEFS: Def[] = [
  // Dimmer
  { key: 'DIM', label: 'Dimmer (intensidad)', group: 'Dimmer', hint: 'Master dimmer / intensity 0-100%.',
    attribute: 'DIM', attributeUserName: 'Dim', ...DIMMER, physFrom: 0, physTo: 1, highlight: 100 },

  // Posición
  { key: 'PAN', label: 'Pan', group: 'Posición', hint: 'Pan movement (horizontal).',
    attribute: 'PAN', attributeUserName: 'Pan', ...POSITION },
  { key: 'TILT', label: 'Tilt', group: 'Posición', hint: 'Tilt movement (vertical).',
    attribute: 'TILT', attributeUserName: 'Tilt', ...POSITION },
  { key: 'POSITIONMSPEED', label: 'Velocidad pan/tilt', group: 'Posición', hint: 'Pan/tilt speed, vector speed, movement speed.',
    attribute: 'POSITIONMSPEED', attributeUserName: 'PosMSpeed', feature: 'MSPEED', featureUserName: 'Mspeed', ...CONTROL },

  // Color: mezcla
  { key: 'RED', label: 'Rojo (R)', group: 'Color', hint: 'Red LED / red color mixing.',
    attribute: 'COLORRGB1', attributeUserName: 'R', ...MIXCOLOR, physFrom: 0, physTo: 1, color: 'ff0000' },
  { key: 'GREEN', label: 'Verde (G)', group: 'Color', hint: 'Green LED / green color mixing.',
    attribute: 'COLORRGB2', attributeUserName: 'G', ...MIXCOLOR, physFrom: 0, physTo: 1, color: '00ff00' },
  { key: 'BLUE', label: 'Azul (B)', group: 'Color', hint: 'Blue LED / blue color mixing.',
    attribute: 'COLORRGB3', attributeUserName: 'B', ...MIXCOLOR, physFrom: 0, physTo: 1, color: '0000ff' },
  { key: 'WHITE', label: 'Blanco (W)', group: 'Color', hint: 'White LED.',
    attribute: 'COLORRGB5', attributeUserName: 'W', ...MIXCOLOR, physFrom: 0, physTo: 1, color: 'ffffff' },
  { key: 'AMBER', label: 'Ámbar (A)', group: 'Color', hint: 'Amber LED.',
    attribute: 'COLORRGB4', attributeUserName: 'A', ...MIXCOLOR, physFrom: 0, physTo: 1, color: 'ffbf00' },
  { key: 'UV', label: 'Ultravioleta (UV)', group: 'Color', hint: 'UV / purple LED.',
    attribute: 'COLORRGB6', attributeUserName: 'UV', ...MIXCOLOR, physFrom: 0, physTo: 1, color: '7f00ff' },
  // grandMA2 trata cian/magenta/amarillo como R/G/B invertidos.
  { key: 'CYAN', label: 'Cian (C)', group: 'Color', hint: 'Cyan flag of a CMY color mixing system.',
    attribute: 'COLORRGB1', attributeUserName: 'C', ...MIXCOLOR, physFrom: 1, physTo: 0, color: '00ffff' },
  { key: 'MAGENTA', label: 'Magenta (M)', group: 'Color', hint: 'Magenta flag of a CMY color mixing system.',
    attribute: 'COLORRGB2', attributeUserName: 'M', ...MIXCOLOR, physFrom: 1, physTo: 0, color: 'ff00ff' },
  { key: 'YELLOW', label: 'Amarillo (Y)', group: 'Color', hint: 'Yellow flag of a CMY color mixing system.',
    attribute: 'COLORRGB3', attributeUserName: 'Y', ...MIXCOLOR, physFrom: 1, physTo: 0, color: 'ffff00' },
  { key: 'CTO', label: 'CTO / temperatura de color', group: 'Color', hint: 'CTO, CTC, color temperature correction.',
    attribute: 'CTO', attributeUserName: 'CTO', feature: 'CTO', featureUserName: 'CTO', preset: 'COLOR', presetUserName: 'Color' },

  // Color: ruedas y macros
  { key: 'COLOR1', label: 'Rueda de color 1', group: 'Color', hint: 'Color wheel (first). Fixed colors, split colors, wheel rotation/rainbow.',
    attribute: 'COLOR1', attributeUserName: 'C1', subattribute: 'COLOR1', subattributeUserName: 'Select',
    feature: 'COLOR1', featureUserName: 'Color1', preset: 'COLOR', presetUserName: 'Color' },
  { key: 'COLOR2', label: 'Rueda de color 2', group: 'Color', hint: 'Second color wheel.',
    attribute: 'COLOR2', attributeUserName: 'C2', subattribute: 'COLOR2', subattributeUserName: 'Select2',
    feature: 'COLOR2', featureUserName: 'Color2', preset: 'COLOR', presetUserName: 'Color' },
  { key: 'COLORMIXER', label: 'Macros de color', group: 'Color', hint: 'Preset color macros of LED fixtures (built-in color presets, color chase, auto color).',
    attribute: 'COLORMIXER', attributeUserName: 'ColorMix', subattribute: 'COLORMIXCOLOR', subattributeUserName: 'ColorMacro',
    feature: 'COLORMIX', featureUserName: 'ColorMix', preset: 'COLOR', presetUserName: 'Color' },
  { key: 'COLORMIXMACRORATE', label: 'Velocidad macros de color', group: 'Color', hint: 'Speed of color macros / color chase.',
    attribute: 'COLORMIXMACRORATE', attributeUserName: 'ColorMacroRate',
    feature: 'COLORMIX', featureUserName: 'ColorMix', preset: 'COLOR', presetUserName: 'Color' },

  // Gobo
  { key: 'GOBO1', label: 'Rueda de gobos 1', group: 'Gobo', hint: 'Gobo wheel (first, often rotating). Gobo selection, gobo shake, wheel rotation.',
    attribute: 'GOBO1', attributeUserName: 'G1', subattribute: 'GOBO1', subattributeUserName: 'Select',
    feature: 'GOBO1', featureUserName: 'Gobo1', preset: 'GOBO', presetUserName: 'Gobo' },
  { key: 'GOBO1_POS', label: 'Rotación / índice gobo 1', group: 'Gobo', hint: 'Gobo rotation or indexing of gobo wheel 1.',
    attribute: 'GOBO1_POS', attributeUserName: 'G1<>', subattribute: 'GOBO1_POS', subattributeUserName: 'Index',
    feature: 'GOBO1', featureUserName: 'Gobo1', preset: 'GOBO', presetUserName: 'Gobo' },
  { key: 'GOBO2', label: 'Rueda de gobos 2', group: 'Gobo', hint: 'Second gobo wheel (often the static wheel).',
    attribute: 'GOBO2', attributeUserName: 'G2', subattribute: 'GOBO2', subattributeUserName: 'Select2',
    feature: 'GOBO2', featureUserName: 'Gobo2', preset: 'GOBO', presetUserName: 'Gobo' },
  { key: 'GOBO2_POS', label: 'Rotación / índice gobo 2', group: 'Gobo', hint: 'Gobo rotation or indexing of gobo wheel 2.',
    attribute: 'GOBO2_POS', attributeUserName: 'G2<>', subattribute: 'GOBO2_POS', subattributeUserName: 'Index2',
    feature: 'GOBO2', featureUserName: 'Gobo2', preset: 'GOBO', presetUserName: 'Gobo' },
  { key: 'EFFECTWHEEL', label: 'Rueda de efectos / animación', group: 'Gobo', hint: 'Effect wheel, animation wheel.',
    attribute: 'EFFECTWHEEL', attributeUserName: 'E', subattribute: 'EFFECTWHEELSELECT', subattributeUserName: 'Select',
    feature: 'EFFECT', featureUserName: 'Effect', ...BEAM },

  // Haz
  { key: 'SHUTTER', label: 'Shutter / estrobo', group: 'Haz', hint: 'Shutter, strobe, pulse, random strobe, open/closed.',
    attribute: 'SHUTTER', attributeUserName: 'Shutter', feature: 'SHUTTER', featureUserName: 'Shutter', ...BEAM },
  { key: 'IRIS', label: 'Iris', group: 'Haz', hint: 'Iris.',
    attribute: 'IRIS', attributeUserName: 'Iris', ...BEAM1 },
  { key: 'PRISMA1', label: 'Prisma', group: 'Haz', hint: 'Prism insertion / prism selection.',
    attribute: 'PRISMA1', attributeUserName: 'Prism1', ...BEAM1 },
  { key: 'PRISMA1_POS', label: 'Rotación de prisma', group: 'Haz', hint: 'Prism rotation or indexing.',
    attribute: 'PRISMA1_POS', attributeUserName: 'Pos1', ...BEAM1 },
  { key: 'FROST', label: 'Frost', group: 'Haz', hint: 'Frost filter.',
    attribute: 'FROST', attributeUserName: 'Frost', ...BEAM1, physFrom: 0, physTo: 1 },
  { key: 'EFFECTMACROS', label: 'Programas / efectos internos', group: 'Haz', hint: 'Built-in programs, auto mode programs, internal effects, pixel effects, chases.',
    attribute: 'EFFECTMACROS', attributeUserName: 'EffectMacros', subattribute: 'EFFECTMACROSELECT', subattributeUserName: 'Select',
    feature: 'EFFECTMACROS', featureUserName: 'Macros', ...BEAM },
  { key: 'EFFECTSPEED', label: 'Velocidad de programas', group: 'Haz', hint: 'Speed of built-in programs/effects.',
    attribute: 'EFFECTSPEED', attributeUserName: 'EffectSpeed', feature: 'EFFECTMACROS', featureUserName: 'Macros', ...BEAM },

  // Foco
  { key: 'ZOOM', label: 'Zoom', group: 'Foco', hint: 'Zoom.', attribute: 'ZOOM', attributeUserName: 'Zoom', ...FOCUS },
  { key: 'FOCUS', label: 'Foco', group: 'Foco', hint: 'Focus.', attribute: 'FOCUS', attributeUserName: 'Focus', ...FOCUS },

  // Control
  { key: 'CONTROL', label: 'Control / reset', group: 'Control', hint: 'Control channel: reset, lamp on/off, display, fan settings, special functions.',
    attribute: 'FIXTUREGLOBALRESET', attributeUserName: 'FixtureGlobal', subattribute: 'FIXTUREGLOBALRESET', subattributeUserName: 'Reset',
    feature: 'RESET', featureUserName: 'Reset', ...CONTROL },
  { key: 'MODE', label: 'Modo (auto, sonido...)', group: 'Control', hint: 'Mode/function selection: DMX mode, auto mode, sound active, master/slave.',
    attribute: 'MODE', attributeUserName: 'Mode', feature: 'FIXTURE', featureUserName: 'Fixture', ...CONTROL },
  { key: 'DIMMERCURVE', label: 'Curva / modo de dimmer', group: 'Control', hint: 'Dimmer curve or dimmer mode selection (linear, square, smooth...).',
    attribute: 'DIMMERCURVE', attributeUserName: 'DimCurve', feature: 'CONTROL', featureUserName: 'Control', ...CONTROL },
  { key: 'NOFUNCTION', label: 'Sin función / reservado', group: 'Control', hint: 'No function, reserved, not used.',
    attribute: 'DUMMY', attributeUserName: 'Dummy', subattribute: 'NOFEATURE', subattributeUserName: 'No Feature',
    feature: 'CONTROL', featureUserName: 'Control', ...CONTROL },
];

export const ATTRIBUTES: Ma2Attribute[] = DEFS.map((d) => ({
  ...d,
  subattribute: d.subattribute ?? d.attribute,
  subattributeUserName: d.subattributeUserName ?? d.attributeUserName,
}));

export const ATTRIBUTE_KEYS = ATTRIBUTES.map((a) => a.key) as [string, ...string[]];

const BY_KEY = new Map(ATTRIBUTES.map((a) => [a.key, a]));

export function getAttribute(key: string): Ma2Attribute {
  return BY_KEY.get(key) ?? BY_KEY.get('NOFUNCTION')!;
}

export const ATTRIBUTE_GROUPS = [...new Set(ATTRIBUTES.map((a) => a.group))];
