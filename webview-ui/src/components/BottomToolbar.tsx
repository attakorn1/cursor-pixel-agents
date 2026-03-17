import { useState } from 'react';

import { SettingsModal } from './SettingsModal.js';

interface BottomToolbarProps {
  isEditMode: boolean;
  onToggleEditMode: () => void;
  lockView: boolean;
  onToggleLockView: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 6,
  left: 6,
  zIndex: 'var(--pixel-controls-z)',
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  background: 'rgba(30, 30, 46, 0.55)',
  border: '1px solid rgba(74, 74, 106, 0.4)',
  borderRadius: 0,
  padding: '2px 3px',
  backdropFilter: 'blur(4px)',
};

const btnBase: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: '13px',
  color: 'rgba(255, 255, 255, 0.6)',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
  letterSpacing: '0.5px',
};

const btnActive: React.CSSProperties = {
  ...btnBase,
  color: 'rgba(255, 255, 255, 0.85)',
  background: 'rgba(90, 140, 255, 0.2)',
  border: '1px solid rgba(90, 140, 255, 0.5)',
};

export function BottomToolbar({
  isEditMode,
  onToggleEditMode,
  lockView,
  onToggleLockView,
  isDebugMode,
  onToggleDebugMode,
}: BottomToolbarProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div style={panelStyle}>

      <button
        onClick={onToggleEditMode}
        onMouseEnter={() => setHovered('edit')}
        onMouseLeave={() => setHovered(null)}
        style={
          isEditMode
            ? { ...btnActive }
            : {
                ...btnBase,
                background: hovered === 'edit' ? 'rgba(255, 255, 255, 0.08)' : btnBase.background,
              }
        }
        title="Edit office layout"
      >
        Layout
      </button>
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setIsSettingsOpen((v) => !v)}
          onMouseEnter={() => setHovered('settings')}
          onMouseLeave={() => setHovered(null)}
          style={
            isSettingsOpen
              ? { ...btnActive }
              : {
                  ...btnBase,
                  background:
                    hovered === 'settings' ? 'rgba(255, 255, 255, 0.08)' : btnBase.background,
                }
          }
          title="Settings"
        >
          Settings
        </button>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          lockView={lockView}
          onToggleLockView={onToggleLockView}
          isDebugMode={isDebugMode}
          onToggleDebugMode={onToggleDebugMode}
        />
      </div>
    </div>
  );
}
