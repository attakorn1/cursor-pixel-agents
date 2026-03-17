/** Map status prefixes back to tool names for animation selection */
export const STATUS_TO_TOOL: Record<string, string> = {
  Reading: 'Read',
  Searching: 'Grep',
  Globbing: 'Glob',
  Fetching: 'WebFetch',
  'Searching web': 'WebSearch',
  Writing: 'Write',
  Editing: 'Edit',
  Running: 'Bash',
  Task: 'Task',
};

export function extractToolName(status: string): string | null {
  for (const [prefix, tool] of Object.entries(STATUS_TO_TOOL)) {
    if (status.startsWith(prefix)) return tool;
  }
  const first = status.split(/[\s:]/)[0];
  return first || null;
}

import { TILE_SIZE, ZOOM_DEFAULT_DPR_FACTOR, ZOOM_MAX, ZOOM_MIN } from '../constants.js';

/** Compute a default integer zoom level (device pixels per sprite pixel) */
export function defaultZoom(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(ZOOM_MIN, Math.round(ZOOM_DEFAULT_DPR_FACTOR * dpr));
}

/**
 * Compute zoom level that fits the scene (cols × rows) into the given
 * container dimensions (in CSS pixels). Returns a fractional zoom clamped
 * to [ZOOM_MIN, ZOOM_MAX].
 */
export function computeFitZoom(
  containerWidth: number,
  containerHeight: number,
  cols: number,
  rows: number,
): number {
  if (cols <= 0 || rows <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return defaultZoom();
  }
  const dpr = window.devicePixelRatio || 1;
  const canvasW = containerWidth * dpr;
  const canvasH = containerHeight * dpr;
  const fitZoom = Math.min(canvasW / (cols * TILE_SIZE), canvasH / (rows * TILE_SIZE));
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom));
}
