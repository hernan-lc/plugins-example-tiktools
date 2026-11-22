/**
 * Entry point for every command the "Release plugins" workflow runs, so the
 * workflow YAML only calls `bun scripts/release/cli.ts <command>` and holds no
 * shell logic. Inputs come from environment variables; see each command.
 *
 *   prepare             validate inputs, write job outputs
 *   install-linux-deps  apt packages the Rust plugins need (Linux only)
 *   install-rust        install the pinned Rust toolchain
 *   build-plugins       package plugins with TikTools' packager (cwd: TikTools)
 *   publish             checksum the downloaded archives and create the release
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  pluginArgs,
  releaseCreateArgs,
  renderChecksums,
  renderNotes,
  resolveTikToolsRef,
  sha256,
  validateTag,
  type ReleaseFile,
} from './lib.ts';

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function run(command: string, args: string[], cwd?: string): void {
  console.log(`$ ${[command, ...args].join(' ')}`);
  const result = Bun.spawnSync({ cmd: [command, ...args], cwd, stdout: 'inherit', stderr: 'inherit' });
  if (!result.success) throw new Error(`${command} exited with code ${result.exitCode}`);
}

function capture(command: string, args: string[]): { ok: boolean; stdout: string } {
  const result = Bun.spawnSync({ cmd: [command, ...args], stdout: 'pipe', stderr: 'pipe' });
  return { ok: result.success, stdout: result.stdout.toString() };
}

function setOutput(name: string, value: string): void {
  console.log(`${name}=${value}`);
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${name}=${value}\n`);
}

function archives(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith('.plugin')).sort();
}

const commands: Record<string, () => void> = {
  prepare() {
    const tag = validateTag(env('TAG'));
    const exists = capture('gh', ['release', 'view', tag, '--repo', env('GITHUB_REPOSITORY')]);
    if (exists.ok) throw new Error(`A release for tag '${tag}' already exists`);

    const cargoToml = readFileSync(resolve('Cargo.toml'), 'utf8');
    setOutput('tiktools_ref', resolveTikToolsRef(cargoToml, env('TIKTOOLS_REF', '')));
    setOutput('plugin_args', pluginArgs(env('PLUGINS', '')).join(' '));
  },

  'install-linux-deps'() {
    const options = ['-o', 'Acquire::Retries=2', '-o', 'Acquire::http::Timeout=30', '-o', 'Acquire::https::Timeout=30'];
    run('sudo', ['apt-get', ...options, 'update']);
    run('sudo', [
      'env',
      'DEBIAN_FRONTEND=noninteractive',
      'apt-get',
      ...options,
      'install',
      '--no-install-recommends',
      '-y',
      'libasound2-dev',
      'pkg-config',
    ]);
  },

  'install-rust'() {
    run('rustup', ['toolchain', 'install', env('RUSTUP_TOOLCHAIN'), '--profile', 'minimal']);
  },

  'build-plugins'() {
    const out = resolve(env('OUT_DIR', '../out'));
    const args = env('PLUGIN_ARGS', '--all').split(/\s+/).filter(Boolean);
    // Re-validate: the value crosses a workflow boundary before reaching here.
    pluginArgs(args.filter((arg) => arg !== '--plugin' && arg !== '--all').join(','));
    run('bun', ['scripts/task.ts', 'plugins', ...args, '--out', out]);
    const built = archives(out);
    if (built.length === 0) throw new Error(`No .plugin archives were produced in ${out}`);
    console.log(`Built ${built.length} archive(s):\n${built.map((name) => `  ${name}`).join('\n')}`);
  },

  publish() {
    const dist = resolve(env('DIST_DIR', 'dist'));
    const names = archives(dist);
    if (names.length === 0) throw new Error(`No .plugin archives found in ${dist}`);
    const files: ReleaseFile[] = names.map((name) => {
      const bytes = readFileSync(join(dist, name));
      return { name, size: statSync(join(dist, name)).size, sha256: sha256(bytes) };
    });

    const checksums = renderChecksums(files);
    writeFileSync(join(dist, 'SHA256SUMS.txt'), checksums);
    console.log(checksums);

    const commit = env('GITHUB_SHA');
    const notesFile = resolve('notes.md');
    writeFileSync(notesFile, renderNotes(files, commit, env('TIKTOOLS_REF')));

    run(
      'gh',
      releaseCreateArgs({
        repository: env('GITHUB_REPOSITORY'),
        tag: validateTag(env('TAG')),
        title: env('TITLE', ''),
        commit,
        notesFile,
        prerelease: env('PRERELEASE', 'false') === 'true',
        draft: env('DRAFT', 'false') === 'true',
        files: [...names, 'SHA256SUMS.txt'].map((name) => join(dist, name)),
      }),
    );
  },
};

const name = process.argv[2] ?? '';
const command = commands[name];
if (!command) {
  console.error(`Unknown command '${name}'. Commands: ${Object.keys(commands).join(', ')}`);
  process.exit(2);
}
try {
  command();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::${message}`);
  process.exit(1);
}
