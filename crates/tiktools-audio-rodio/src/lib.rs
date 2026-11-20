//! Rodio playback engine for TikTools hosts.
//!
//! The engine streams an existing audio file straight to the default output.
//! It uses only standard Rust types, so a host adapts it to its own media
//! interface without this crate depending on any host crate. No file is copied.

use std::{
    fmt,
    fs::File,
    path::Path,
    sync::{Arc, Mutex},
};

use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player};

/// What to do when a sound is already playing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Overlap {
    /// Start the new sound alongside the ones already playing.
    Allow,
    /// Stop everything that is playing, then start the new sound.
    Restart,
    /// Refuse the new sound while anything is still playing.
    Drop,
}

/// Result of a playback request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlaybackOutcome {
    pub played: bool,
    /// Why nothing played, when `played` is false.
    pub reason: Option<&'static str>,
    /// Sounds still playing after this request.
    pub active_players: usize,
}

/// Failure to play. The display text is suitable for host logs.
#[derive(Debug)]
pub enum AudioError {
    Output(String),
    Open { path: String, message: String },
    Decode { name: String, message: String },
    Poisoned,
}

impl fmt::Display for AudioError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Output(message) => write!(formatter, "could not open audio output: {message}"),
            Self::Open { path, message } => write!(formatter, "could not open {path}: {message}"),
            Self::Decode { name, message } => write!(formatter, "could not decode {name}: {message}"),
            Self::Poisoned => formatter.write_str("audio state lock is poisoned"),
        }
    }
}

impl std::error::Error for AudioError {}

#[derive(Default)]
struct State {
    /// Opened on first use and kept for the life of the engine.
    stream: Option<MixerDeviceSink>,
    sinks: Vec<Player>,
}

/// Plays audio files on the default output device. Cheap to share: clone the `Arc`.
#[derive(Default)]
pub struct AudioEngine {
    state: Arc<Mutex<State>>,
}

impl AudioEngine {
    pub fn new() -> Self {
        Self::default()
    }

    /// Plays the file at `path` at `volume` (clamped to 0.0..=1.0) under `overlap`.
    pub fn play_file(
        &self,
        path: &Path,
        volume: f32,
        overlap: Overlap,
    ) -> Result<PlaybackOutcome, AudioError> {
        let mut state = self.state.lock().map_err(|_| AudioError::Poisoned)?;
        state.sinks.retain(|sink| !sink.empty());
        if overlap == Overlap::Drop && !state.sinks.is_empty() {
            return Ok(PlaybackOutcome {
                played: false,
                reason: Some("already-playing"),
                active_players: state.sinks.len(),
            });
        }
        if overlap == Overlap::Restart {
            for sink in &state.sinks {
                sink.stop();
            }
            state.sinks.clear();
        }
        if state.stream.is_none() {
            let stream = DeviceSinkBuilder::open_default_sink()
                .map_err(|error| AudioError::Output(error.to_string()))?;
            state.stream = Some(stream);
        }
        let input = File::open(path).map_err(|error| AudioError::Open {
            path: path.display().to_string(),
            message: error.to_string(),
        })?;
        let source = Decoder::try_from(input).map_err(|error| AudioError::Decode {
            name: path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            message: error.to_string(),
        })?;
        let stream = state
            .stream
            .as_ref()
            .ok_or_else(|| AudioError::Output("audio output was not initialized".to_owned()))?;
        let sink = Player::connect_new(stream.mixer());
        sink.set_volume(volume.clamp(0.0, 1.0));
        sink.append(source);
        state.sinks.push(sink);
        Ok(PlaybackOutcome {
            played: true,
            reason: None,
            active_players: state.sinks.len(),
        })
    }
}
