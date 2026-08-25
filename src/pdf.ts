import { jsPDF } from 'jspdf';
import type { Language, LogEntry } from './types';
import { sortLog } from './domain';
import { localDateISO, localTime, pad2, timeToMinutes } from './time';
import { translate } from './i18n';

let fontPromise: Promise<string> | undefined;
let logoPromise: Promise<string> | undefined;

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

async function loadLogo(): Promise<string> {
  logoPromise ??= fetch(`${import.meta.env.BASE_URL}icon_lightmode.svg`).then((response) => {
    if (!response.ok) throw new Error('Could not load PDF logo');
    return response.text();
  });
  return logoPromise;
}

export async function exportFlightLog(
  entriesInput: LogEntry[],
  language: Language,
  airport: string,
  filterLabel = ''
): Promise<void> {
  const entries = sortLog(entriesInput);
  const date = localDateISO();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await loadFont(doc);
  const totalMinutes = entries.reduce((sum, entry) => sum + timeToMinutes(entry.dur), 0);
  const takeoffs = new Set(entries.map((entry) => entry.num)).size;
  let y = 16;
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.25);
  doc.setFontSize(13);
  doc.text('Letový záznam - EXPORT', 10, y);
  try {
    doc.addSvgAsImage(await loadLogo(), 178, 7, 18, 18);
  } catch {
    // The export remains usable if the optional logo asset cannot be loaded.
  }
  y += 6;
  doc.setFontSize(8);
  doc.text(`${translate(language, 'date')}: ${date}`, 10, y);
  doc.text(`${translate(language, 'airfield')}: ${airport}`, 65, y);
  if (filterLabel) doc.text(`${translate(language, 'filter')}: ${filterLabel}`, 125, y);
  y += 7;
  const headers = ['Typ', 'Ev.č.', 'Posádka', 'Vzlet', 'Přistání', 'Trvání', 'Pč.', 'Poznámka'];
  const widths = [22, 22, 65, 20, 20, 18, 13, 10];
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  const rowHeight = 6;
  const drawHeader = () => {
    doc.setFillColor(235, 235, 235);
    doc.rect(10, y - 4, tableWidth, 7, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(6.5);
    let x = 10;
    headers.forEach((header, index) => {
      doc.text(header, x + 1, y);
      doc.line(x, y - 4, x, y + 3);
      x += widths[index]!;
    });
    doc.line(x, y - 4, x, y + 3);
    doc.line(10, y - 4, 10 + tableWidth, y - 4);
    doc.line(10, y + 3, 10 + tableWidth, y + 3);
    y += 7;
  };
  doc.setFillColor(225, 225, 225);
  doc.rect(10, y - 4, tableWidth, 6, 'F');
  doc.setFontSize(8);
  doc.text(date, 10 + tableWidth / 2, y, { align: 'center' });
  doc.line(10, y - 4, 10 + tableWidth, y - 4);
  doc.line(10, y + 2, 10 + tableWidth, y + 2);
  y += 6;
  drawHeader();
  doc.setFontSize(7.5);
  entries.forEach((entry, index) => {
    if (y > 275) {
      doc.addPage();
      y = 16;
      drawHeader();
    }
    doc.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 248 : 255);
    doc.rect(10, y - 4, tableWidth, rowHeight, 'F');
    const values = [
      entry.acType,
      entry.reg,
      entry.pilots.filter(Boolean).join(', ') || '-',
      entry.toTime || '-',
      entry.ldgTime || '-',
      entry.dur || '-',
      `${entry.fn === 'motorized' ? 'M' : 'A'}${entry.num}`,
      entry.note || ''
    ];
    let x = 10;
    values.forEach((value, valueIndex) => {
      doc.text(String(value).slice(0, 22), x + 1, y);
      doc.line(x, y - 4, x, y + 2);
      x += widths[valueIndex]!;
    });
    doc.line(x, y - 4, x, y + 2);
    doc.line(10, y + 2, 10 + tableWidth, y + 2);
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
