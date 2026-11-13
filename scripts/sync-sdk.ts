/**
 * Refresh the vendored `@tiktools/plugin-ui` broker client from a TikTools
 * checkout (`TIKTOOLS_APP_DIR`, or a sibling TikTools-app/Tiktok-Live-APPv3).
 * The package is not published to npm yet, so plugin UIs use this pinned copy.
 */
import { cp, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const candidates = process.env.TIKTOOLS_APP_DIR
  ? [resolve(root, process.env.TIKTOOLS_APP_DIR)]
  : [resolve(root, '../TikTools-app'), resolve(root, '../Tiktok-Live-APPv3')];
let app: string | undefined;
for (const candidate of candidates) {
  if (await stat(join(candidate, 'packages', 'plugin-ui', 'package.json')).then((info) => info.isFile(), () => false)) {
    app = candidate;
    break;
  }
}
if (!app) throw new Error('TikTools checkout not found; set TIKTOOLS_APP_DIR to its path before syncing the UI SDK');
const source = join(app, 'packages', 'plugin-ui');
const target = join(root, 'vendor', 'tiktools-plugin-ui');
const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')) as { version: string };
for (const file of ['package.json', 'README.md', 'src/broker.ts']) {
  await cp(join(source, file), join(target, file));
}
console.log(`Vendored @tiktools/plugin-ui ${pkg.version} from ${source}`);
