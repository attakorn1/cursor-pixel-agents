import { useEffect, useState } from 'react';

import {
  CHARACTER_SITTING_OFFSET_PX,
  STATUS_FADE_DURATION_SEC,
  TOOL_OVERLAY_VERTICAL_OFFSET,
} from '../../constants.js';
import type { SubagentCharacter } from '../../hooks/useExtensionMessages.js';
import { isSittingState } from '../engine/characters.js';
import type { OfficeState } from '../engine/officeState.js';
import type { Character, ToolActivity } from '../types.js';
import { TILE_SIZE } from '../types.js';

interface ToolOverlayProps {
  officeState: OfficeState;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  subagentCharacters: SubagentCharacter[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  onCloseAgent: (id: number) => void;
}

function getDetailedActivityText(
  ch: Character,
  tools: ToolActivity[] | undefined,
  subagentCharacters: SubagentCharacter[],
): string {
  if (ch.isSubagent) {
    if (ch.bubbleType === 'permission') return 'Needs approval';
    const sub = subagentCharacters.find((s) => s.id === ch.id);
    return sub ? sub.label : 'Subtask';
  }
  if (!tools || tools.length === 0) return ch.statusText || 'Idle';

  const activeTool = [...tools].reverse().find((t) => !t.done);
  if (activeTool) {
    return activeTool.permissionWait ? 'Needs approval' : activeTool.status;
  }
  if (ch.isActive) {
    return tools[tools.length - 1]?.status ?? (ch.statusText || 'Idle');
  }
  return ch.statusText || 'Idle';
}

function getDotColor(
  ch: Character,
  tools: ToolActivity[] | undefined,
): string | null {
  const hasPermission =
    (ch.isSubagent && ch.bubbleType === 'permission') ||
    tools?.some((t) => t.permissionWait && !t.done);
  if (hasPermission) return 'var(--pixel-status-permission)';
  if (ch.isActive && tools?.some((t) => !t.done)) return 'var(--pixel-status-active)';
  return null;
}

export function ToolOverlay({
  officeState,
  agents,
  agentTools,
  subagentCharacters,
  containerRef,
  zoom,
  panRef,
  onCloseAgent,
}: ToolOverlayProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const el = containerRef.current;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);

  const selectedId = officeState.selectedAgentId;
  const hoveredId = officeState.hoveredAgentId;
  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)];

  return (
    <>
      {allIds.map((id) => {
        const ch = officeState.characters.get(id);
        if (!ch || ch.matrixEffect) return null;

        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;
        const autoVisible = ch.statusVisibleTimer > 0;
        if (!isSelected && !isHovered && !autoVisible) return null;

        let opacity = 1.0;
        if (!isSelected && !isHovered && ch.statusVisibleTimer < STATUS_FADE_DURATION_SEC) {
          opacity = Math.max(0, ch.statusVisibleTimer / STATUS_FADE_DURATION_SEC);
        }

        const sittingOffset = isSittingState(ch.state) ? CHARACTER_SITTING_OFFSET_PX : 0;
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
        const screenY =
          (deviceOffsetY + (ch.y + sittingOffset - TOOL_OVERLAY_VERTICAL_OFFSET) * zoom) / dpr;

        const tools = agentTools[id];
        const activityText = (isSelected || isHovered)
          ? getDetailedActivityText(ch, tools, subagentCharacters)
          : ch.statusText;
        if (!activityText) return null;

        const dotColor = getDotColor(ch, tools);
        const isSub = ch.isSubagent;
        const hasPermission =
          (isSub && ch.bubbleType === 'permission') ||
          tools?.some((t) => t.permissionWait && !t.done);

        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY - 24,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: isSelected ? 'auto' : 'none',
              zIndex: isSelected ? 'var(--pixel-overlay-selected-z)' : 'var(--pixel-overlay-z)',
              opacity,
              transition: opacity < 1 ? undefined : 'opacity 0.15s ease-out',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(30, 30, 46, 0.7)',
                border: isSelected
                  ? '1px solid rgba(106, 106, 138, 0.5)'
                  : '1px solid rgba(74, 74, 106, 0.4)',
                borderRadius: 0,
                padding: isSelected ? '2px 4px 2px 6px' : '2px 6px',
                backdropFilter: 'blur(4px)',
                whiteSpace: 'nowrap',
                maxWidth: 180,
              }}
            >
              {dotColor && (
                <span
                  className={ch.isActive && !hasPermission ? 'pixel-agents-pulse' : undefined}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ overflow: 'hidden' }}>
                <span
                  style={{
                    fontSize: isSub ? '11px' : '12px',
                    fontStyle: isSub ? 'italic' : undefined,
                    color: 'var(--vscode-foreground)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'block',
                  }}
                >
                  {activityText}
                </span>
                {ch.folderName && (
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--pixel-text-dim)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'block',
                    }}
                  >
                    {ch.folderName}
                  </span>
                )}
              </div>
              {isSelected && !isSub && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseAgent(id);
                  }}
                  title="Close agent"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--pixel-close-text)',
                    cursor: 'pointer',
                    padding: '0 2px',
                    fontSize: '14px',
                    lineHeight: 1,
                    marginLeft: 2,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--pixel-close-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--pixel-close-text)';
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
