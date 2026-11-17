#![forbid(unsafe_code)]
// Release plugin executables must not allocate a console on Windows; the
// host launches them with CREATE_NO_WINDOW and talks over piped stdio.
#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]

//! TikTools control for a running Sonora.
//!
//! Sonora exposes the same line-oriented control socket its own CLI talks to
//! (`sonora.sock`, protocol 2): one request line in, one reply line out. Each
//! action maps to a single request, and the plugin is deliberately small:
//!
//! - `sonora.search-play` -> `{"queue":{"play":[{"search":{...}}]}}`
//! - `sonora.play` / `pause` / `next` / `previous` -> `{"playback":"..."}`
//!
//! Everything else in the WebDeck reference plugin (lyrics, volume, seek,
//! links, ...) is intentionally left out.

use serde_json::{json, Map, Value};
use std::{
    env,
    ffi::OsString,
    path::{Path, PathBuf},
    time::Duration,
};
use tiktools_plugin_sdk::prelude::*;

#[cfg(unix)]
use std::{
    io::{BufRead, BufReader, Read, Write},
    os::unix::net::UnixStream,
};

/// Sonora refuses any other protocol version.
const PROTOCOL_VERSION: u32 = 2;
const MAX_REQUEST_BYTES: usize = 64 * 1024;
const MAX_REPLY_BYTES: usize = 1024 * 1024;
/// Kept below the host's default 30 s action timeout so the plugin reports a
/// clear error instead of being killed mid-request.
const ANSWER_TIMEOUT: Duration = Duration::from_secs(20);

/// Optional override for runs where the variable reaches this process. Under
/// the TikTools host a process plugin gets a cleared environment, so the
/// `socketPath` setting (read from the plugin data dir) is the working path.
const SOCKET_ENV: &str = "SONORA_SOCKET";
const KINDS: [&str; 4] = ["song", "album", "artist", "playlist"];

#[derive(Default)]
struct SonoraPlugin;

impl Plugin for SonoraPlugin {
    fn action(&mut self, context: &PluginContext, call: ActionCall) -> PluginResult<ActionResult> {
        let action_type = call.action_type().unwrap_or_default();
        let request = request_for(action_type, call.config())?;
        let socket = resolve_socket_path(context)?;
        let value = call_sonora(&request, &socket)?;

        let mut result = ActionResult::summary(summary_for(action_type));
        if let Some(value) = value {
            let text = serde_json::to_string(&value).unwrap_or_else(|_| value.to_string());
            result = result.log(format!("Sonora: {text}"));
        }
        Ok(result)
    }
}

fn summary_for(action_type: &str) -> String {
    match action_type {
        "sonora.search-play" => "Sonora: searching and playing the best match".into(),
        "sonora.play" => "Sonora: playback resumed".into(),
        "sonora.pause" => "Sonora: playback paused".into(),
        "sonora.next" => "Sonora: skipped to the next track".into(),
        "sonora.previous" => "Sonora: returned to the previous track".into(),
        other => format!("Sonora: {other}"),
    }
}

/// Build the one request line Sonora expects for an action. Pure so it can be
/// unit-tested without a running Sonora.
fn request_for(action_type: &str, config: &Map<String, Value>) -> PluginResult<Value> {
    match action_type {
        "sonora.play" => Ok(json!({"playback": "play"})),
        "sonora.pause" => Ok(json!({"playback": "pause"})),
        "sonora.next" => Ok(json!({"playback": "next"})),
        "sonora.previous" => Ok(json!({"playback": "previous"})),
        "sonora.search-play" => {
            let text = required_text(config, "text")?;
            let kind = required_choice(config, "kind", &KINDS)?;
            Ok(json!({
                "queue": {
                    "play": [{ "search": { "text": text, "kind": kind } }]
                }
            }))
        }
        other => Err(PluginError::unsupported(other)),
    }
}

fn required_text(config: &Map<String, Value>, key: &str) -> PluginResult<String> {
    let value = config
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| PluginError::invalid_request(format!("{key} must be a string")))?;
    let value = value.trim();
    if value.is_empty() || value.len() > 200 {
        return Err(PluginError::invalid_request(format!(
            "{key} must have 1 to 200 characters"
        )));
    }
    Ok(value.to_owned())
}

fn required_choice(
    config: &Map<String, Value>,
    key: &str,
    allowed: &[&str],
) -> PluginResult<String> {
    let value = config
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| PluginError::invalid_request(format!("{key} must be a string")))?;
    if !allowed.contains(&value) {
        return Err(PluginError::invalid_request(format!(
            "{key} must be one of: {}",
            allowed.join(", ")
        )));
    }
    Ok(value.to_owned())
}

/// Resolve the socket in order: the TikTools plugin setting, an environment
/// override (for direct/standalone runs), then the standard XDG locations.
fn resolve_socket_path(context: &PluginContext) -> PluginResult<PathBuf> {
    if let Some(path) = setting_socket_path(context) {
        return Ok(path);
    }
    if let Some(path) = non_empty(env::var_os(SOCKET_ENV)) {
        return Ok(PathBuf::from(path));
    }
    socket_path_from(
        env::var_os("XDG_RUNTIME_DIR"),
        env::var_os("XDG_CACHE_HOME"),
        env::var_os("HOME"),
    )
}

/// The host writes plugin settings to `<data dir>/<plugin id>/settings.json`.
/// Process plugins have no SDK accessor for settings, but the data dir is
/// passed explicitly, so this is a stable way to honour the `socketPath`
/// setting configured in the TikTools UI.
fn setting_socket_path(context: &PluginContext) -> Option<PathBuf> {
    let root = tiktools_plugin_sdk::data_dir().ok()?;
    let id = if context.identity.id.is_empty() {
        "sonora"
    } else {
        &context.identity.id
    };
    let text = std::fs::read_to_string(root.join(id).join("settings.json")).ok()?;
    let settings: Value = serde_json::from_str(&text).ok()?;
    socket_path_from_setting(&settings)
}

fn socket_path_from_setting(settings: &Value) -> Option<PathBuf> {
    let value = settings.get("socketPath")?.as_str()?.trim();
    (!value.is_empty()).then(|| PathBuf::from(value))
}

fn socket_path_from(
    runtime_dir: Option<OsString>,
    cache_home: Option<OsString>,
    home: Option<OsString>,
) -> PluginResult<PathBuf> {
    #[cfg(unix)]
    {
        if let Some(dir) = non_empty(runtime_dir) {
            return Ok(Path::new(&dir).join("sonora.sock"));
        }
        let cache = non_empty(cache_home)
            .map(PathBuf::from)
            .or_else(|| non_empty(home).map(|home| PathBuf::from(home).join(".cache")))
            .ok_or_else(|| {
                PluginError::other("Cannot locate Sonora's socket; set SONORA_SOCKET to its path")
            })?;
        Ok(cache.join("sonora").join("sonora.sock"))
    }
    #[cfg(not(unix))]
    {
        let _ = (runtime_dir, cache_home, home);
        Err(PluginError::other(
            "Sonora control currently supports Linux and macOS only",
        ))
    }
}

fn non_empty(value: Option<OsString>) -> Option<OsString> {
    value.filter(|value| !value.is_empty())
}

/// Send one request and wait for a bounded reply. `Ok(None)` means Sonora
/// answered `"done"`; `Ok(Some(value))` is a value reply; a refused request
/// becomes an error the user can read in the action result.
fn call_sonora(body: &Value, path: &Path) -> PluginResult<Option<Value>> {
    #[cfg(unix)]
    {
        let request = encode_request(body)?;
        let stream = UnixStream::connect(&path).map_err(|error| {
            PluginError::other(format!(
                "Cannot connect to Sonora at {} ({}). Is Sonora running?",
                path.display(),
                error
            ))
        })?;
        stream
            .set_read_timeout(Some(ANSWER_TIMEOUT))
            .and_then(|()| stream.set_write_timeout(Some(ANSWER_TIMEOUT)))
            .map_err(|error| {
                PluginError::other(format!("Could not set Sonora socket timeout: {error}"))
            })?;
        (&stream).write_all(&request).map_err(|error| {
            PluginError::other(format!("Could not send request to Sonora: {error}"))
        })?;

        let mut reader = BufReader::new((&stream).take(MAX_REPLY_BYTES as u64 + 1));
        let mut line = Vec::new();
        reader.read_until(b'\n', &mut line).map_err(|error| {
            PluginError::other(format!("Could not read Sonora's reply: {error}"))
        })?;
        if line.len() > MAX_REPLY_BYTES {
            return Err(PluginError::other("Sonora's reply is too large"));
        }
        if !line.ends_with(b"\n") {
            return Err(PluginError::other(
                "Sonora closed the connection without answering",
            ));
        }
        decode_reply(&line)
    }
    #[cfg(not(unix))]
    {
        let _ = (body, path);
        Err(PluginError::other(
            "Sonora control currently supports Linux and macOS only",
        ))
    }
}

fn encode_request(body: &Value) -> PluginResult<Vec<u8>> {
    // A plugin must not open a long-lived streaming connection or make Sonora
    // play arbitrary local files.
    if body
        .as_object()
        .is_some_and(|map| map.contains_key("watch"))
    {
        return Err(PluginError::invalid_request(
            "streaming requests are not available to plugins",
        ));
    }
    if let Some(queue) = body.get("queue").and_then(Value::as_object) {
        let has_path = queue
            .values()
            .filter_map(Value::as_array)
            .flatten()
            .any(|item| item.get("path").is_some());
        if has_path {
            return Err(PluginError::invalid_request(
                "local file paths cannot be queued by a plugin",
            ));
        }
    }
    // Build the envelope explicitly so `v` comes first, exactly as in
    // Sonora's CLI wire format (serde_json's map would reorder the keys).
    let payload =
        serde_json::to_vec(body).map_err(|error| PluginError::other(error.to_string()))?;
    let prefix = format!(r#"{{"v":{PROTOCOL_VERSION},"body":"#);
    let mut line = Vec::with_capacity(prefix.len() + payload.len() + 2);
    line.extend_from_slice(prefix.as_bytes());
    line.extend_from_slice(&payload);
    line.extend_from_slice(b"}\n");
    if line.len() > MAX_REQUEST_BYTES {
        return Err(PluginError::invalid_request("request is too large"));
    }
    Ok(line)
}

fn decode_reply(line: &[u8]) -> PluginResult<Option<Value>> {
    let envelope: Value = serde_json::from_slice(line)
        .map_err(|error| PluginError::other(format!("Invalid reply from Sonora: {error}")))?;
    let version = envelope
        .get("v")
        .and_then(Value::as_u64)
        .ok_or_else(|| PluginError::other("Invalid reply from Sonora: missing version"))?;
    if version != u64::from(PROTOCOL_VERSION) {
        return Err(PluginError::other(format!(
            "Sonora speaks protocol {version}, this plugin expects {PROTOCOL_VERSION}"
        )));
    }
    match envelope.get("body") {
        Some(Value::String(word)) if word == "done" => Ok(None),
        Some(Value::Object(body)) => {
            if let Some(value) = body.get("value") {
                Ok(Some(value.clone()))
            } else if let Some(failure) = body.get("failed") {
                Err(PluginError::other(describe_failure(failure)))
            } else {
                Err(PluginError::other("Invalid reply from Sonora"))
            }
        }
        _ => Err(PluginError::other("Invalid reply from Sonora")),
    }
}

fn describe_failure(failure: &Value) -> String {
    match failure {
        Value::String(word) => match word.as_str() {
            "malformed" => "Sonora rejected the request as malformed".into(),
            "no-current-track" => "No track is playing in Sonora".into(),
            other => format!("Sonora refused the request ({other})"),
        },
        Value::Object(map) => {
            if let Some(version) = map.get("version") {
                format!("Sonora speaks protocol {version}, this plugin expects {PROTOCOL_VERSION}")
            } else {
                "Sonora refused the request".into()
            }
        }
        _ => "Sonora refused the request".into(),
    }
}

tiktools_process_plugin!(SonoraPlugin);

#[cfg(test)]
mod tests {
    use super::*;

    fn config(entries: &[(&str, &str)]) -> Map<String, Value> {
        entries
            .iter()
            .map(|(key, value)| ((*key).to_owned(), Value::String((*value).to_owned())))
            .collect()
    }

    #[test]
    fn playback_actions_map_to_control_requests() {
        for (action, playback) in [
            ("sonora.play", "play"),
            ("sonora.pause", "pause"),
            ("sonora.next", "next"),
            ("sonora.previous", "previous"),
        ] {
            assert_eq!(
                request_for(action, &config(&[])).unwrap(),
                json!({"playback": playback})
            );
        }
    }

    #[test]
    fn search_play_maps_to_a_queue_play_request() {
        let body = request_for(
            "sonora.search-play",
            &config(&[("text", "daft punk"), ("kind", "song")]),
        )
        .unwrap();
        assert_eq!(
            body,
            json!({"queue": {"play": [{"search": {"text": "daft punk", "kind": "song"}}]}})
        );
    }

    #[test]
    fn search_play_validates_text_and_kind() {
        assert!(request_for("sonora.search-play", &config(&[("kind", "song")])).is_err());
        assert!(request_for(
            "sonora.search-play",
            &config(&[("text", "x"), ("kind", "movie")])
        )
        .is_err());
        assert!(request_for(
            "sonora.search-play",
            &config(&[("text", "   "), ("kind", "song")])
        )
        .is_err());
    }

    #[test]
    fn unknown_actions_are_rejected() {
        assert!(request_for("sonora.seek", &config(&[])).is_err());
    }

    #[test]
    fn request_envelope_uses_protocol_two() {
        assert_eq!(
            encode_request(&json!({"playback": "next"})).unwrap(),
            b"{\"v\":2,\"body\":{\"playback\":\"next\"}}\n"
        );
    }

    #[test]
    fn replies_decode_done_value_and_failure() {
        assert_eq!(
            decode_reply(b"{\"v\":2,\"body\":\"done\"}\n").unwrap(),
            None
        );
        assert_eq!(
            decode_reply(b"{\"v\":2,\"body\":{\"value\":{\"hits\":[]}}}\n").unwrap(),
            Some(json!({"hits": []}))
        );
        assert!(decode_reply(b"{\"v\":2,\"body\":{\"failed\":\"no-current-track\"}}\n").is_err());
        assert!(decode_reply(b"{\"v\":3,\"body\":\"done\"}\n").is_err());
    }

    #[test]
    fn socket_path_setting_when_present() {
        let settings = json!({"socketPath": "  /tmp/custom.sock  "});
        assert_eq!(
            socket_path_from_setting(&settings),
            Some(PathBuf::from("/tmp/custom.sock"))
        );
        assert_eq!(socket_path_from_setting(&json!({"socketPath": ""})), None);
        assert_eq!(socket_path_from_setting(&json!({})), None);
    }

    #[cfg(unix)]
    #[test]
    fn socket_path_prefers_runtime_then_cache() {
        let runtime = socket_path_from(Some(OsString::from("/run/user/1000")), None, None).unwrap();
        assert_eq!(runtime, PathBuf::from("/run/user/1000/sonora.sock"));

        let cache = socket_path_from(None, Some(OsString::from("/home/me/.cache")), None).unwrap();
        assert_eq!(cache, PathBuf::from("/home/me/.cache/sonora/sonora.sock"));

        let home = socket_path_from(None, None, Some(OsString::from("/home/me"))).unwrap();
        assert_eq!(home, PathBuf::from("/home/me/.cache/sonora/sonora.sock"));
    }
}
