import { describe, expect, it } from 'vitest';
import { extractFixture, MODEL } from './extract';
import type { SourceFile } from './image';

const photo: SourceFile = {
  id: 'f1', name: 'manual.jpg', kind: 'image', mediaType: 'image/jpeg', data: 'AAAA', blob: new Blob(['x']), previewUrl: null, bytes: 3,
};

const answer = {
  manufacturer: 'Acme',
  name: 'Spot 100',
  shortName: 'Spot100',
  beamType: 'Spot',
  beamAngle: 14,
  panDegrees: 540,
  tiltDegrees: 270,
  modes: [
    {
      name: '',
      channels: [
        { number: 3, fine: null, label: 'Dimmer', attr: 'DIM', cell: 0, defaultValue: 0, ranges: [] },
        { number: 1, fine: 2, label: 'Pan', attr: 'PAN', cell: 0, defaultValue: 128, ranges: [] },
        { number: 4, fine: null, label: 'Color', attr: 'NOT_A_KEY', cell: 0, defaultValue: 400,
          ranges: [{ from: 20, to: 10, name: ' Red ' }, { from: 0, to: 9, name: 'White' }] },
      ],
    },
    { name: 'Vacío', channels: [] },
  ],
  notes: ['El canal 4 está borroso.', ' '],
};

function sse(events: Array<[string, unknown]>): Response {
  const body = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' } });
}

function streamFor(text: string, stopReason = 'end_turn'): Response {
  const half = Math.floor(text.length / 2);
  return sse([
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: MODEL, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 2000, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: text.slice(0, half) } }],
    ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: text.slice(half) } }],
    ['content_block_stop', { type: 'content_block_stop', index: 1 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 1000 } }],
    ['message_stop', { type: 'message_stop' }],
  ]);
}

describe('extractFixture', () => {
  it('envía la foto con salida estructurada y normaliza la respuesta', async () => {
    let request: { url: string; headers: Headers; body: any } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      request = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) };
      return streamFor(JSON.stringify(answer));
    }) as unknown as typeof fetch;

    const stages: string[] = [];
    const result = await extractFixture({
      apiKey: 'sk-test', files: [photo], name: 'Mi Spot', fetch: fakeFetch,
      onProgress: (s) => stages.push(s),
    });

    // Petición
    expect(request!.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/);
    expect(request!.headers.get('authorization')).toBe('Bearer sk-test');
    expect(request!.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(request!.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    const body = request!.body;
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.stream).toBe(true);
    expect(body.fallbacks).toBe('default');
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config.effort).toBe('high');
    expect(body.output_config.format.type).toBe('json_schema');
    const schemaText = JSON.stringify(body.output_config.format.schema);
    for (const unsupported of ['minimum', 'maximum', 'minLength', 'maxLength', 'exclusiveMinimum']) {
      expect(schemaText).not.toContain(`"${unsupported}"`);
    }
    expect(body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
    expect(body.messages[0].content[1].text).toContain('Fixture name (from the user): Mi Spot');

    // Resultado
    expect(stages).toContain('thinking');
    expect(stages).toContain('writing');
    const fx = result.fixture;
    expect(fx.name).toBe('Mi Spot');
    expect(fx.manufacturer).toBe('Acme');
    expect(fx.modes).toHaveLength(1);
    const mode = fx.modes[0];
    expect(mode.name).toBe('3CH');
    expect(mode.channels.map((c) => c.number)).toEqual([1, 3, 4]);
    const color = mode.channels[2];
    expect(color.attr).toBe('NOFUNCTION');
    expect(color.defaultValue).toBe(255);
    expect(color.ranges).toEqual([{ from: 0, to: 9, name: 'White' }, { from: 10, to: 20, name: 'Red' }]);
    expect(result.notes).toEqual(['El canal 4 está borroso.']);
    expect(result.usage!.inputTokens).toBe(2000);
    expect(result.usage!.outputTokens).toBe(1000);
    expect(result.usage!.costUsd).toBeCloseTo(0.028, 5);
  });

  it('avisa cuando la respuesta se corta por longitud', async () => {
    const fakeFetch = (async () => streamFor('{"manufacturer": "Ac', 'max_tokens')) as unknown as typeof fetch;
    await expect(extractFixture({ apiKey: 'k', files: [photo], fetch: fakeFetch })).rejects.toThrow(/demasiado larga|formato/);
  });

  it('traduce un error de API key', async () => {
    const fakeFetch = (async () => new Response(
      JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch;
    await expect(extractFixture({ apiKey: 'k', files: [photo], fetch: fakeFetch })).rejects.toThrow('La API key no es válida');
  });
});
