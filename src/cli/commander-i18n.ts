import { Help, type Argument, type Command, type Option } from 'commander';
import { defineMessages } from '../core/i18n.js';

/**
 * Teks bawaan commander (judul bantuan, opsi -h/--help, perintah help, -v/--version, pesan error
 * penguraian argumen) dalam bahasa CLI. Versi Inggris sama dengan teks asli commander.
 */
export const t = defineMessages({
  id: {
    usage: 'Penggunaan:',
    options: 'Opsi:',
    globalOptions: 'Opsi Global:',
    commands: 'Perintah:',
    arguments: 'Argumen:',
    helpDesc: 'tampilkan bantuan perintah',
    versionDesc: 'tampilkan nomor versi',
    default: 'default',
    choices: 'pilihan',
    preset: 'preset',
    env: 'env',
    unknownOption: "error: opsi tidak dikenal '{flag}'",
    unknownCommand: "error: perintah tidak dikenal '{name}'",
    missingArgument: "error: argumen wajib '{name}' belum diisi",
    optionArgumentMissing: "error: nilai untuk opsi '{flag}' belum diisi",
    requiredOption: "error: opsi wajib '{flag}' belum diisi",
    invalidOptionArgument: "error: nilai '{value}' untuk opsi '{flag}' tidak valid.",
    invalidOptionEnv: "error: nilai '{value}' untuk opsi '{flag}' dari env '{env}' tidak valid.",
    invalidCommandArgument: "error: nilai '{value}' untuk argumen '{name}' tidak valid.",
    tooManyArguments: 'error: argumen terlalu banyak{forCommand}. Seharusnya {expected} argumen, diberikan {received}: {details}.',
    tooManyForCommand: " untuk '{name}'",
    conflicting: 'error: {a} tidak bisa dipakai bersama {b}',
    didYouMean: '(Maksud Anda {names}?)',
    didYouMeanOneOf: '(Maksud Anda salah satu dari {names}?)',
  },
  en: {
    usage: 'Usage:',
    options: 'Options:',
    globalOptions: 'Global Options:',
    commands: 'Commands:',
    arguments: 'Arguments:',
    helpDesc: 'display help for command',
    versionDesc: 'output the version number',
    default: 'default',
    choices: 'choices',
    preset: 'preset',
    env: 'env',
    unknownOption: "error: unknown option '{flag}'",
    unknownCommand: "error: unknown command '{name}'",
    missingArgument: "error: missing required argument '{name}'",
    optionArgumentMissing: "error: option '{flag}' argument missing",
    requiredOption: "error: required option '{flag}' not specified",
    invalidOptionArgument: "error: option '{flag}' argument '{value}' is invalid.",
    invalidOptionEnv: "error: option '{flag}' value '{value}' from env '{env}' is invalid.",
    invalidCommandArgument: "error: command-argument value '{value}' is invalid for argument '{name}'.",
    tooManyArguments: (p) =>
      `error: too many arguments${p.forCommand ?? ''}. Expected ${p.expected} argument${p.expected === 1 ? '' : 's'} but got ${p.received}: ${p.details}.`,
    tooManyForCommand: " for '{name}'",
    conflicting: 'error: {a} cannot be used with {b}',
    didYouMean: '(Did you mean {names}?)',
    didYouMeanOneOf: '(Did you mean one of {names}?)',
  },
});

const TITLES: Record<string, Parameters<typeof t>[0]> = {
  'Usage:': 'usage',
  'Options:': 'options',
  'Global Options:': 'globalOptions',
  'Commands:': 'commands',
  'Arguments:': 'arguments',
};

/** Ganti label "(default: …, choices: …)" di akhir deskripsi opsi/argumen. */
function localizeExtra(full: string, description: string): string {
  if (full === description) return full;
  const head = full.startsWith(description) ? description : '';
  const extra = full
    .slice(head.length)
    .replace(/(\(|, )(default|choices|preset|env): /g, (_m, pre: string, label: 'default' | 'choices' | 'preset' | 'env') => `${pre}${t(label)}: `);
  return head + extra;
}

/** Terjemahkan satu pesan error commander (teks asli Inggris); teks yang tidak dikenal dibiarkan. */
export function translateCommanderError(str: string): string {
  const rules: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^error: unknown option '(.+?)'/, (m) => t('unknownOption', { flag: m[1] })],
    [/^error: unknown command '(.+?)'/, (m) => t('unknownCommand', { name: m[1] })],
    [/^error: missing required argument '(.+?)'/, (m) => t('missingArgument', { name: m[1] })],
    [/^error: option '(.+?)' argument missing/, (m) => t('optionArgumentMissing', { flag: m[1] })],
    [/^error: required option '(.+?)' not specified/, (m) => t('requiredOption', { flag: m[1] })],
    [/^error: option '(.+?)' argument '(.*?)' is invalid\./, (m) => t('invalidOptionArgument', { flag: m[1], value: m[2] })],
    [/^error: option '(.+?)' value '(.*?)' from env '(.+?)' is invalid\./, (m) => t('invalidOptionEnv', { flag: m[1], value: m[2], env: m[3] })],
    [/^error: command-argument value '(.*?)' is invalid for argument '(.+?)'\./, (m) => t('invalidCommandArgument', { value: m[1], name: m[2] })],
    [
      /^error: too many arguments(?: for '(.+?)')?\. Expected (\d+) arguments? but got (\d+): (.*)\.$/m,
      (m) =>
        t('tooManyArguments', {
          forCommand: m[1] ? t('tooManyForCommand', { name: m[1] }) : '',
          expected: Number(m[2]),
          received: Number(m[3]),
          details: m[4],
        }),
    ],
    [/^error: (.+?) cannot be used with (.+)$/m, (m) => t('conflicting', { a: m[1], b: m[2] })],
    [/\(Did you mean one of (.+)\?\)/, (m) => t('didYouMeanOneOf', { names: m[1] })],
    [/\(Did you mean (.+)\?\)/, (m) => t('didYouMean', { names: m[1] })],
  ];
  let out = str;
  for (const [re, fn] of rules) {
    const m = out.match(re);
    if (m) out = out.replace(m[0], fn(m));
  }
  return out;
}

/**
 * Pasang teks bawaan commander dalam bahasa aktif. Panggil pada program sebelum subperintah dibuat,
 * karena subperintah mewarisi pengaturan bantuan, opsi help, perintah help, dan output dari induknya.
 */
export function localizeCommander(program: Command): Command {
  return program
    .helpOption('-h, --help', t('helpDesc'))
    .helpCommand('help [command]', t('helpDesc'))
    .configureHelp({
      styleTitle(str: string): string {
        const key = TITLES[str];
        return key ? t(key) : str;
      },
      optionDescription(this: Help, option: Option): string {
        return localizeExtra(Help.prototype.optionDescription.call(this, option), option.description ?? '');
      },
      argumentDescription(this: Help, argument: Argument): string {
        return localizeExtra(Help.prototype.argumentDescription.call(this, argument), argument.description ?? '');
      },
    })
    .configureOutput({
      outputError: (str, write) => write(translateCommanderError(str)),
    });
}
