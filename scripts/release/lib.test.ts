import { describe, expect, test } from 'bun:test';
import {
  humanSize,
  pluginArgs,
  releaseCreateArgs,
  renderChecksums,
  renderNotes,
  resolveTikToolsRef,
  sha256,
  validateTag,
} from './lib.ts';

const REV = 'ea60ff10a6eafb64341f851eea2f2933d13df79a';
const CARGO = `[workspace.dependencies]
tiktools-plugin-sdk = { git = "https://github.com/nglmercer/TikTools-app", rev = "${REV}" }
tiktools-plugin-api = { git = "https://github.com/nglmercer/TikTools-app", rev = "${REV}" }
`;

describe('validateTag', () => {
  test('accepts release-like tags', () => {
    expect(validateTag('v1.0.0')).toBe('v1.0.0');
    expect(validateTag('plugins-2026.11.22')).toBe('plugins-2026.11.22');
  });
  test('rejects unsafe tags', () => {
    for (const tag of ['', '-v1', 'v 1', 'v1;rm', '../x', 'a'.repeat(129)]) {
      expect(() => validateTag(tag)).toThrow();
    }
  });
});

describe('resolveTikToolsRef', () => {
  test('defaults to the rev pinned in Cargo.toml', () => {
    expect(resolveTikToolsRef(CARGO, '')).toBe(REV);
    expect(resolveTikToolsRef(CARGO, '  ')).toBe(REV);
  });
  test('prefers an explicit ref', () => {
    expect(resolveTikToolsRef(CARGO, 'main')).toBe('main');
    expect(resolveTikToolsRef('', 'release/1.2')).toBe('release/1.2');
  });
  test('fails without a pin or ref, and on unsafe refs', () => {
    expect(() => resolveTikToolsRef('', '')).toThrow();
    expect(() => resolveTikToolsRef(CARGO, 'a;b')).toThrow();
    expect(() => resolveTikToolsRef(CARGO, 'a/../b')).toThrow();
  });
});

describe('pluginArgs', () => {
  test('empty selects all', () => {
    expect(pluginArgs('')).toEqual(['--all']);
    expect(pluginArgs(' , ')).toEqual(['--all']);
  });
  test('builds one --plugin per name', () => {
    expect(pluginArgs('sonicboom, sonora')).toEqual(['--plugin', 'sonicboom', '--plugin', 'sonora']);
  });
  test('rejects unsafe names', () => {
    expect(() => pluginArgs('a;b')).toThrow();
    expect(() => pluginArgs('--all')).toThrow();
  });
});

describe('release rendering', () => {
  const files = [
    { name: 'b.plugin', size: 2048, sha256: sha256(new TextEncoder().encode('b')) },
    { name: 'a.plugin', size: 10, sha256: sha256(new TextEncoder().encode('a')) },
  ];
  test('sha256 matches the known digest', () => {
    expect(sha256(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  test('checksums are sorted and sha256sum-compatible', () => {
    const lines = renderChecksums(files).trim().split('\n');
    expect(lines.map((line) => line.split('  ')[1])).toEqual(['a.plugin', 'b.plugin']);
  });
  test('humanSize', () => {
    expect(humanSize(10)).toBe('10 B');
    expect(humanSize(2048)).toBe('2.0 KiB');
    expect(humanSize(5 * 1024 * 1024)).toBe('5.0 MiB');
  });
  test('notes list every archive', () => {
    const notes = renderNotes(files, 'abcdef0123456789', REV);
    expect(notes).toContain('`abcdef0`');
    expect(notes).toContain(`\`${REV.slice(0, 12)}\``);
    expect(notes).toContain('| `a.plugin` | 10 B |');
    expect(notes).toContain('| `b.plugin` | 2.0 KiB |');
  });
  test('gh arguments', () => {
    const base = { repository: 'o/r', tag: 'v1', title: '', commit: 'c', notesFile: 'n.md', files: ['x'] };
    const plain = releaseCreateArgs({ ...base, prerelease: false, draft: false });
    expect(plain).toEqual(['release', 'create', 'v1', '--repo', 'o/r', '--target', 'c', '--title', 'v1', '--notes-file', 'n.md', 'x']);
    const flagged = releaseCreateArgs({ ...base, title: 'T', prerelease: true, draft: true });
    expect(flagged).toContain('--prerelease');
    expect(flagged).toContain('--draft');
    expect(flagged).toContain('T');
  });
});
