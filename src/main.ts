import './styles.css';
import { ATTRIBUTES, ATTRIBUTE_GROUPS, getAttribute } from './catalog';
import { demoFixture } from './demo';
import logoSvg from '../public/logo.svg?raw';
import { connectClaude, readWithClaude, type ClaudeRuntime } from './claudeRuntime';
import type { ReadResult } from './reading';
import { createZip } from './zip';
import { prepareFile, type SourceFile } from './image';
import { footprint, generateFixtureXml, validateMode, type Issue } from './ma2xml';
import { emptyChannel, emptyFixture, type BeamType, type Channel, type Fixture } from './model';

/**
 * Versión de claude.ai (`vite build --mode claude`): lee con la cuenta de
 * Claude de quien abre la página y entrega ZIP. La versión web usa la API key.
 */
const IN_CLAUDE = import.meta.env.MODE === 'claude';
const LOGO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;

// ---------------------------------------------------------------------------
// Utilidades de DOM
// ---------------------------------------------------------------------------

type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected') {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

function appendAll(el: Element, ...children: Child[]): void {
  el.append(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));
}

/** Sustituye el contenido de un elemento ignorando los hijos vacíos. */
function fill(el: Element, ...children: Child[]): void {
  el.replaceChildren(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta #${id}`);
  return el;
}

function toInt(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Almacenamiento local (solo comodidad: si falla, la app sigue funcionando)
// ---------------------------------------------------------------------------

const KEY_STORAGE = 'canalia.apiKey';
const DRAFT_STORAGE = 'canalia.draft';

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible */
  }
}

function loadDraft(): Fixture | null {
  const raw = load(DRAFT_STORAGE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Fixture;
    return Array.isArray(parsed.modes) ? { ...emptyFixture(), ...parsed } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

const state = {
  files: [] as SourceFile[],
  hintManufacturer: '',
  hintName: '',
  apiKey: load(KEY_STORAGE) ?? '',
  fixture: loadDraft(),
  notes: [] as string[],
  activeMode: 0,
  openRanges: new Set<Channel>(),
  busy: false,
  progress: '',
  error: '',
  lastRun: null as ReadResult['usage'],
  abort: null as AbortController | null,
  previewMode: -1,
  claude: null as ClaudeRuntime | null,
  exportMessage: '',
};

function persistDraft(): void {
  save(DRAFT_STORAGE, state.fixture ? JSON.stringify(state.fixture) : null);
}

// ---------------------------------------------------------------------------
// Estructura de la página
// ---------------------------------------------------------------------------

function shell(): void {
  const app = $('app');
  appendAll(app,
    h('header', { class: 'top' },
      h('div', { class: 'wrap' },
        h('div', { class: 'brand' },
          h('img', { src: LOGO, alt: '' }),
          h('div', {},
            h('div', { class: 'brand-name' }, 'Canalia'),
            h('div', { class: 'brand-tag' }, 'Librerías grandMA2 desde una foto del manual'),
          ),
        ),
        h('div', { class: 'spacer' }),
        h('button', { class: 'key-chip', id: 'key-chip', type: 'button', onclick: IN_CLAUDE ? undefined : openKeyDialog }),
      ),
    ),
    h('main', { class: 'wrap' },
      h('section', { class: 'hero' },
        h('h1', {}, 'De la tabla DMX del manual a tu ', h('em', {}, 'grandMA2'), '.'),
        h('p', {},
          IN_CLAUDE
            ? 'Haz una foto a la tabla de canales DMX, Claude la lee con tu cuenta, revisas los canales y descargas '
              + 'el fixture type (un ZIP con los XML) listo para importar en la consola o en grandMA2 onPC.'
            : 'Haz una foto a la tabla de canales DMX, revisa lo que ha leído la IA y descarga el fixture type en XML '
              + 'listo para importar en la consola o en grandMA2 onPC.'),
      ),
      h('section', { class: 'step', id: 'step-photo' }),
      h('section', { class: 'step', id: 'step-review' }),
      h('section', { class: 'step', id: 'step-export' }),
      h('footer', {},
        'Canalia no está afiliada a MA Lighting. grandMA2 es una marca de MA Lighting Technology GmbH. ',
        'Revisa siempre el fixture type en el Fixture Type Editor antes de usarlo en un show.'),
    ),
    h('div', { class: 'confirm-bar', id: 'confirm-bar', role: 'dialog', 'aria-live': 'polite', hidden: true }),
    IN_CLAUDE ? null : keyDialog(),
  );
}

/** Confirmación dentro de la página (claude.ai no muestra confirm()). */
function askConfirm(text: string, yesLabel: string, onYes: () => void): void {
  const bar = $('confirm-bar');
  const close = () => {
    bar.hidden = true;
    fill(bar);
  };
  const yes = h('button', { class: 'btn primary', type: 'button', onclick: () => { close(); onYes(); } }, yesLabel);
  fill(bar,
    h('div', { class: 'wrap confirm-inner' },
      h('span', {}, text),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancelar'),
        yes,
      ),
    ),
  );
  bar.hidden = false;
  yes.focus();
}

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------

function keyDialog(): HTMLDialogElement {
  const input = h('input', {
    type: 'password', id: 'key-input', placeholder: 'sk-ant-...', autocomplete: 'off', spellcheck: 'false',
  });
  const remember = h('input', { type: 'checkbox', id: 'key-remember' });
  const dialog = h('dialog', { id: 'key-dialog' },
    h('form', { method: 'dialog' },
      h('h3', {}, 'API key de Anthropic'),
      h('p', {},
        'Canalia usa Claude para leer la foto. La clave se envía solo a api.anthropic.com desde tu navegador; ',
        'no pasa por ningún otro servidor. Puedes crear una en ',
        h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener' }, 'console.anthropic.com'),
        '. Cada lectura cuesta unos céntimos.'),
      h('label', { class: 'field' }, 'Clave', input),
      h('label', { class: 'check mt' }, remember, 'Recordar en este navegador'),
      h('div', { class: 'row end mt' },
        h('button', { class: 'btn ghost', value: 'cancel', type: 'submit' }, 'Cancelar'),
        h('button', { class: 'btn danger', type: 'button', onclick: () => { input.value = ''; } }, 'Borrar'),
        h('button', { class: 'btn primary', value: 'ok', type: 'submit' }, 'Guardar'),
      ),
    ),
  );
  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'ok') return;
    state.apiKey = input.value.trim();
    save(KEY_STORAGE, remember.checked && state.apiKey ? state.apiKey : null);
    renderKeyChip();
    renderPhotoStep();
  });
  return dialog;
}

function openKeyDialog(): void {
  const dialog = $('key-dialog') as HTMLDialogElement;
  ($('key-input') as HTMLInputElement).value = state.apiKey;
  ($('key-remember') as HTMLInputElement).checked = load(KEY_STORAGE) !== null || !state.apiKey;
  dialog.returnValue = '';
  dialog.showModal();
}

function renderKeyChip(): void {
  const chip = $('key-chip');
  if (IN_CLAUDE) {
    const ok = Boolean(state.claude?.sample && state.claude.maxImages > 0);
    chip.classList.toggle('ok', ok);
    chip.classList.add('static');
    fill(chip, h('span', { class: 'dot' }), !state.claude ? 'Conectando con Claude…' : ok ? 'Claude conectado' : 'Sin Claude');
    return;
  }
  chip.classList.toggle('ok', Boolean(state.apiKey));
  fill(chip, h('span', { class: 'dot' }), state.apiKey ? 'API key lista' : 'Añadir API key');
}

// ---------------------------------------------------------------------------
// Paso 1: fotos
// ---------------------------------------------------------------------------

async function addFiles(list: FileList | File[]): Promise<void> {
  state.error = '';
  for (const file of Array.from(list)) {
    if (IN_CLAUDE && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
      state.error = 'Aquí no se pueden enviar PDF: sube fotos o capturas de pantalla de la tabla (JPG o PNG).';
      continue;
    }
    try {
      state.files.push(await prepareFile(file));
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
    }
  }
  renderPhotoStep();
}

function removeFile(id: string): void {
  const file = state.files.find((f) => f.id === id);
  if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
  state.files = state.files.filter((f) => f.id !== id);
  renderPhotoStep();
}

function setProgress(text: string): void {
  if (text === state.progress) return;
  state.progress = text;
  const el = document.getElementById('progress-text');
  if (el) el.textContent = text;
}

async function runExtraction(force = false): Promise<void> {
  if (!IN_CLAUDE && !state.apiKey) {
    openKeyDialog();
    return;
  }
  if (IN_CLAUDE && !state.claude?.sample) {
    state.error = 'Abre Canalia en claude.ai con tu cuenta para leer fotos con Claude.';
    renderPhotoStep();
    return;
  }
  if (!force && state.fixture && state.fixture.modes.length > 0) {
    askConfirm('Ya hay un aparato en revisión. ¿Lo sustituyo por lo que lea la IA?', 'Sustituir', () => void runExtraction(true));
    return;
  }
  state.busy = true;
  state.error = '';
  state.progress = 'Enviando fotos…';
  state.abort = new AbortController();
  renderPhotoStep();
  try {
    let result: ReadResult;
    if (IN_CLAUDE) {
      result = await readWithClaude({
        runtime: state.claude!,
        images: state.files.map((f) => f.blob),
        manufacturer: state.hintManufacturer,
        name: state.hintName,
        signal: state.abort.signal,
        onProgress: setProgress,
      });
    } else {
      // El SDK de Anthropic solo se descarga cuando hace falta.
      const { extractFixture } = await import('./extract');
      result = await extractFixture({
        apiKey: state.apiKey,
        files: state.files,
        manufacturer: state.hintManufacturer,
        name: state.hintName,
        signal: state.abort.signal,
        onProgress: (stage, detail) =>
          setProgress(
            stage === 'sending' ? 'Enviando fotos…'
            : stage === 'thinking' ? 'Leyendo la tabla DMX…'
            : `Escribiendo canales… ${detail && detail !== '0' ? `${detail} leídos` : ''}`,
          ),
      });
    }
    state.fixture = result.fixture;
    state.notes = result.notes;
    state.lastRun = result.usage;
    state.activeMode = 0;
    state.openRanges.clear();
    state.previewMode = -1;
    state.exportMessage = '';
    if (result.fixture.modes.length === 0) {
      state.error = 'No se ha encontrado ninguna tabla DMX en las imágenes.';
    }
    persistDraft();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    state.busy = false;
    state.abort = null;
    renderAll();
    if (state.fixture?.modes.length && !state.error) $('step-review').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderPhotoStep(): void {
  const step = $('step-photo');
  const fileInput = h('input', {
    type: 'file', accept: IN_CLAUDE ? 'image/jpeg,image/png,image/webp' : 'image/*,application/pdf', multiple: true, hidden: true,
    onchange: (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.files) void addFiles(input.files);
      input.value = '';
    },
  });
  const cameraInput = h('input', {
    type: 'file', accept: 'image/*', capture: 'environment', hidden: true,
    onchange: (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.files) void addFiles(input.files);
      input.value = '';
    },
  });

  const drop = h('div', { class: 'drop' },
    h('p', {}, IN_CLAUDE
      ? 'Arrastra aquí las fotos de la tabla DMX. Si ocupa varias páginas, súbelas todas.'
      : 'Arrastra aquí las fotos o el PDF de la tabla DMX. Si ocupa varias páginas, súbelas todas.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => cameraInput.click(), disabled: state.busy }, 'Hacer foto'),
      h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click(), disabled: state.busy }, 'Elegir archivos'),
    ),
    fileInput,
    cameraInput,
  );
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer?.files.length) void addFiles(e.dataTransfer.files);
  });

  const thumbs = state.files.length
    ? h('div', { class: 'thumbs' },
        ...state.files.map((f) =>
          h('div', { class: 'thumb' },
            f.previewUrl ? h('img', { src: f.previewUrl, alt: f.name }) : h('div', { class: 'pdf' }, `PDF · ${f.name}`),
            h('button', { type: 'button', 'aria-label': `Quitar ${f.name}`, onclick: () => removeFile(f.id), disabled: state.busy }, '×'),
          ),
        ),
      )
    : null;

  const claudeMissing = IN_CLAUDE && state.claude !== null && !(state.claude.sample && state.claude.maxImages > 0);
  const canRun = state.files.length > 0 && !state.busy && !claudeMissing;
  const readLabel = IN_CLAUDE ? 'Leer con Claude' : state.apiKey ? 'Leer tabla DMX' : 'Añadir API key y leer';

  fill(step, 
    h('div', { class: 'step-head' },
      h('span', { class: 'step-num' }, '1'),
      h('h2', {}, 'Foto del manual'),
      h('span', { class: 'hint' }, IN_CLAUDE
        ? 'Fotografía solo la tabla, recta, con luz y sin reflejos. La lectura usa tu cuenta de Claude: la primera vez te pedirá permiso.'
        : 'Que se lean bien los números: foto recta, con luz y sin reflejos.'),
    ),
    drop,
    thumbs,
    h('div', { class: 'grid-2 mt' },
      h('label', { class: 'field' }, 'Fabricante (opcional)',
        h('input', {
          type: 'text', value: state.hintManufacturer, placeholder: 'Lo lee del manual si lo dejas vacío',
          oninput: (e: Event) => { state.hintManufacturer = (e.target as HTMLInputElement).value; },
        })),
      h('label', { class: 'field' }, 'Modelo (opcional)',
        h('input', {
          type: 'text', value: state.hintName, placeholder: 'Ej. Beam 230 7R',
          oninput: (e: Event) => { state.hintName = (e.target as HTMLInputElement).value; },
        })),
    ),
    h('div', { class: 'row mt' },
      h('button', { class: 'btn primary', type: 'button', disabled: !canRun, onclick: () => void runExtraction() }, readLabel),
      h('button', { class: 'btn ghost', type: 'button', disabled: state.busy, onclick: startManual }, 'Crear a mano'),
      h('button', { class: 'btn ghost', type: 'button', disabled: state.busy, onclick: loadDemo }, 'Ver un ejemplo'),
    ),
    state.busy
      ? h('div', { class: 'progress', role: 'status' },
          h('span', { class: 'faders', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
          h('span', { class: 'grow', id: 'progress-text' }, state.progress),
          h('button', { class: 'btn small', type: 'button', onclick: () => state.abort?.abort() }, 'Cancelar'),
        )
      : null,
    claudeMissing
      ? h('div', { class: 'callout mt' },
          'La lectura con IA funciona al abrir Canalia en claude.ai con tu cuenta. ',
          'Mientras tanto puedes crear el aparato a mano o ver el ejemplo.')
      : null,
    state.error ? h('div', { class: 'callout error mt', role: 'alert' }, state.error) : null,
  );
}

/** Ejecuta `action` y, si ya hay un aparato en revisión, pide confirmación antes. */
function guardReplace(action: () => void): void {
  if (!state.fixture || state.fixture.modes.length === 0) action();
  else askConfirm('Se perderá el aparato que estás revisando. ¿Continuar?', 'Continuar', action);
}

function startManual(): void {
  guardReplace(() => {
    const fx = emptyFixture();
    fx.manufacturer = state.hintManufacturer;
    fx.name = state.hintName;
    fx.modes = [{ name: '1CH', channels: [emptyChannel(1)] }];
    fx.modes[0].channels[0].attr = 'DIM';
    fx.modes[0].channels[0].label = 'Dimmer';
    setFixture(fx, []);
  });
}

function loadDemo(): void {
  guardReplace(() =>
    setFixture(demoFixture(), ['Esto es un ejemplo: así quedaría un cabeza móvil de 16 canales tras leer su manual.']),
  );
}

function setFixture(fx: Fixture, notes: string[]): void {
  state.fixture = fx;
  state.notes = notes;
  state.lastRun = null;
  state.activeMode = 0;
  state.openRanges.clear();
  state.previewMode = -1;
  state.exportMessage = '';
  persistDraft();
  renderAll();
  $('step-review').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
// Paso 2: revisión
// ---------------------------------------------------------------------------

/** Se llama tras cada edición que no cambia la estructura: guarda y refresca avisos y descargas. */
function changed(): void {
  persistDraft();
  renderIssues();
  renderExportStep();
}

function attributeSelect(ch: Channel): HTMLSelectElement {
  const select = h('select', {
    class: 'attr',
    'aria-label': 'Atributo de grandMA2',
    onchange: (e: Event) => {
      ch.attr = (e.target as HTMLSelectElement).value;
      changed();
    },
  });
  for (const group of ATTRIBUTE_GROUPS) {
    const og = h('optgroup', { label: group });
    for (const a of ATTRIBUTES.filter((x) => x.group === group)) {
      og.append(h('option', { value: a.key, selected: a.key === ch.attr }, `${a.label} · ${a.attribute}`));
    }
    select.append(og);
  }
  select.value = getAttribute(ch.attr).key;
  return select;
}

function numberInput(value: number | null, onChange: (v: string) => void, props: Props = {}): HTMLInputElement {
  return h('input', {
    type: 'number', inputmode: 'numeric', value: value === null ? '' : String(value),
    oninput: (e: Event) => onChange((e.target as HTMLInputElement).value),
    ...props,
  });
}

function rangesEditor(ch: Channel): HTMLElement {
  const list = h('div', { class: 'range-list' });
  const draw = () => {
    fill(list, 
      h('div', { class: 'range-head' }, h('span', {}, 'Desde'), h('span', {}, 'Hasta'), h('span', {}, 'Nombre (channel set)'), h('span')),
      ...ch.ranges.map((r, i) =>
        h('div', { class: 'range-item' },
          numberInput(r.from, (v) => { r.from = toInt(v, 0); changed(); refreshRangeButton(ch); }, { min: 0, max: 255, 'aria-label': 'Desde' }),
          numberInput(r.to, (v) => { r.to = toInt(v, 255); changed(); refreshRangeButton(ch); }, { min: 0, max: 255, 'aria-label': 'Hasta' }),
          h('input', {
            type: 'text', value: r.name, 'aria-label': 'Nombre del rango',
            oninput: (e: Event) => { r.name = (e.target as HTMLInputElement).value; changed(); },
          }),
          h('button', {
            class: 'icon-btn', type: 'button', 'aria-label': 'Quitar rango', title: 'Quitar rango',
            onclick: () => { ch.ranges.splice(i, 1); draw(); changed(); refreshRangeButton(ch); },
          }, '✕'),
        ),
      ),
      h('div', { class: 'row' },
        h('button', {
          class: 'btn small', type: 'button',
          onclick: () => {
            const last = ch.ranges[ch.ranges.length - 1];
            const from = last ? Math.min(255, last.to + 1) : 0;
            ch.ranges.push({ from, to: 255, name: '' });
            draw();
            changed();
            refreshRangeButton(ch);
          },
        }, '+ Añadir rango'),
      ),
    );
  };
  draw();
  return list;
}

const rangeButtons = new WeakMap<Channel, HTMLButtonElement>();

function rangeButtonLabel(ch: Channel): string {
  const open = state.openRanges.has(ch) ? '▴' : '▾';
  return ch.ranges.length ? `${ch.ranges.length} rango${ch.ranges.length === 1 ? '' : 's'} ${open}` : `Sin rangos ${open}`;
}

function refreshRangeButton(ch: Channel): void {
  const btn = rangeButtons.get(ch);
  if (!btn) return;
  btn.textContent = rangeButtonLabel(ch);
  btn.classList.toggle('has', ch.ranges.length > 0);
}

function channelRows(ch: Channel, modeIndex: number): HTMLTableRowElement[] {
  const fx = state.fixture!;
  const mode = fx.modes[modeIndex];
  const rangeBtn = h('button', {
    class: `btn small ranges-btn${ch.ranges.length ? ' has' : ''}`,
    type: 'button',
    onclick: () => {
      if (state.openRanges.has(ch)) state.openRanges.delete(ch);
      else state.openRanges.add(ch);
      renderReviewStep();
    },
  }, rangeButtonLabel(ch));
  rangeButtons.set(ch, rangeBtn);

  const row = h('tr', {},
    h('td', { class: 'dmx' }, numberInput(ch.number, (v) => { ch.number = toInt(v, ch.number); changed(); }, { class: 'num', min: 1, max: 512, 'aria-label': 'Canal DMX' })),
    h('td', {}, numberInput(ch.fine, (v) => { ch.fine = v.trim() === '' ? null : toInt(v, 0); changed(); }, { class: 'num', min: 1, max: 512, placeholder: '—', 'aria-label': 'Canal fine (16 bit)' })),
    h('td', {}, h('input', {
      type: 'text', value: ch.label, placeholder: 'Nombre', 'aria-label': 'Nombre del canal',
      oninput: (e: Event) => { ch.label = (e.target as HTMLInputElement).value; changed(); },
    })),
    h('td', {}, attributeSelect(ch)),
    h('td', {}, numberInput(ch.cell, (v) => { ch.cell = Math.max(0, toInt(v, 0)); changed(); }, { class: 'cell', min: 0, 'aria-label': 'Celda' })),
    h('td', {}, numberInput(ch.defaultValue, (v) => { ch.defaultValue = Math.min(255, Math.max(0, toInt(v, 0))); changed(); }, { class: 'def', min: 0, max: 255, 'aria-label': 'Valor por defecto' })),
    h('td', {}, rangeBtn),
    h('td', {}, h('button', {
      class: 'icon-btn', type: 'button', title: 'Quitar canal', 'aria-label': `Quitar canal ${ch.number}`,
      onclick: () => {
        mode.channels.splice(mode.channels.indexOf(ch), 1);
        state.openRanges.delete(ch);
        persistDraft();
        renderReviewStep();
        renderExportStep();
      },
    }, '✕')),
  );
  const rows = [row];
  if (state.openRanges.has(ch)) {
    rows.push(h('tr', { class: 'ranges-row' }, h('td', { colspan: '8' }, rangesEditor(ch))));
  }
  return rows;
}

function fixtureFields(fx: Fixture): HTMLElement {
  const text = (label: string, key: 'manufacturer' | 'name' | 'shortName', placeholder = '') =>
    h('label', { class: 'field' }, label,
      h('input', {
        type: 'text', value: fx[key], placeholder,
        oninput: (e: Event) => { fx[key] = (e.target as HTMLInputElement).value; changed(); },
      }));
  const numberField = (label: string, key: 'beamAngle' | 'panDegrees' | 'tiltDegrees') =>
    h('label', { class: 'field' }, label,
      numberInput(fx[key], (v) => { fx[key] = Math.max(0, toInt(v, fx[key])); changed(); }, { min: 0 }));
  const beam = h('select', {
    onchange: (e: Event) => { fx.beamType = (e.target as HTMLSelectElement).value as BeamType; changed(); },
  },
  h('option', { value: 'Wash', selected: fx.beamType === 'Wash' }, 'Wash'),
  h('option', { value: 'Spot', selected: fx.beamType === 'Spot' }, 'Spot'),
  h('option', { value: 'None', selected: fx.beamType === 'None' }, 'Sin haz'));

  return h('div', { class: 'grid-2' },
    text('Fabricante', 'manufacturer'),
    text('Nombre del aparato', 'name'),
    text('Nombre corto', 'shortName', 'Para la consola'),
    h('label', { class: 'field' }, 'Tipo de haz', beam),
    numberField('Ángulo del haz (°)', 'beamAngle'),
    numberField('Recorrido pan (°)', 'panDegrees'),
    numberField('Recorrido tilt (°)', 'tiltDegrees'),
  );
}

function renderIssues(): void {
  const box = document.getElementById('issues');
  const fx = state.fixture;
  if (!box || !fx) return;
  const mode = fx.modes[state.activeMode];
  const issues: Issue[] = mode ? validateMode(mode) : [];
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  fill(box, 
    errors.length
      ? h('div', { class: 'callout error' }, h('strong', {}, 'Hay que corregir antes de descargar:'),
          h('ul', {}, ...errors.map((e) => h('li', {}, e.message))))
      : null,
    warnings.length
      ? h('div', { class: 'callout warn' }, h('strong', {}, 'Revisa:'), h('ul', {}, ...warnings.map((w) => h('li', {}, w.message))))
      : null,
  );
}

function renderReviewStep(): void {
  const step = $('step-review');
  const fx = state.fixture;
  step.classList.toggle('disabled', !fx);
  const head = h('div', { class: 'step-head' },
    h('span', { class: 'step-num' }, '2'),
    h('h2', {}, 'Revisa los canales'),
    h('span', { class: 'hint' }, 'Compara con el manual. Los números DMX y los rangos son lo más importante.'),
  );
  if (!fx) {
    fill(step, head, h('p', { class: 'empty' }, 'Aquí aparecerán los canales cuando la IA lea la foto.'));
    return;
  }
  if (state.activeMode >= fx.modes.length) state.activeMode = Math.max(0, fx.modes.length - 1);
  const mode = fx.modes[state.activeMode];

  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    ...fx.modes.map((m, i) =>
      h('button', {
        class: `tab${i === state.activeMode ? ' active' : ''}`, type: 'button', role: 'tab',
        'aria-selected': String(i === state.activeMode),
        onclick: () => { state.activeMode = i; renderReviewStep(); },
      }, m.name || `Modo ${i + 1}`, h('span', { class: 'count' }, `${footprint(m)} ch`)),
    ),
    h('button', {
      class: 'btn small ghost', type: 'button',
      onclick: () => {
        fx.modes.push({ name: `Modo ${fx.modes.length + 1}`, channels: [emptyChannel(1)] });
        state.activeMode = fx.modes.length - 1;
        persistDraft();
        renderReviewStep();
        renderExportStep();
      },
    }, '+ Modo'),
  );

  let modeBody: HTMLElement;
  if (!mode) {
    modeBody = h('p', { class: 'empty' }, 'No hay modos. Añade uno con «+ Modo».');
  } else {
    const tbody = h('tbody');
    for (const ch of mode.channels) tbody.append(...channelRows(ch, state.activeMode));
    modeBody = h('div', {},
      h('div', { class: 'row' },
        h('label', { class: 'field', style: 'flex:1;min-width:180px' }, 'Nombre del modo',
          h('input', {
            type: 'text', value: mode.name,
            oninput: (e: Event) => {
              mode.name = (e.target as HTMLInputElement).value;
              const tab = step.querySelector('.tab.active');
              if (tab?.firstChild) tab.firstChild.textContent = mode.name || `Modo ${state.activeMode + 1}`;
              changed();
            },
          })),
        h('button', {
          class: 'btn small danger', type: 'button', style: 'align-self:flex-end',
          onclick: () =>
            askConfirm(`¿Borrar el modo «${mode.name || `Modo ${state.activeMode + 1}`}»?`, 'Borrar', () => {
              fx.modes.splice(state.activeMode, 1);
              state.activeMode = Math.max(0, state.activeMode - 1);
              persistDraft();
              renderReviewStep();
              renderExportStep();
            }),
        }, 'Borrar modo'),
      ),
      h('div', { class: 'table-wrap mt' },
        h('table', { class: 'channels' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'DMX'), h('th', {}, 'Fine'), h('th', {}, 'Nombre'), h('th', {}, 'Atributo grandMA2'),
            h('th', { title: '0 = canal general. 1, 2, 3… = píxeles o secciones repetidas' }, 'Celda'),
            h('th', {}, 'Defecto'), h('th', {}, 'Rangos'), h('th', {}),
          )),
          tbody,
        ),
      ),
      h('div', { class: 'row mt' },
        h('button', {
          class: 'btn small', type: 'button',
          onclick: () => {
            mode.channels.push(emptyChannel(footprint(mode) + 1));
            persistDraft();
            renderReviewStep();
            renderExportStep();
          },
        }, '+ Añadir canal'),
        h('button', {
          class: 'btn small ghost', type: 'button',
          onclick: () => {
            mode.channels.sort((a, b) => a.number - b.number);
            persistDraft();
            renderReviewStep();
          },
        }, 'Ordenar por DMX'),
      ),
    );
  }

  fill(step, 
    head,
    state.notes.length
      ? h('div', { class: 'callout warn' }, h('strong', {}, 'Notas de la lectura:'), h('ul', {}, ...state.notes.map((n) => h('li', {}, n))))
      : null,
    state.lastRun
      ? h('p', { class: 'usage' },
          `Lectura: ${state.lastRun.inputTokens.toLocaleString('es')} tokens de entrada, ` +
          `${state.lastRun.outputTokens.toLocaleString('es')} de salida · coste aprox. ${state.lastRun.costUsd.toFixed(2)} US$`)
      : null,
    h('div', { class: 'mt' }, fixtureFields(fx)),
    tabs,
    modeBody,
    h('div', { id: 'issues', class: 'mt' }),
  );
  renderIssues();
}

// ---------------------------------------------------------------------------
// Paso 3: descarga
// ---------------------------------------------------------------------------

function download(fileName: string, xml: string): void {
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  const a = h('a', { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

interface ReadyFile {
  fileName: string;
  xml: string;
}

/** En claude.ai las páginas no pueden guardar .xml: se entregan dentro de un ZIP. */
async function saveZip(files: ReadyFile[], zipName: string): Promise<void> {
  const downloads = state.claude?.downloads;
  if (!downloads) return;
  const zip = createZip(files.map((f) => ({ name: f.fileName, content: f.xml })));
  try {
    await downloads.save({ filename: zipName, data: new Blob([zip as BlobPart], { type: 'application/zip' }) });
    state.exportMessage = `Guardado ${zipName}. Descomprímelo y copia los XML en la librería de grandMA2.`;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    state.exportMessage =
      code === 'declined' ? ''
      : code === 'rate_limited' ? 'Ya hay una descarga pendiente de confirmar.'
      : 'No se ha podido guardar el archivo aquí. Usa «Copiar XML».';
  }
  renderExportStep();
}

async function copyXml(xml: string, index: number): Promise<void> {
  try {
    await navigator.clipboard.writeText(xml.replace(/^\uFEFF/, ''));
    state.exportMessage = 'XML copiado. Pégalo en un archivo .xml con el nombre que se muestra.';
    renderExportStep();
  } catch {
    // Sin portapapeles: se muestra el XML seleccionado para copiarlo a mano.
    state.previewMode = index;
    state.exportMessage = 'No se ha podido copiar solo. El XML está seleccionado: cópialo con Ctrl+C o Cmd+C.';
    renderExportStep();
    const pre = document.querySelector('#step-export pre.xml');
    if (pre) window.getSelection()?.selectAllChildren(pre);
  }
}

function zipNameFor(fx: Fixture, files: ReadyFile[]): string {
  if (files.length === 1) return files[0].fileName.replace(/\.xml$/, '.zip');
  const [maker, model] = files[0].fileName.split('@');
  return `${maker || 'canalia'}@${model || fx.name || 'fixture'}.zip`;
}

function renderExportStep(): void {
  const step = $('step-export');
  const fx = state.fixture;
  step.classList.toggle('disabled', !fx);
  const head = h('div', { class: 'step-head' },
    h('span', { class: 'step-num' }, '3'),
    h('h2', {}, 'Descargar para grandMA2'),
    h('span', { class: 'hint' }, IN_CLAUDE ? 'Un XML por modo DMX, dentro de un ZIP.' : 'Un archivo XML por modo DMX.'),
  );
  if (!fx || fx.modes.length === 0) {
    fill(step, head, h('p', { class: 'empty' }, 'Cuando revises los canales podrás descargar los archivos aquí.'));
    return;
  }

  const canSave = IN_CLAUDE ? Boolean(state.claude?.downloads) : true;
  const now = new Date();
  const ready: ReadyFile[] = [];
  const items = fx.modes.map((mode, i) => {
    let file: ReadyFile | null = null;
    let problem = '';
    try {
      file = generateFixtureXml(fx, mode, now);
      ready.push(file);
    } catch {
      problem = 'Tiene errores: corrígelos en el paso 2.';
    }
    const showing = state.previewMode === i && file;
    const saveButton = !file
      ? h('button', { class: 'btn small primary', type: 'button', disabled: true }, 'Descargar')
      : IN_CLAUDE && !canSave
        ? h('button', { class: 'btn small primary', type: 'button', onclick: () => void copyXml(file!.xml, i) }, 'Copiar XML')
        : h('button', {
            class: 'btn small primary', type: 'button',
            onclick: () => (IN_CLAUDE ? void saveZip([file!], zipNameFor(fx, [file!])) : download(file!.fileName, file!.xml)),
          }, IN_CLAUDE ? 'Descargar ZIP' : 'Descargar');
    return h('div', { class: 'download' },
      h('div', { class: 'file' }, file ? file.fileName : mode.name || `Modo ${i + 1}`,
        h('div', { class: 'meta' }, problem || `${mode.name} · ${footprint(mode)} canales DMX`)),
      h('button', {
        class: 'btn small ghost', type: 'button', disabled: !file,
        onclick: () => { state.previewMode = state.previewMode === i ? -1 : i; renderExportStep(); },
      }, showing ? 'Ocultar XML' : 'Ver XML'),
      IN_CLAUDE && canSave && file
        ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => void copyXml(file!.xml, i) }, 'Copiar')
        : null,
      saveButton,
      showing ? h('pre', { class: 'xml', tabindex: '0' }, file!.xml.replace(/^\uFEFF/, '')) : null,
    );
  });

  const all = ready.length > 1 && canSave
    ? h('div', { class: 'row mt' },
        h('button', {
          class: 'btn', type: 'button',
          onclick: () =>
            IN_CLAUDE
              ? void saveZip(ready, zipNameFor(fx, ready))
              : ready.forEach((f, i) => setTimeout(() => download(f.fileName, f.xml), i * 400)),
        }, IN_CLAUDE ? `Descargar los ${ready.length} modos (ZIP)` : `Descargar los ${ready.length} modos`))
    : null;

  fill(step,
    head,
    h('div', { class: 'downloads' }, ...items),
    all,
    state.exportMessage ? h('div', { class: 'callout mt', role: 'status' }, state.exportMessage) : null,
    h('div', { class: 'howto mt' },
      h('strong', {}, 'Cómo cargarlo en grandMA2'),
      h('ol', {},
        IN_CLAUDE ? h('li', {}, 'Descomprime el ZIP.') : null,
        h('li', {}, 'Copia el XML en un USB, en la carpeta ', h('code', {}, 'gma2/library'),
          '. En grandMA2 onPC, en ', h('code', {}, 'C:\\ProgramData\\MA Lighting Technologies\\grandma\\gma2_V_<versión>\\library'), '.'),
        h('li', {}, 'En la consola: Setup → Patch & Fixture Schedule → Add New Fixtures → Fixture Type → Import y elige el archivo en la librería de usuario.'),
        h('li', {}, 'Abre el fixture type en el Fixture Type Editor y comprueba canales, rangos y valores por defecto antes del show.'),
      ),
    ),
  );
}

function renderAll(): void {
  renderKeyChip();
  renderPhotoStep();
  renderReviewStep();
  renderExportStep();
}

shell();
renderAll();
if (IN_CLAUDE) {
  void connectClaude().then((runtime) => {
    state.claude = runtime;
    renderKeyChip();
    renderPhotoStep();
    renderExportStep();
  });
}
