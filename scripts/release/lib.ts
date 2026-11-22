/**
 * Pure helpers for the "Release plugins" workflow. Kept free of I/O so they are
 * unit-tested (`lib.test.ts`); `cli.ts` wires them to the runner.
 */
import { createHash } from 'node:crypto';

const TAG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SDK_REV = /^tiktools-plugin-sdk\s*=.*\brev\s*=\s*"([0-9a-f]{40})"/m;

export function validateTag(tag: string): string {
  if (!TAG.test(tag)) {
    throw new Error(`Invalid tag '${tag}' (letters, digits, '.', '_' and '-' only)`);
  }
  return tag;
}

/** The explicit ref when given, otherwise the TikTools rev pinned in Cargo.toml. */
export function resolveTikToolsRef(cargoToml: string, requested: string): string {
  const explicit = requested.replace(/\s+/g, '');
  const ref = explicit || SDK_REV.exec(cargoToml)?.[1] || '';
  if (!ref) throw new Error('Could not read the TikTools rev from Cargo.toml; pass tiktools_ref');
  if (!REF.test(ref) || ref.includes('..')) throw new Error(`Invalid tiktools_ref '${ref}'`);
  return ref;
}

/** Comma-separated plugin names to packager arguments; empty selects all. */
export function pluginArgs(input: string): string[] {
  const names = input.split(',').map((name) => name.trim()).filter(Boolean);
  for (const name of names) {
    if (!PLUGIN_NAME.test(name)) throw new Error(`Invalid plugin name '${name}'`);
  }
  return names.length === 0 ? ['--all'] : names.flatMap((name) => ['--plugin', name]);
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export type ReleaseFile = { name: string; size: number; sha256: string };

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** `sha256sum`-compatible listing, sorted by file name. */
export function renderChecksums(files: ReleaseFile[]): string {
  return [...files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((file) => `${file.sha256}  ${file.name}`)
    .join('\n') + '\n';
}

export function renderNotes(files: ReleaseFile[], commit: string, tiktoolsRef: string): string {
  const rows = [...files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((file) => `| \`${file.name}\` | ${humanSize(file.size)} |`);
  return [
    `TikTools plugin archives built from \`${commit.slice(0, 7)}\` with TikTools \`${tiktoolsRef.slice(0, 12)}\`.`,
    '',
    'Archives are named `<plugin-id>-<version>-<target>.plugin`; pick the one matching your OS',
    '(`linux-x64-gnu` or `win32-x64-msvc`). Declarative plugins (`<plugin-id>-<version>.plugin`)',
    'work on every platform. Verify downloads with `SHA256SUMS.txt`.',
    '',
    '| Archive | Size |',
    '| --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

export function releaseCreateArgs(options: {
  repository: string;
  tag: string;
  title: string;
  commit: string;
  notesFile: string;
  prerelease: boolean;
  draft: boolean;
  files: string[];
}): string[] {
  return [
    'release',
    'create',
    options.tag,
    '--repo',
    options.repository,
    '--target',
    options.commit,
    '--title',
    options.title || options.tag,
    '--notes-file',
    options.notesFile,
    ...(options.prerelease ? ['--prerelease'] : []),
    ...(options.draft ? ['--draft'] : []),
    ...options.files,
  ];
}
