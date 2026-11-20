#![forbid(unsafe_code)]
// Release plugin executables must not allocate a console on Windows; the
// host launches them with CREATE_NO_WINDOW and talks over piped stdio.
#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]

//! The audio provider plugin. It plays local audio files itself through the
//! rodio engine, so TikTools links no audio backend. The host routes the
//! `audio.play` capability here (`capabilityProviders` in plugin.json) and
//! receives the playback outcome as the structured `result`.

use std::path::Path;

use serde_json::{json, Map, Value};
use tiktools_audio_rodio::{AudioEngine, Overlap};
use tiktools_plugin_sdk::prelude::*;

#[derive(Default)]
struct AudioPlugin {
    engine: AudioEngine,
}

impl Plugin for AudioPlugin {
    fn action(&mut self, _context: &PluginContext, call: ActionCall) -> PluginResult<ActionResult> {
        let file_ref = file_reference(call.config())
            .ok_or_else(|| PluginError::invalid_request("audio action has no file reference"))?;
        let file_ref = if let Some(path) = file_ref.as_str() {
            MediaFileRef::from_path(path)
        } else {
            serde_json::from_value(file_ref).map_err(|error| {
                PluginError::invalid_request(format!("invalid audio file reference: {error}"))
            })?
        };
        let display_name = if file_ref.name.is_empty() {
            Path::new(&file_ref.path)
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| file_ref.path.clone())
        } else {
            file_ref.name.clone()
        };
        let volume = call
            .config()
            .get("volume")
            .and_then(number)
            .unwrap_or(1.0)
            .clamp(0.0, 1.0);
        let overlap = match call.config().get("overlap").and_then(Value::as_str) {
            Some("restart") => Overlap::Restart,
            Some("drop") => Overlap::Drop,
            _ => Overlap::Allow,
        };
        let outcome = self
            .engine
            .play_file(Path::new(&file_ref.path), volume, overlap)
            .map_err(|error| PluginError::other(error.to_string()))?;
        let summary = if outcome.played {
            format!("played {}", display_name)
        } else {
            format!(
                "skipped {}{}",
                display_name,
                outcome
                    .reason
                    .map(|reason| format!(" ({reason})"))
                    .unwrap_or_default()
            )
        };
        let mut action = ActionResult::summary(summary).result(json!({
            "played": outcome.played,
            "reason": outcome.reason,
            "activePlayers": outcome.active_players,
        }));
        if outcome.played {
            action = action.event(PluginEvent::new(
                "audio.started",
                json!({
                    "path": file_ref.path,
                    "name": display_name,
                    "volume": volume,
                    "activePlayers": outcome.active_players,
                }),
            )?);
        }
        Ok(action)
    }
}

fn file_reference(config: &Map<String, Value>) -> Option<Value> {
    ["fileRef", "filePath", "file", "path"]
        .into_iter()
        .find_map(|key| config.get(key))
        .and_then(|value| (value.is_string() || value.is_object()).then(|| value.clone()))
}

fn number(value: &Value) -> Option<f32> {
    match value {
        Value::Number(value) => value.as_f64().map(|value| value as f32),
        Value::String(value) => value.parse().ok(),
        _ => None,
    }
}

tiktools_process_plugin!(AudioPlugin);
