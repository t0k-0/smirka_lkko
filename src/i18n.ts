import type { Language } from './types';

const messages = {
  en: {
    login: 'LOGIN',
    loggingIn: 'LOGGING IN...',
    connection: 'KLUBKO CONNECTION',
    credentials: 'CREDENTIALS',
    mode: 'MODE',
    proxy: 'PROXY',
    user: 'USER',
    pass: 'PASS',
    production: 'PRODUCTION',
    test: 'TEST',
    language: 'LANGUAGE',
    pdfTitle: 'Flight Record',
    date: 'Date',
    airfield: 'Airfield',
    filter: 'Filter active',
    flights: 'Flights logged',
    takeoffs: 'Total take-offs',
    totalTime: 'Total flight time',
    generated: 'Generated',
    role: 'ROLE',
    duration: 'DURATION',
    note: 'NOTE',
    towplane: 'Towplane',
    glider: 'Glider',
    motorized: 'Motorized',
    pushToKlubko: 'PUSH TO KLUBKO',
    pushAll: 'PUSH ALL',
    cancel: 'CANCEL'
  },
  cs: {
    login: 'PŘIHLÁSIT',
    loggingIn: 'PŘIHLAŠOVÁNÍ...',
    connection: 'SPOJENÍ KLUBKO',
    credentials: 'PŘIHLAŠOVACÍ ÚDAJE',
    mode: 'REŽIM',
    proxy: 'PROXY',
    user: 'UŽIVATELSKÉ JMÉNO',
    pass: 'HESLO',
    production: 'PROVOZ',
    test: 'TEST',
    language: 'JAZYK',
    pdfTitle: 'Letový záznam',
    date: 'Datum',
    airfield: 'Letiště',
    filter: 'Aktivní filtr',
    flights: 'Zapsané lety',
    takeoffs: 'Celkem vzletů',
    totalTime: 'Celkový čas letu',
    generated: 'Vygenerováno',
    role: 'ROLE',
    duration: 'TRVÁNÍ',
    note: 'POZNÁMKA',
    towplane: 'Vlečná',
    glider: 'Větroň',
    motorized: 'Motorové',
    pushToKlubko: 'ODESLAT DO KLUBKA',
    pushAll: 'ODESLAT VŠE',
    cancel: 'ZRUŠIT'
  }
} as const;

export type MessageKey = keyof (typeof messages)['en'];

export function translate(language: Language, key: MessageKey): string {
  return messages[language][key] || messages.en[key] || key;
}
