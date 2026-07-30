import { jsPDF } from 'jspdf';
import type { Language, LogEntry } from './types';
import { sortLog } from './domain';
import { localDateISO, localTime, pad2, timeToMinutes } from './time';
import { translate } from './i18n';

let fontPromise: Promise<string> | undefined;

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
  const role = {
    tow: translate(language, 'towplane'),
    glider: translate(language, 'glider'),
    motorized: translate(language, 'motorized')
  };
  let y = 18;
  doc.setFontSize(16);
  doc.text(`SMIRKA MOBILE - ${translate(language, 'pdfTitle')}`, 10, y);
  y += 8;
  doc.setFontSize(9);
  doc.text(`${translate(language, 'date')}: ${date}`, 10, y);
  y += 5;
  doc.text(`${translate(language, 'airfield')}: ${airport}`, 10, y);
  y += 5;
  if (filterLabel) {
    doc.text(`${translate(language, 'filter')}: ${filterLabel}`, 10, y);
    y += 5;
  }
  y += 3;
  const headers = [
    '#',
    'AC TYPE',
    'REG',
    translate(language, 'role'),
    'PILOT 1',
    'PILOT 2',
    'T/O',
    'LDG',
    translate(language, 'duration'),
    translate(language, 'note')
  ];
  const widths = [8, 22, 20, 18, 30, 30, 15, 15, 20, 28];
  const drawHeader = () => {
    doc.setFillColor(17, 17, 17);
    doc.rect(10, y - 4, 186, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6.5);
    let x = 10;
    headers.forEach((header, index) => {
      doc.text(header, x + 1, y);
      x += widths[index]!;
    });
    doc.setTextColor(0, 0, 0);
    y += 7;
  };
  drawHeader();
  doc.setFontSize(7.5);
  entries.forEach((entry, index) => {
    if (y > 275) {
      doc.addPage();
      y = 18;
      drawHeader();
    }
    if (index % 2 === 0) {
      doc.setFillColor(242, 242, 242);
      doc.rect(10, y - 4, 186, 6, 'F');
    }
    const values = [
      entry.num,
      entry.acType,
      entry.reg,
      role[entry.fn],
      entry.pilots[0] || '-',
      entry.pilots[1] || '',
      entry.toTime || '-',
      entry.ldgTime || '-',
      entry.dur || '-',
      entry.note || ''
    ];
    let x = 10;
    values.forEach((value, valueIndex) => {
      doc.text(String(value).slice(0, 22), x + 1, y);
      x += widths[valueIndex]!;
    });
    y += 6;
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
  doc.setTextColor(120, 120, 120);
  doc.text(
    `${translate(language, 'generated')} ${date} ${localTime()} - Smirka Mobile`,
    10,
    287
  );
  doc.save(`smirka-flight-log-${date}.pdf`);
}
