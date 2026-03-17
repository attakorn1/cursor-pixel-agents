import {
  COMPLETED_DURATION_SEC,
  IDLE_BEHAVIOR_MAX_SEC,
  IDLE_BEHAVIOR_MIN_SEC,
  IDLE_STRETCHING_DURATION_SEC,
  SEAT_REST_MAX_SEC,
  SEAT_REST_MIN_SEC,
  STATUS_IDLE_VISIBLE_DURATION_SEC,
  STATUS_VISIBLE_DURATION_SEC,
  TYPE_FRAME_DURATION_SEC,
  WALK_FRAME_DURATION_SEC,
  WALK_SPEED_PX_PER_SEC,
  WANDER_MOVES_BEFORE_REST_MAX,
  WANDER_MOVES_BEFORE_REST_MIN,
  WANDER_PAUSE_MAX_SEC,
  WANDER_PAUSE_MIN_SEC,
  WORK_THINKING_DURATION_SEC,
} from '../../constants.js';
import { findPath } from '../layout/tileMap.js';
import type { CharacterSprites } from '../sprites/spriteData.js';
import type { Character, Seat, SpriteData, TileType as TileTypeVal } from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';

// ── Tool → Working State Mapping ─────────────────────────────

const TOOL_TO_WORK_STATE: Record<string, CharacterState> = {
  Read: CharacterState.WORK_READING,
  Grep: CharacterState.WORK_READING,
  Glob: CharacterState.WORK_READING,
  WebFetch: CharacterState.WORK_READING,
  WebSearch: CharacterState.WORK_READING,
  Write: CharacterState.WORK_TYPING,
  StrReplace: CharacterState.WORK_TYPING,
  Shell: CharacterState.WORK_TYPING,
  Edit: CharacterState.WORK_TYPING,
  Bash: CharacterState.WORK_TYPING,
  Task: CharacterState.WORK_THINKING,
};

export function getWorkStateForTool(tool: string | null): CharacterState {
  if (!tool) return CharacterState.WORK_TYPING;
  return TOOL_TO_WORK_STATE[tool] ?? CharacterState.WORK_TYPING;
}

/** @deprecated Use getWorkStateForTool instead */
export function isReadingTool(tool: string | null): boolean {
  if (!tool) return false;
  return getWorkStateForTool(tool) === CharacterState.WORK_READING;
}

// ── Office-Style Status Text ─────────────────────────────────

const TOOL_STATUS_TEXT: Record<string, string> = {
  Read: 'Reading documents',
  Grep: 'Searching codebase',
  Glob: 'Browsing files',
  WebFetch: 'Browsing the web',
  WebSearch: 'Searching online',
  Write: 'Writing code',
  StrReplace: 'Editing code',
  Shell: 'Running terminal',
  Bash: 'Running terminal',
  Edit: 'Editing code',
  Task: 'Delegating task',
};

const STATE_STATUS_TEXT: Partial<Record<CharacterState, string>> = {
  [CharacterState.IDLE_SITTING]: '',
  [CharacterState.IDLE_CASUAL_TYPE]: 'Checking emails',
  [CharacterState.IDLE_READING]: 'Reviewing notes',
  [CharacterState.IDLE_THINKING]: 'Thinking...',
  [CharacterState.IDLE_COFFEE]: 'Coffee break',
  [CharacterState.IDLE_STRETCHING]: 'Stretching',
  [CharacterState.WORK_TYPING]: 'Working',
  [CharacterState.WORK_READING]: 'Reviewing',
  [CharacterState.WORK_THINKING]: 'Thinking...',
  [CharacterState.COMPLETED]: 'Done!',
};

export function getStatusTextForTool(tool: string | null): string {
  if (!tool) return 'Working';
  return TOOL_STATUS_TEXT[tool] ?? 'Working';
}

export function getStatusTextForState(state: CharacterState): string {
  return STATE_STATUS_TEXT[state] ?? '';
}

/** Show the status overlay above a character for a given duration */
export function showStatus(ch: Character, text: string, duration: number): void {
  if (!text) return;
  ch.statusText = text;
  ch.statusVisibleTimer = duration;
}

// ── Idle Behavior Scheduler ──────────────────────────────────

interface IdleBehavior {
  state: CharacterState;
  weight: number;
}

const IDLE_BEHAVIORS: IdleBehavior[] = [
  { state: CharacterState.IDLE_SITTING, weight: 3 },
  { state: CharacterState.IDLE_CASUAL_TYPE, weight: 2 },
  { state: CharacterState.IDLE_READING, weight: 2 },
  { state: CharacterState.IDLE_THINKING, weight: 1 },
  { state: CharacterState.IDLE_COFFEE, weight: 1 },
  { state: CharacterState.IDLE_STRETCHING, weight: 1 },
];

const IDLE_BEHAVIOR_TOTAL_WEIGHT = IDLE_BEHAVIORS.reduce((sum, b) => sum + b.weight, 0);

function pickRandomIdleBehavior(): CharacterState {
  let roll = Math.random() * IDLE_BEHAVIOR_TOTAL_WEIGHT;
  for (const b of IDLE_BEHAVIORS) {
    roll -= b.weight;
    if (roll <= 0) return b.state;
  }
  return CharacterState.IDLE_SITTING;
}

// ── Helpers for state categorization ─────────────────────────

const IDLE_BEHAVIOR_STATES: ReadonlySet<CharacterState> = new Set([
  CharacterState.IDLE_SITTING,
  CharacterState.IDLE_CASUAL_TYPE,
  CharacterState.IDLE_READING,
  CharacterState.IDLE_THINKING,
  CharacterState.IDLE_COFFEE,
  CharacterState.IDLE_STRETCHING,
]);

const SITTING_STATES: ReadonlySet<CharacterState> = new Set([
  CharacterState.TYPE,
  CharacterState.WORK_TYPING,
  CharacterState.WORK_READING,
  CharacterState.WORK_THINKING,
  CharacterState.IDLE_SITTING,
  CharacterState.IDLE_CASUAL_TYPE,
  CharacterState.IDLE_READING,
  CharacterState.IDLE_THINKING,
  CharacterState.IDLE_COFFEE,
]);

const WORKING_STATES: ReadonlySet<CharacterState> = new Set([
  CharacterState.TYPE,
  CharacterState.WORK_TYPING,
  CharacterState.WORK_READING,
  CharacterState.WORK_THINKING,
]);

export function isIdleBehaviorState(state: CharacterState): boolean {
  return IDLE_BEHAVIOR_STATES.has(state);
}

export function isSittingState(state: CharacterState): boolean {
  return SITTING_STATES.has(state);
}

export function isWorkingState(state: CharacterState): boolean {
  return WORKING_STATES.has(state);
}

// ── Geometry Helpers ─────────────────────────────────────────

function tileCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

function directionBetween(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): Direction {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  if (dc > 0) return Direction.RIGHT;
  if (dc < 0) return Direction.LEFT;
  if (dr > 0) return Direction.DOWN;
  return Direction.UP;
}

// ── Character Creation ───────────────────────────────────────

export function createCharacter(
  id: number,
  palette: number,
  seatId: string | null,
  seat: Seat | null,
  hueShift = 0,
): Character {
  const col = seat ? seat.seatCol : 1;
  const row = seat ? seat.seatRow : 1;
  const center = tileCenter(col, row);
  return {
    id,
    state: CharacterState.WORK_TYPING,
    dir: seat ? seat.facingDir : Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    currentTool: null,
    palette,
    hueShift,
    frame: 0,
    frameTimer: 0,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX),
    isActive: true,
    seatId,
    bubbleType: null,
    bubbleTimer: 0,
    seatTimer: 0,
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
    idleBehaviorTimer: randomRange(IDLE_BEHAVIOR_MIN_SEC, IDLE_BEHAVIOR_MAX_SEC),
    idleBehaviorIndex: 0,
    completedTimer: 0,
    statusVisibleTimer: STATUS_VISIBLE_DURATION_SEC,
    statusText: 'Starting up',
  };
}

// ── Shared FSM Helpers ───────────────────────────────────────

export function clearIdleBubble(ch: Character): void {
  if (ch.bubbleType === 'thinking' || ch.bubbleType === 'coffee') {
    ch.bubbleType = null;
    ch.bubbleTimer = 0;
  }
}

function resetAnimation(ch: Character): void {
  ch.frame = 0;
  ch.frameTimer = 0;
}

function resetWander(ch: Character): void {
  ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
  ch.wanderCount = 0;
  ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX);
}

/** Transition to IDLE_SITTING and prepare for wander cycle */
function enterIdleWithWander(ch: Character): void {
  enterIdleSitting(ch);
  resetWander(ch);
}

/**
 * If active, walk to seat or snap to working state.
 * Returns true if the character was transitioned (caller should return).
 */
function startWorkOrWalkToSeat(
  ch: Character,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): boolean {
  if (!ch.isActive) return false;
  clearIdleBubble(ch);
  if (!ch.seatId) {
    ch.state = CharacterState.WORK_TYPING;
    resetAnimation(ch);
    return true;
  }
  const seat = seats.get(ch.seatId);
  if (!seat) return true;
  const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles);
  if (path.length > 0) {
    ch.path = path;
    ch.moveProgress = 0;
    ch.state = CharacterState.WALK;
  } else {
    ch.state = CharacterState.WORK_TYPING;
    ch.dir = seat.facingDir;
  }
  resetAnimation(ch);
  return true;
}

// ── Idle Behavior Transition ─────────────────────────────────

function transitionToIdleBehavior(ch: Character): void {
  const nextState = pickRandomIdleBehavior();
  ch.state = nextState;
  resetAnimation(ch);
  ch.idleBehaviorTimer = nextState === CharacterState.IDLE_STRETCHING
    ? IDLE_STRETCHING_DURATION_SEC
    : randomRange(IDLE_BEHAVIOR_MIN_SEC, IDLE_BEHAVIOR_MAX_SEC);

  if (nextState === CharacterState.IDLE_THINKING) {
    ch.bubbleType = 'thinking';
    ch.bubbleTimer = 0;
  } else if (nextState === CharacterState.IDLE_COFFEE) {
    ch.bubbleType = 'coffee';
    ch.bubbleTimer = 0;
  } else {
    clearIdleBubble(ch);
  }

  const text = getStatusTextForState(nextState);
  if (text) {
    showStatus(ch, text, STATUS_IDLE_VISIBLE_DURATION_SEC);
  }
}

function enterIdleSitting(ch: Character): void {
  ch.state = CharacterState.IDLE_SITTING;
  resetAnimation(ch);
  ch.idleBehaviorTimer = randomRange(IDLE_BEHAVIOR_MIN_SEC, IDLE_BEHAVIOR_MAX_SEC);
  clearIdleBubble(ch);
}

// ── FSM Update ───────────────────────────────────────────────

export function updateCharacter(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): void {
  ch.frameTimer += dt;

  // Count down status overlay visibility
  // Hold visible while agent is active; otherwise count down
  if (ch.isActive) {
    if (ch.statusVisibleTimer < 1) ch.statusVisibleTimer = 1;
  } else if (ch.statusVisibleTimer > 0) {
    ch.statusVisibleTimer -= dt;
  }

  switch (ch.state) {
    case CharacterState.TYPE:
    case CharacterState.WORK_TYPING:
    case CharacterState.WORK_READING:
      updateWorkingState(ch, dt);
      break;

    case CharacterState.WORK_THINKING:
      updateWorkThinking(ch, dt);
      break;

    case CharacterState.COMPLETED:
      updateCompleted(ch, dt);
      break;

    case CharacterState.IDLE_SITTING:
    case CharacterState.IDLE_CASUAL_TYPE:
    case CharacterState.IDLE_READING:
    case CharacterState.IDLE_THINKING:
    case CharacterState.IDLE_COFFEE:
    case CharacterState.IDLE_STRETCHING:
      updateIdleBehavior(ch, dt, walkableTiles, seats, tileMap, blockedTiles);
      break;

    case CharacterState.IDLE:
      updateStandingIdle(ch, dt, walkableTiles, seats, tileMap, blockedTiles);
      break;

    case CharacterState.WALK:
      updateWalk(ch, dt, seats, tileMap, blockedTiles);
      break;
  }
}

// ── Working State Updates ────────────────────────────────────

/** Shared seat-timer check: returns true if still waiting on seat timer */
function waitOnSeatTimer(ch: Character, dt: number): boolean {
  if (ch.seatTimer > 0) {
    ch.seatTimer -= dt;
    return true;
  }
  ch.seatTimer = 0;
  return false;
}

function updateWorkingState(ch: Character, dt: number): void {
  if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
    ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
    ch.frame = (ch.frame + 1) % 2;
  }
  if (!ch.isActive && !waitOnSeatTimer(ch, dt)) {
    enterIdleWithWander(ch);
  }
}

function updateWorkThinking(ch: Character, dt: number): void {
  if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
    ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
    ch.frame = 0;
  }
  if (!ch.isActive) {
    if (waitOnSeatTimer(ch, dt)) return;
    clearIdleBubble(ch);
    enterIdleWithWander(ch);
    return;
  }
  ch.completedTimer += dt;
  if (ch.completedTimer >= WORK_THINKING_DURATION_SEC) {
    ch.state = CharacterState.WORK_TYPING;
    resetAnimation(ch);
    ch.completedTimer = 0;
    clearIdleBubble(ch);
  }
}

function updateCompleted(ch: Character, dt: number): void {
  ch.completedTimer += dt;
  if (ch.completedTimer >= COMPLETED_DURATION_SEC) {
    ch.completedTimer = 0;
    enterIdleWithWander(ch);
  }
}

// ── Wander Helpers ───────────────────────────────────────────

/** Try to walk to a random tile. Returns true if a path was found and walk started. */
function tryWanderToRandomTile(
  ch: Character,
  walkableTiles: Array<{ col: number; row: number }>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): boolean {
  if (walkableTiles.length === 0) return false;
  const target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
  const path = findPath(ch.tileCol, ch.tileRow, target.col, target.row, tileMap, blockedTiles);
  if (path.length === 0) return false;
  clearIdleBubble(ch);
  ch.path = path;
  ch.moveProgress = 0;
  ch.state = CharacterState.WALK;
  resetAnimation(ch);
  ch.wanderCount++;
  return true;
}

/** Try to walk back to assigned seat. Returns true if walk started. */
function tryWalkToSeat(
  ch: Character,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): boolean {
  if (!ch.seatId) return false;
  const seat = seats.get(ch.seatId);
  if (!seat) return false;
  const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles);
  if (path.length === 0) return false;
  ch.path = path;
  ch.moveProgress = 0;
  ch.state = CharacterState.WALK;
  resetAnimation(ch);
  return true;
}

/** Process wander timer: handles both "return to seat" and "wander to random tile" */
function processWanderTimer(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): void {
  ch.wanderTimer -= dt;
  if (ch.wanderTimer > 0) return;

  if (ch.wanderCount >= ch.wanderLimit && ch.seatId) {
    if (tryWalkToSeat(ch, seats, tileMap, blockedTiles)) return;
    resetWander(ch);
    return;
  }

  tryWanderToRandomTile(ch, walkableTiles, tileMap, blockedTiles);
  ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
}

// ── Idle Behavior Update (seated idle sub-states) ──

function updateIdleBehavior(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): void {
  if (ch.state === CharacterState.IDLE_CASUAL_TYPE || ch.state === CharacterState.IDLE_READING) {
    if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
      ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
      ch.frame = (ch.frame + 1) % 2;
    }
  } else {
    ch.frame = 0;
  }

  if (ch.seatTimer < 0) ch.seatTimer = 0;
  if (startWorkOrWalkToSeat(ch, seats, tileMap, blockedTiles)) return;

  ch.idleBehaviorTimer -= dt;
  if (ch.idleBehaviorTimer <= 0) {
    transitionToIdleBehavior(ch);
  }

  processWanderTimer(ch, dt, walkableTiles, seats, tileMap, blockedTiles);
}

// ── Standing Idle Update (legacy IDLE — standing, wandering) ──

function updateStandingIdle(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): void {
  ch.frame = 0;
  if (ch.seatTimer < 0) ch.seatTimer = 0;
  if (startWorkOrWalkToSeat(ch, seats, tileMap, blockedTiles)) return;

  processWanderTimer(ch, dt, walkableTiles, seats, tileMap, blockedTiles);
}

// ── Walk Update ──────────────────────────────────────────────

function updateWalk(
  ch: Character,
  dt: number,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): void {
  if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
    ch.frameTimer -= WALK_FRAME_DURATION_SEC;
    ch.frame = (ch.frame + 1) % 4;
  }

  if (ch.path.length === 0) {
    const center = tileCenter(ch.tileCol, ch.tileRow);
    ch.x = center.x;
    ch.y = center.y;

    if (ch.isActive) {
      if (!ch.seatId) {
        ch.state = CharacterState.WORK_TYPING;
      } else {
        const seat = seats.get(ch.seatId);
        if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
          ch.state = getWorkStateForTool(ch.currentTool);
          ch.dir = seat.facingDir;
        } else {
          ch.state = CharacterState.IDLE;
        }
      }
    } else {
      if (ch.seatId) {
        const seat = seats.get(ch.seatId);
        if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
          ch.dir = seat.facingDir;
          if (ch.seatTimer < 0) {
            ch.seatTimer = 0;
          } else {
            ch.seatTimer = randomRange(SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC);
          }
          enterIdleSitting(ch);
          ch.wanderCount = 0;
          ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX);
          return;
        }
      }
      ch.state = CharacterState.IDLE;
      ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
    }
    resetAnimation(ch);
    return;
  }

  const nextTile = ch.path[0];
  ch.dir = directionBetween(ch.tileCol, ch.tileRow, nextTile.col, nextTile.row);

  ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt;

  const fromCenter = tileCenter(ch.tileCol, ch.tileRow);
  const toCenter = tileCenter(nextTile.col, nextTile.row);
  const t = Math.min(ch.moveProgress, 1);
  ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * t;
  ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * t;

  if (ch.moveProgress >= 1) {
    ch.tileCol = nextTile.col;
    ch.tileRow = nextTile.row;
    ch.x = toCenter.x;
    ch.y = toCenter.y;
    ch.path.shift();
    ch.moveProgress = 0;
  }

  if (ch.isActive && ch.seatId) {
    const seat = seats.get(ch.seatId);
    if (seat) {
      const lastStep = ch.path[ch.path.length - 1];
      if (!lastStep || lastStep.col !== seat.seatCol || lastStep.row !== seat.seatRow) {
        const newPath = findPath(
          ch.tileCol, ch.tileRow,
          seat.seatCol, seat.seatRow,
          tileMap, blockedTiles,
        );
        if (newPath.length > 0) {
          ch.path = newPath;
          ch.moveProgress = 0;
        }
      }
    }
  }
}

// ── Sprite Selection ─────────────────────────────────────────

/** Get the correct sprite frame for a character's current state and direction */
export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  switch (ch.state) {
    case CharacterState.TYPE:
      return isReadingTool(ch.currentTool)
        ? sprites.reading[ch.dir][ch.frame % 2]
        : sprites.typing[ch.dir][ch.frame % 2];

    case CharacterState.WORK_TYPING:
    case CharacterState.IDLE_CASUAL_TYPE:
      return sprites.typing[ch.dir][ch.frame % 2];

    case CharacterState.WORK_READING:
    case CharacterState.IDLE_READING:
      return sprites.reading[ch.dir][ch.frame % 2];

    case CharacterState.IDLE_STRETCHING:
      return sprites.walk[ch.dir][0];

    case CharacterState.WALK:
      return sprites.walk[ch.dir][ch.frame % 4];

    default:
      return sprites.walk[ch.dir][1];
  }
}

// ── Utilities ────────────────────────────────────────────────

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
