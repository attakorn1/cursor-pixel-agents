#!/bin/bash
STATE_DIR="${TMPDIR:-/tmp}"
STATE_FILE="${STATE_DIR}/cursor-pixel-agents-state.jsonl"
input=$(cat)
event=$(echo "$input" | grep -o '"hook_event_name":"[^"]*"' | head -1 | cut -d'"' -f4)
session_id=$(echo "$input" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$session_id" ]; then
  session_id=$(echo "$input" | grep -o '"conversation_id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi
composer_mode=$(echo "$input" | grep -o '"composer_mode":"[^"]*"' | head -1 | cut -d'"' -f4)
is_bg=$(echo "$input" | grep -o '"is_background_agent":\(true\|false\)' | head -1 | grep -o '\(true\|false\)')

write_state() {
  local activity="$1"
  local tool="${2:-}"
  local extra=""
  if [ -n "$session_id" ]; then
    extra="$(printf ',"sessionId":"%s"' "$session_id")"
  fi
  if [ -n "$tool" ]; then
    extra="${extra}$(printf ',"tool":"%s"' "$tool")"
  fi
  if [ -n "$composer_mode" ]; then
    extra="${extra}$(printf ',"composerMode":"%s"' "$composer_mode")"
  fi
  if [ -n "$is_bg" ]; then
    extra="${extra}$(printf ',"isBackgroundAgent":%s' "$is_bg")"
  fi
  printf '{"activity":"%s","ts":%d%s}\n' "$activity" "$(date +%s)" "$extra" >> "$STATE_FILE"
}

case "$event" in
  preToolUse)
    tool=$(echo "$input" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4)
    case "$tool" in
      Read|Glob|SemanticSearch|Grep) activity="reading" ;;
      Write|StrReplace|EditNotebook|Delete) activity="editing" ;;
      Shell) activity="running" ;;
      Task) activity="phoning" ;;
      *) activity="typing" ;;
    esac
    write_state "$activity" "$tool"
    ;;
  postToolUse)
    tool=$(echo "$input" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4)
    write_state "toolDone" "$tool"
    ;;
  subagentStart)
    write_state "phoning"
    ;;
  subagentStop)
    write_state "typing"
    ;;
  stop)
    status=$(echo "$input" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    case "$status" in
      completed)
        write_state "celebrating"
        ;;
      error)
        write_state "error"
        ;;
      *)
        write_state "idle"
        ;;
    esac
    ;;
  beforeSubmitPrompt)
    write_state "idle"
    ;;
  sessionStart)
    write_state "newSession"
    ;;
  sessionEnd)
    write_state "sessionEnd"
    ;;
esac

exit 0
