# plugins-example-tiktools

Example and first-party plugins for [TikTools](https://github.com/nglmercer/TikTools-app),
extracted from the TikTools repository with their history. Each directory under
`plugins/` is an independent plugin package; TikTools itself builds, runs and
ships without any of them, and installs them like any other plugin (registry,
`.plugin` file, or development staging).

| Directory | Plugin id | Runtime | Notes |
| --- | --- | --- | --- |
| `plugins/sonicboom` | `sonicboom.server` | process + WebView UI | SonicBoom TTS: Rust backend (`backend/`), Vue UI (`ui/`), shared TS policy (`shared/`) |
| `plugins/audio-process` | `audio.play.process` | process | Minimal Rust process plugin |
| `plugins/event-gateway` | `tiktools.event-gateway` | process | Loopback HTTP/WebSocket gateway; serves the TikTools OBS widgets |
| `plugins/textintel` | `textintel` | process | Pre-filter event processor (local text intelligence) |
| `plugins/hotkeys` | `hotkeys` | napi-vm | Global hotkeys through the `rdev-node` native addon |
| `plugins/sonora` | `sonora` | process | Sonora music player: search and play, play, pause, next, previous |
| `plugins/minecraft-server` | `minecraft.server` | declarative | Minecraft server actions |
| `plugins/peak-game` | `peak.game` | declarative | PEAK game integration |
| `plugins/repo-game` | `repo.game` | declarative | R.E.P.O. game integration |

`examples/` holds sample rule profiles and templates for these plugins, plus
`sonicboom-server-declarative`, the earlier manifest-only SonicBoom package kept
for reference (same id as `plugins/sonicboom`, so it is not staged).

Plugin ids, action ids, versions and settings are unchanged from the
TikTools tree they came from, so existing installations and saved settings keep
working. Manifest repository URLs now point to this repository.

## Build and test

```bash
bun install --frozen-lockfile
bun run typecheck            # SonicBoom UI + hotkeys guest
bun run test                 # TypeScript unit tests
bun run build:sonicboom-ui   # plugins/sonicboom/ui/dist
cargo test --workspace --locked
bun run check               # manifest ids / versions / runtimes
bun run e2e:sonicboom        # compiled UI; install Playwright Chromium first
bun run test:local           # everything above in one run; no Docker, no external services
```

Rust plugins depend only on the public `tiktools-plugin-sdk` / `tiktools-plugin-api`
crates, pinned to a TikTools revision in the root `Cargo.toml`. The plugin UI
uses the public `@tiktools/plugin-ui` broker client; it is not on npm yet, so a
pinned copy lives in `vendor/tiktools-plugin-ui` (refresh with
`bun run sync-sdk`). The Event Gateway vendors the subset of the Universal
Widget SDK it compiles (`plugins/event-gateway/vendor/universal`, with the same
SHA-256 pins TikTools uses).

## Developing with TikTools

The sibling paths below are optional local-development examples, not CI
requirements. This repository's workflow checks out only this repository and
uses the Git-pinned Rust SDK and vendored UI client. TikTools' normal CI checks
its host/runtime fixtures without cloning these integration sources. Custom
locations work through `TIKTOOLS_PLUGINS_REPO` (host to plugins) and
`TIKTOOLS_APP_DIR` (plugin tooling to host); absolute paths avoid any dependence
on a particular folder layout. Real cross-repository browser interop is an
optional extra check, not a standalone-build prerequisite.

For automatic local discovery, place the checkouts side by side:

```text
workspace/
├── TikTools-app/               # or Tiktok-Live-APPv3/
└── plugins-example-tiktools/
```

Install this repository's dependencies first with `bun install --frozen-lockfile`.
`bun run start` in TikTools then builds supported packages here, including the
SonicBoom UI, and stages them under TikTools' generated `.dev-plugins`
(loaded through `TIKTOOLS_DEV_PLUGINS_DIR`). A failed package is reported and
skipped without blocking the app. Each preparation clears the generated root,
so deleted or failed packages cannot remain active from an earlier run. Point at
another checkout with `TIKTOOLS_PLUGINS_REPO=/path/to/plugins-example-tiktools`,
or disable with `TIKTOOLS_PLUGINS_REPO=off`. `TIKTOOLS_SKIP_DEV_PLUGINS=1`
skips preparation entirely. TikTools' `bun run dev` also skips it.
To prepare packages without starting the desktop, or create distributable archives:

```bash
# from the TikTools checkout
bun scripts/task.ts prepare-plugins
bun scripts/task.ts plugins --all            # or --plugin event-gateway
bun scripts/task.ts plugins --plugin sonicboom --debug
```

Archives go to TikTools' `dist/plugins/` by default; use `--out /path/to/output`
to choose another directory. `--plugin` accepts a directory name or manifest id.
The packager supports SonicBoom's `backend/Cargo.toml` layout and rebuilds its
UI before including it. Native/process archives are target-specific;
declarative archives are target-independent. `examples/sonicboom-server-declarative`
is reference material with a duplicate id and is deliberately excluded.

The Event Gateway serves TikTools' OBS widgets (`src/widgets` in TikTools);
staging and packaging build them in TikTools and copy them into the package's
`dist/widgets/`.

### Developing against a local TikTools checkout

To build the Rust plugins against unmerged SDK changes, override the git
dependency without editing `Cargo.toml`:

```bash
cargo build --workspace \
  --config 'patch."https://github.com/nglmercer/TikTools-app".tiktools-plugin-sdk.path="../TikTools-app/crates/tiktools-plugin-sdk"' \
  --config 'patch."https://github.com/nglmercer/TikTools-app".tiktools-plugin-api.path="../TikTools-app/crates/tiktools-plugin-api"'
```

The SonicBoom host/plugin interop suite (`plugins/sonicboom/ui/tests/interop.spec.ts`)
bundles the real TikTools WebView host shim; it runs when `TIKTOOLS_APP_DIR`
(or a sibling `TikTools-app` / `Tiktok-Live-APPv3` checkout) is present and is
skipped otherwise. `sync-sdk` uses the same checkout names. For a custom name:

```bash
TIKTOOLS_APP_DIR=/path/to/TikTools bun run sync-sdk
TIKTOOLS_APP_DIR=/path/to/TikTools bun run e2e:sonicboom
```

Run host commands such as `bun scripts/task.ts prepare-plugins` in TikTools;
this repository has its own `package.json` commands and no `scripts/task.ts`.
Plugin-specific instructions live in each package's README.

## SonicBoom health strategy

`plugins/sonicboom/plugin.json` keeps `"strategy": "sonicboom"` so it still
works on already released TikTools versions. TikTools now implements this as
the generic `service-info` strategy (the old name is an alias) and reads the
protected probe from `authProbePath`, which the manifest declares explicitly.

## License

MIT
