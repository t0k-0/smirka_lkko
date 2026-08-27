import { jsPDF } from 'jspdf';
import type { Language, LogEntry } from './types';
import { sortLog } from './domain';
import { localDateISO, localTime, pad2, timeToMinutes } from './time';
import { translate } from './i18n';

let fontPromise: Promise<string> | undefined;
let logoPngPromise: Promise<string> | undefined;

export const PDF_LOGO_ASSET = 'icon_lightmode.svg';

export const PDF_TABLE_HEADERS = [
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
] as const;

const PDF_COLUMN_WIDTHS = [15, 15, 53, 13, 12, 16, 26, 13, 9, 18] as const;
const PDF_COLUMN_LIMITS = [12, 12, 34, 10, 5, 5, 12, 4, 6, 14] as const;
const PDF_COLUMN_ALIGNMENTS = [
  'left',
  'left',
  'left',
  'left',
  'center',
  'center',
  'right',
  'right',
  'center',
  'left'
] as const;

export function pdfTableRow(
  entry: LogEntry,
  launchLabel = `${entry.fn === 'motorized' ? 'M' : 'A'}${entry.num}`
): string[] {
  return [
    entry.acType,
    entry.reg,
    entry.pilots.filter(Boolean).join(', ') || '-',
    entry.task || '',
    entry.toTime || '-',
    entry.ldgTime || '-',
    entry.dur || '-',
    String(entry.starts ?? 1),
    launchLabel,
    entry.note || ''
  ];
}

export function pdfTableRows(entries: LogEntry[]): string[][] {
  const counters: Record<'A' | 'M', number> = { A: 0, M: 0 };
  const launchNumbers = new Map<string, number>();
  return entries.map((entry) => {
    const prefix: 'A' | 'M' = entry.fn === 'motorized' ? 'M' : 'A';
    const launchKey = `${prefix}:${entry.pair || entry.num}`;
    let number = launchNumbers.get(launchKey);
    if (number === undefined) {
      number = ++counters[prefix];
      launchNumbers.set(launchKey, number);
    }
    return pdfTableRow(entry, `${prefix}${number}`);
  });
}

async function loadFont(doc: jsPDF): Promise<void> {
  fontPromise ??= fetch(
    'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf'
  )
    .then((response) => {
      if (!response.ok) throw new Error('Could not load Unicode PDF font');
      return response.arrayBuffer();
    })
    .then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    });
  doc.addFileToVFS('NotoSans-Regular.ttf', await fontPromise);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.setFont('NotoSans', 'normal');
}

function svgToTransparentPng(svg: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(
      new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    );
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create PDF logo canvas');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not render PDF logo'));
    };
    image.src = url;
  });
}

async function loadLogoPng(): Promise<string> {
  logoPngPromise ??= fetch(`${import.meta.env.BASE_URL}${PDF_LOGO_ASSET}`)
    .then((response) => {
      if (!response.ok) throw new Error('Could not load PDF logo');
      return response.text();
    })
    .then(svgToTransparentPng);
  return logoPngPromise;
}

export async function exportFlightLog(
  entriesInput: LogEntry[],
  language: Language,
  airport: string,
  filterLabel = '',
  exportDate = localDateISO()
): Promise<void> {
  const entries = sortLog(entriesInput);
  const tableRows = pdfTableRows(entries);
  const date = exportDate;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await loadFont(doc);
  const totalMinutes = entries.reduce((sum, entry) => sum + timeToMinutes(entry.dur), 0);
  const takeoffs = new Set(entries.map((entry) => entry.num)).size;
  let y = 15;
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.18);
  doc.setFontSize(13);
  doc.text('Letový záznam - EXPORT', 10, y);
  try {
    doc.addImage(await loadLogoPng(), 'PNG', 183, 5, 17, 17, 'smirka-logo', 'FAST');
  } catch {
    // The export remains usable if the optional logo asset cannot be loaded.
  }
  y += 6;
  doc.setFontSize(8);
  doc.text(`${translate(language, 'date')}: ${date}`, 10, y);
  doc.text(`${translate(language, 'airfield')}: ${airport}`, 65, y);
  if (filterLabel) doc.text(`${translate(language, 'filter')}: ${filterLabel}`, 125, y);
  y += 8;
  const tableX = 10;
  const tableWidth = PDF_COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);
  const rowHeight = 6;
  const drawHeader = () => {
    const top = y - 4;
    const bottom = y + 3;
    doc.setFillColor(248, 248, 248);
    doc.rect(tableX, top, tableWidth, 7, 'F');
    doc.setDrawColor(115, 115, 115);
    doc.setLineWidth(0.22);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(6.2);
    let x = tableX;
    PDF_TABLE_HEADERS.forEach((header, index) => {
      const width = PDF_COLUMN_WIDTHS[index]!;
      doc.text(header, x + width / 2, y, { align: 'center' });
      doc.line(x, top, x, bottom);
      x += width;
    });
    doc.line(x, top, x, bottom);
    doc.line(tableX, top, tableX + tableWidth, top);
    doc.line(tableX, bottom, tableX + tableWidth, bottom);
    y += 7;
  };
  doc.setFillColor(244, 244, 244);
  doc.rect(tableX, y - 4, tableWidth, 6, 'F');
  doc.setDrawColor(105, 105, 105);
  doc.setLineWidth(0.25);
  doc.setFontSize(8);
  doc.text(date, tableX + tableWidth / 2, y, { align: 'center' });
  doc.rect(tableX, y - 4, tableWidth, 6);
  y += 6;
  drawHeader();
  doc.setFontSize(6.8);
  entries.forEach((entry, entryIndex) => {
    if (y > 274) {
      doc.addPage();
      y = 16;
      drawHeader();
      doc.setFontSize(6.8);
    }
    const top = y - 4;
    const bottom = y + 2;
    const values = tableRows[entryIndex]!;
    doc.setDrawColor(165, 165, 165);
    doc.setLineWidth(0.14);
    let x = tableX;
    values.forEach((value, valueIndex) => {
      const width = PDF_COLUMN_WIDTHS[valueIndex]!;
      const alignment = PDF_COLUMN_ALIGNMENTS[valueIndex]!;
      const text = String(value).slice(0, PDF_COLUMN_LIMITS[valueIndex]);
      const textX =
        alignment === 'center'
          ? x + width / 2
          : alignment === 'right'
            ? x + width - 1
            : x + 1;
      doc.text(text, textX, y, { align: alignment });
      doc.line(x, top, x, bottom);
      x += width;
    });
    doc.line(x, top, x, bottom);
    doc.line(tableX, bottom, tableX + tableWidth, bottom);
    y += rowHeight;
  });
  y += 5;
  doc.setFontSize(8);
  doc.text(`${translate(language, 'flights')}: ${entries.length}`, 10, y);
  doc.text(`${translate(language, 'takeoffs')}: ${takeoffs}`, 70, y);
  doc.text(
    `${translate(language, 'totalTime')}: ${pad2(Math.floor(totalMinutes / 60))}:${pad2(
      totalMinutes % 60
    )}`,
    135,
    y
  );
  doc.setFontSize(6);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `${translate(language, 'generated')} ${date} ${localTime()} - Smirka Mobile`,
    10,
    287
  );
  doc.save(`smirka-flight-log-${date}.pdf`);
}
