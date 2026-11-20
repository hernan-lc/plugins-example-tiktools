//! Remote-control plugin: the Remote control page and its host-mediated actions.
//!
//! The plugin owns the page and the operator workflow; the host owns every
//! token, the relay link and the authorization. Each action below is a
//! `host_remote_execute` call that the host checks against its first-party
//! allowlist. The plugin never receives a bearer token, a ControlApi or raw
//! settings, and every identifier it forwards is bounded here first.

use serde_json::{json, Map, Value};
use tiktools_plugin_sdk::{
    host_remote_execute, run_process_plugin, ActionCall, ActionResult, DomainEventEnvelope,
    Plugin, PluginContext, PluginError, PluginResult,
};

/// Operations a controller may request. Moderation stays out: the relay and the host refuse it
/// for read-only roles, and this page only offers reads.
const READ_OPERATIONS: &[&str] = &[
    "automation.list",
    "live.status",
    "workflow.list",
    "competition.list",
    "points.read",
    "command.outcome",
];

#[derive(Default)]
struct RemoteControl;

fn text(config: &Map<String, Value>, key: &str, max: usize) -> PluginResult<String> {
    let value = config
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    if value.is_empty() || value.len() > max {
        return Err(PluginError::invalid_request(format!(
            "{key} is required (1 to {max} characters)"
        )));
    }
    Ok(value.to_owned())
}

fn optional_text(config: &Map<String, Value>, key: &str, max: usize) -> PluginResult<Option<String>> {
    match config.get(key).and_then(Value::as_str).map(str::trim) {
        None | Some("") => Ok(None),
        Some(value) if value.len() <= max => Ok(Some(value.to_owned())),
        Some(_) => Err(PluginError::invalid_request(format!("{key} is too long"))),
    }
}

fn host_id(config: &Map<String, Value>) -> PluginResult<String> {
    text(config, "hostId", 128)
}

/// Serialize a structured answer into the summary the page parses.
fn answer(value: Value) -> PluginResult<ActionResult> {
    let text = serde_json::to_string(&value).map_err(|error| PluginError::other(error.to_string()))?;
    Ok(ActionResult::summary(text))
}

fn call(method: &str, params: Value) -> PluginResult<Value> {
    host_remote_execute(method, params)
}

fn status() -> PluginResult<ActionResult> {
    // Each part is reported on its own, so one missing piece never hides the others.
    let cloud = match host_remote_execute("cloud.status", json!({})) {
        Ok(value) => json!({
            "state": value.get("state").and_then(Value::as_str).unwrap_or("unknown"),
            "accountId": value.get("accountId").cloned().unwrap_or(Value::Null),
        }),
        Err(error) => json!({ "state": "unavailable", "reason": error.to_string() }),
    };
    let link = call("remote.host.status", json!({})).unwrap_or_else(
        |error| json!({ "state": "unavailable", "lastError": error.to_string() }),
    );
    answer(json!({ "cloud": cloud, "link": link }))
}

impl Plugin for RemoteControl {
    fn initialize(&mut self, _context: &PluginContext) -> PluginResult<()> {
        Ok(())
    }

    fn action(&mut self, _context: &PluginContext, call_info: ActionCall) -> PluginResult<ActionResult> {
        let config = call_info.config().clone();
        match call_info.action_type() {
            Some("tiktools.remote-control.status") => status(),
            Some("tiktools.remote-control.host.start") => answer(call("remote.host.start", json!({}))?),
            Some("tiktools.remote-control.host.stop") => answer(call("remote.host.stop", json!({}))?),
            Some("tiktools.remote-control.teams.list") => answer(call("remote.teams.list", json!({}))?),
            Some("tiktools.remote-control.team.create") => {
                let name = text(&config, "name", 80)?;
                answer(call("remote.team.create", json!({ "name": name }))?)
            }
            Some("tiktools.remote-control.device.enroll") => {
                let kind = text(&config, "kind", 16)?;
                if kind != "host" && kind != "controller" {
                    return Err(PluginError::invalid_request("kind must be host or controller".to_owned()));
                }
                let label = text(&config, "label", 80)?;
                let mut params = json!({ "kind": kind, "label": label });
                if kind == "host" {
                    params["hostId"] = json!(host_id(&config)?);
                }
                answer(call("remote.device.enroll", params)?)
            }
            Some("tiktools.remote-control.invitation.create") => {
                let requested_role = text(&config, "requestedRole", 32)?;
                let mut params = json!({ "hostId": host_id(&config)?, "requestedRole": requested_role });
                if let Some(ttl) = config.get("ttlSeconds").and_then(Value::as_i64) {
                    params["ttlSeconds"] = json!(ttl);
                }
                answer(call("remote.invitation.create", params)?)
            }
            Some("tiktools.remote-control.requests.list") => {
                let host = host_id(&config)?;
                answer(call("remote.request.list", json!({ "hostId": host }))?)
            }
            Some("tiktools.remote-control.requests.decide") => {
                let decision = text(&config, "decision", 16)?;
                if decision != "approve" && decision != "deny" {
                    return Err(PluginError::invalid_request("decision must be approve or deny".to_owned()));
                }
                let mut params = json!({
                    "hostId": host_id(&config)?,
                    "requestId": text(&config, "requestId", 128)?,
                    "decision": decision,
                });
                if let Some(role) = optional_text(&config, "role", 32)? {
                    params["role"] = json!(role);
                }
                answer(call("remote.request.decide", params)?)
            }
            Some("tiktools.remote-control.grants.list") => {
                let host = host_id(&config)?;
                answer(call("remote.grant.list", json!({ "hostId": host }))?)
            }
            Some("tiktools.remote-control.pairings.list") => {
                let host = host_id(&config)?;
                answer(call("remote.pair.list", json!({ "hostId": host }))?)
            }
            Some("tiktools.remote-control.grants.revoke") => {
                let host = host_id(&config)?;
                let grant_id = text(&config, "grantId", 128)?;
                let revision = config.get("revision").and_then(Value::as_i64).ok_or_else(|| {
                    PluginError::invalid_request("revision is required".to_owned())
                })?;
                answer(call(
                    "remote.grant.revoke",
                    json!({ "hostId": host, "grantId": grant_id, "revision": revision }),
                )?)
            }
            Some("tiktools.remote-control.command.run") => {
                let operation = text(&config, "operation", 64)?;
                if !READ_OPERATIONS.contains(&operation.as_str()) {
                    return Err(PluginError::invalid_request(format!(
                        "operation {operation} is not offered on this page"
                    )));
                }
                let args = config.get("args").cloned().unwrap_or_else(|| json!({}));
                if !args.is_object() {
                    return Err(PluginError::invalid_request("args must be an object".to_owned()));
                }
                let outcome = call(
                    "remote.command.run",
                    json!({ "hostId": host_id(&config)?, "operation": operation, "args": args }),
                )?;
                answer(json!({ "outcome": outcome }))
            }
            other => Err(PluginError::other(format!("unknown action {other:?}"))),
        }
    }

    fn event(&mut self, _context: &PluginContext, _event: DomainEventEnvelope) -> PluginResult<()> {
        Ok(())
    }
}

fn main() -> PluginResult<()> {
    run_process_plugin::<RemoteControl>()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_identifiers_are_trimmed_and_bounded() {
        let mut config = Map::new();
        assert!(host_id(&config).is_err());
        config.insert("hostId".into(), json!("   "));
        assert!(host_id(&config).is_err());
        config.insert("hostId".into(), json!("a".repeat(129)));
        assert!(host_id(&config).is_err());
        config.insert("hostId".into(), json!(" host-1 "));
        assert_eq!(host_id(&config).unwrap(), "host-1");
    }

    #[test]
    fn only_read_operations_are_offered() {
        assert!(READ_OPERATIONS.contains(&"automation.list"));
        assert!(!READ_OPERATIONS.contains(&"automation.delete"));
        assert!(!READ_OPERATIONS.contains(&"points.adjust"));
    }
}
