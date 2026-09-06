# Ctrl runtime logs

The running MakeShift agent writes structured newline-delimited JSON logs to:

```text
%APPDATA%\makeshift-ctrl\logs\agent-YYYY-MM-DD.ndjson
```

Each entry contains an ISO timestamp, an event name, and non-secret diagnostic
context. This includes device connection transitions, cue glyphs, completed and
failed cue executions, Home Assistant media actions, system-action results, and
serial recovery events. A single line is a complete JSON object, allowing a
specific time window or event name to be searched without parsing a full file.

Agent logs are retained for 90 days. Credentials and private configuration are
not intentionally written to these logs. Logs begin when the agent next starts
or reloads.
