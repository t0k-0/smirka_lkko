import { describe, expect, it } from 'vitest';
import {
  PDF_LOGO_ASSET,
  PDF_TABLE_HEADERS,
  pdfTableRow,
  pdfTableRows
} from '../src/pdf';
import type { LogEntry } from '../src/types';

describe('PDF flight table', () => {
  it('uses only the black light-mode logo asset', () => {
    expect(PDF_LOGO_ASSET).toBe('icon_lightmode.svg');
  });

  it('uses the reference column order and maps every flight field accordingly', () => {
    const entry: LogEntry = {
      id: 'flight-1',
      num: 7,
      toTime: '09:52',
      fn: 'glider',
      reg: '5036',
      acType: 'L-13',
      pilots: ['Červený Ondřej', 'Richter Michal'],
      ldgTime: '09:58',
      dur: '00:06',
      note: 'Kontrola',
      pair: 'pair-1',
      starts: 1,
      task: 'Okruh'
    };

    expect(PDF_TABLE_HEADERS).toEqual([
      'Typ',
      'Ev.č.',
      'Posádka',
      'Úloha',
      'Vzlet',
      'Přistání',
      'Trvání',
      'Starty',
      'Pč.',
      'Poznámka'
    ]);
    expect(pdfTableRow(entry)).toEqual([
      'L-13',
      '5036',
      'Červený Ondřej, Richter Michal',
      'Okruh',
      '09:52',
      '09:58',
      '00:06',
      '1',
      'A7',
      'Kontrola'
    ]);
  });

  it('numbers A and M launches independently while sharing an aerotow pair number', () => {
    const entry = (
      id: string,
      num: number,
      fn: LogEntry['fn'],
      pair: string | null
    ): LogEntry => ({
      id,
      num,
      fn,
      pair,
      toTime: '10:00',
      reg: id,
      acType: 'TYPE',
      pilots: ['Pilot'],
      ldgTime: '10:10',
      dur: '00:10',
      note: ''
    });

    const rows = pdfTableRows([
      entry('tow-1', 1, 'tow', 'pair-1'),
      entry('glider-1', 1, 'glider', 'pair-1'),
      entry('motor-1', 2, 'motorized', null),
      entry('tow-2', 3, 'tow', 'pair-2'),
      entry('glider-2', 3, 'glider', 'pair-2'),
      entry('motor-2', 4, 'motorized', null)
    ]);

    expect(rows.map((row) => row[8])).toEqual([
      'A1',
      'A1',
      'M1',
      'A2',
      'A2',
      'M2'
    ]);
  });
});
