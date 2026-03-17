import { useState } from 'react';

import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import { vscode } from '../vscodeApi.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lockView: boolean;
  onToggleLockView: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
}

const menuItemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '4px 8px',
  fontSize: '13px',
  color: 'rgba(255, 255, 255, 0.7)',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  textAlign: 'left',
  letterSpacing: '0.3px',
  whiteSpace: 'nowrap',
};

function MenuItem({
  id,
  hovered,
  setHovered,
  onClick,
  children,
}: {
  id: string;
  hovered: string | null;
  setHovered: (v: string | null) => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(id)}
      onMouseLeave={() => setHovered(null)}
      style={{
        ...menuItemBase,
        background: hovered === id ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        border: '1px solid rgba(255, 255, 255, 0.35)',
        borderRadius: 0,
        background: checked ? 'rgba(90, 140, 255, 0.7)' : 'transparent',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '8px',
        lineHeight: 1,
        color: '#fff',
      }}
    >
      {checked ? 'X' : ''}
    </span>
  );
}

export function SettingsModal({
  isOpen,
  onClose,
  lockView,
  onToggleLockView,
  isDebugMode,
  onToggleDebugMode,
}: SettingsModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled);

  if (!isOpen) return null;

  const menuItemProps = { hovered, setHovered };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 49,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 4,
          zIndex: 50,
          background: 'rgba(30, 30, 46, 0.85)',
          border: '1px solid rgba(74, 74, 106, 0.45)',
          borderRadius: 0,
          padding: '3px',
          backdropFilter: 'blur(8px)',
          minWidth: 180,
          whiteSpace: 'nowrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '3px 8px',
            borderBottom: '1px solid rgba(74, 74, 106, 0.3)',
            marginBottom: '2px',
          }}
        >
          <span
            style={{
              fontSize: '13px',
              color: 'rgba(255, 255, 255, 0.8)',
              letterSpacing: '0.3px',
            }}
          >
            Settings
          </span>
          <button
            onClick={onClose}
            onMouseEnter={() => setHovered('close')}
            onMouseLeave={() => setHovered(null)}
            style={{
              background:
                hovered === 'close' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'rgba(255, 255, 255, 0.45)',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '0 3px',
              lineHeight: 1,
            }}
          >
            X
          </button>
        </div>
        <MenuItem
          id="sessions"
          {...menuItemProps}
          onClick={() => {
            vscode.postMessage({ type: 'openSessionsFolder' });
            onClose();
          }}
        >
          Open Sessions Folder
        </MenuItem>
        <MenuItem
          id="export"
          {...menuItemProps}
          onClick={() => {
            vscode.postMessage({ type: 'exportLayout' });
            onClose();
          }}
        >
          Export Layout
        </MenuItem>
        <MenuItem
          id="import"
          {...menuItemProps}
          onClick={() => {
            vscode.postMessage({ type: 'importLayout' });
            onClose();
          }}
        >
          Import Layout
        </MenuItem>
        <MenuItem id="lockView" {...menuItemProps} onClick={onToggleLockView}>
          <span>Lock View</span>
          <Checkbox checked={lockView} />
        </MenuItem>
        <MenuItem
          id="sound"
          {...menuItemProps}
          onClick={() => {
            const newVal = !isSoundEnabled();
            setSoundEnabled(newVal);
            setSoundLocal(newVal);
            vscode.postMessage({ type: 'setSoundEnabled', enabled: newVal });
          }}
        >
          <span>Sound Notifications</span>
          <Checkbox checked={soundLocal} />
        </MenuItem>
        <MenuItem id="debug" {...menuItemProps} onClick={onToggleDebugMode}>
          <span>Debug View</span>
          {isDebugMode && (
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'rgba(90, 140, 255, 0.7)',
                flexShrink: 0,
              }}
            />
          )}
        </MenuItem>
      </div>
    </>
  );
}
