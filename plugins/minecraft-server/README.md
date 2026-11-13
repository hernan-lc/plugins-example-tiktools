# Minecraft Server plugin

This declarative package sends HTTP commands to Minecraft's CommandAPI mod.
The host interprets `plugin.json`; there is no executable or plugin UI to build.

## Development and packaging

In the **TikTools checkout**, run `bun scripts/task.ts prepare-plugins` to
stage this package into TikTools' `.dev-plugins/minecraft.server`, or
`bun run start` to prepare and load it automatically. TikTools finds this
repository beside it or through `TIKTOOLS_PLUGINS_REPO`.

For distribution, run `bun scripts/task.ts plugins --plugin minecraft-server`
in TikTools and import the archive from its `dist/plugins/` in the Plugins view.
Enable `minecraft.server` and its `http.request` capability.

## Connect and verify

Start Minecraft with CommandAPI installed, join a world and configure the
server URL in the plugin settings. The manifest provides item, mob, effect,
weather, chat and raw-command actions. CommandAPI has no declared health
endpoint in this integration: use an action's **Run test** to preview the HTTP
request. A dry run does not establish that the game executed the command.
Live actions require a loaded world and a reachable mod server.

Sample profiles and templates live under `examples/profiles/` and
`examples/templates/` in this repository. Review their targets and gift filters
before enabling rules. If an action fails, check the configured address,
CommandAPI availability and whether a world is loaded.
