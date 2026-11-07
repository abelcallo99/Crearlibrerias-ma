import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, createZip } from './zip';

describe('createZip', () => {
  it('calcula el CRC32 estándar', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('crea un ZIP que se abre con un lector estándar', () => {
    const zip = createZip([
      { name: 'acme@beam_230@16ch.xml', content: '﻿<?xml version="1.0"?><MA>ñ</MA>\n' },
      { name: 'acme@beam_230@20ch.xml', content: '<MA />' },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'canalia-zip-'));
    const file = join(dir, 'test.zip');
    writeFileSync(file, zip);
    const script = [
      'import sys, zipfile',
      'z = zipfile.ZipFile(sys.argv[1])',
      'assert z.testzip() is None',
      'print("|".join(z.namelist()))',
      'print(z.read(z.namelist()[0]).decode("utf-8-sig"))',
    ].join('\n');
    const out = execFileSync('python3', ['-I', '-c', script, file], { encoding: 'utf8' });
    expect(out).toContain('acme@beam_230@16ch.xml|acme@beam_230@20ch.xml');
    expect(out).toContain('<MA>ñ</MA>');
  });
});
