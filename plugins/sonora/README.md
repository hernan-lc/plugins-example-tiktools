# Sonora

Control a running [Sonora](https://github.com/sonorahq/sonora) music player from
TikTools. The plugin is a small Rust `process` plugin that speaks Sonora's own
control socket — the same line-oriented protocol 2 its CLI uses — so no host
changes and no additional TikTools capability are required.

## Actions

| Action id | Action | Arguments | Sonora request |
| --- | --- | --- | --- |
| `sonora.search-play` | Sonora: Search and play | `text`, `kind` (`song` / `album` / `artist` / `playlist`) | `{"queue":{"play":[{"search":{...}}]}}` |
| `sonora.play` | Sonora: Play | — | `{"playback":"play"}` |
| `sonora.pause` | Sonora: Pause | — | `{"playback":"pause"}` |
| `sonora.next` | Sonora: Next track | — | `{"playback":"next"}` |
| `sonora.previous` | Sonora: Previous track | — | `{"playback":"previous"}` |

`text` supports TikTools event placeholders, so a song request can be driven
directly by a chat comment, e.g. `{{ event.data.comment }}`.

Only these five actions are shipped. The wider WebDeck reference integration
also exposes queue/lyrics/provider reads, seek, volume, mute, shuffle, repeat,
like, provider switching and link queueing; they are intentionally omitted
here.

## Connection

The socket is discovered in this order:

1. The plugin setting **Socket path** (`socketPath`), configurable in the
   TikTools plugin settings UI. This is the reliable override under TikTools:
   the launcher clears the plugin process environment, so arbitrary variables
   are not forwarded.
2. `SONORA_SOCKET` environment variable, when the plugin is launched directly
   with it in its environment.
3. `$XDG_RUNTIME_DIR/sonora.sock` (the default Sonora location; the host does
   forward `XDG_RUNTIME_DIR` to plugins).
4. `$XDG_CACHE_HOME/sonora/sonora.sock`, or
   `$HOME/.cache/sonora/sonora.sock` when `XDG_CACHE_HOME` is unset.

Sonora must already be running; otherwise the action reports that the socket
could not be reached.

Only Unix sockets are supported (Linux and macOS). Sonora's Windows named pipe
is not implemented yet.

## Security

Each action sends exactly one request and validates it first. Streaming
(`watch`) requests and local file paths are rejected, replies are size-bounded,
and the 20-second answer timeout stays below the host's default action timeout.
Refusals from Sonora are surfaced as readable action errors.

## Build and test

```bash
cargo test -p tiktools-sonora-plugin
```
