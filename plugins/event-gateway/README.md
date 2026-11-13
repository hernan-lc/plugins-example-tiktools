# TikTools Event Gateway process plugin

This optional example plugin subscribes to the generic `DomainEvent` stream
through `events.subscribe` and exposes it locally:

- `GET http://127.0.0.1:17452/health`
- `GET http://127.0.0.1:17452/events` as authenticated NDJSON
- `ws://127.0.0.1:17452/ws` as authenticated JSON WebSocket messages
- `GET http://127.0.0.1:17452/widgets/follow/` as the Follow Alert OBS page
- `GET http://127.0.0.1:17452/widgets/gift/` as the Gift Alert OBS page
- `GET http://127.0.0.1:17452/widgets/chat/` as the Chat Overlay OBS page
- `GET http://127.0.0.1:17452/widgets/share/` as the Share Alert OBS page
- `GET http://127.0.0.1:17452/widgets/subscribe/` as the Subscribe Alert OBS page

The plugin owns all transport behavior. TikTools core only sends serialized
`{ "topic": "...", "data": ... }` envelopes through the plugin protocol.

The bind address is loopback-only. Remote/LAN binding is rejected explicitly;
the gateway's own loopback origins are allowed automatically and other browser
origins must be listed in `allowedOrigins`. The first start generates separate
`token` and `widgetToken` credentials in the plugin's settings file. HTTP event
clients use `Authorization: Bearer <token>`; query-string credentials are
rejected. Full-access `/ws` clients send:

```json
{"type":"auth","token":"..."}
{"type":"subscribe","topics":["live.*","plugin.*"]}
```

Build the executable and place it beside `plugin.json` under the package
directory:

```bash
cargo build --release --locked --manifest-path plugins/event-gateway/Cargo.toml
```

Disabling or uninstalling the plugin stops its process and removes this
gateway. Its listeners run only while the plugin is enabled.

## Widget pages

`/widgets/<kind>/` serves the OBS widgets (follow, gift, chat, share,
subscribe, likes, ranking and cloud-overlay) when their assets are present.
The widget sources and build toolchain belong to TikTools. From the
**TikTools checkout**, prepare development packages or build an archive:

```bash
bun scripts/task.ts prepare-plugins
bun scripts/task.ts plugins --plugin event-gateway
```

Both commands build TikTools' `src/widgets` and include the bundles in the
gateway's `dist/widgets/`. The archive is written to TikTools' `dist/plugins/`;
development staging goes to TikTools' `.dev-plugins/tiktools.event-gateway/`.
`bun run start` in TikTools also prepares it automatically. Select this plugin
repository with `TIKTOOLS_PLUGINS_REPO` when it is not a sibling checkout.
The gateway probes `<executable-dir>/widgets/` then
`<executable-dir>/dist/widgets/`; the `widgetsDir` setting overrides both.
Without assets the widget routes answer 404 and the event APIs keep working.

Widget page files carry no secrets, so they stay unauthenticated (loopback-only,
behind the standard origin check like `/health`). The widget token travels in
the page URL fragment (`#token=...`), which browsers never send to the
server; see the TikTools Widgets settings page, which builds the full OBS
URL including the fragment from the gateway port and the scoped `widgetToken`.
The widget client authenticates to `/ws/widgets`, which accepts only that
credential and the explicit widget topic allowlist. The full gateway `token`
belongs to `/events` and `/ws`; do not put it in an OBS browser-source URL.
