import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { getStateFilePath, isHooksInstalled } from './hooksInstaller.js';
import { parseTranscriptLine, type ParsedStatus } from './transcriptParser.js';

export class CursorWatcher implements vscode.Disposable {
  private watchers: fs.FSWatcher[] = [];
  private filePositions = new Map<string, number>();
  private fileSessionIds = new Map<string, string>();
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private transcriptsDir: string | null = null;
  private onStatusChange: (status: ParsedStatus) => void;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private dirWatcher: fs.FSWatcher | null = null;
  private hooksMode = false;
  private hooksWatcher: fs.FSWatcher | null = null;
  private hooksFilePos = 0;
  private didRealWork = false;
  private lastKnownSessionId: string | null = null;
  private log: vscode.OutputChannel;

  constructor(onStatusChange: (status: ParsedStatus) => void) {
    this.onStatusChange = onStatusChange;
    this.log = vscode.window.createOutputChannel('Cursor Pixel Agents');
  }

  start(workspacePath?: string): void {
    if (isHooksInstalled()) {
      this.log.appendLine('[start] Hooks detected — using hooks mode');
      this.hooksMode = true;
      this.startHooksWatcher();
      return;
    }

    const wsPath = workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.log.appendLine(`[start] workspace: ${wsPath} (transcript mode)`);
    this.transcriptsDir = this.findTranscriptsDir(wsPath);
    if (!this.transcriptsDir) {
      this.log.appendLine('[start] No transcripts directory found — watcher inactive');
      return;
    }

    this.log.appendLine(`[start] Watching: ${this.transcriptsDir}`);
    this.scanAll();

    try {
      this.dirWatcher = fs.watch(
        this.transcriptsDir,
        { persistent: false },
        (_event, filename) => {
          this.log.appendLine(`[fs.watch] event on dir, filename=${filename}`);
          this.scanAll();
        },
      );
      this.watchers.push(this.dirWatcher);
    } catch (e) {
      this.log.appendLine(`[start] fs.watch failed: ${e}`);
    }

    this.scanInterval = setInterval(() => this.scanAll(), 2000);
  }

  private startHooksWatcher(): void {
    const stateFile = getStateFilePath();
    this.log.appendLine(`[hooks] Watching state file: ${stateFile}`);

    if (fs.existsSync(stateFile)) {
      try {
        this.hooksFilePos = fs.statSync(stateFile).size;
      } catch {
        this.hooksFilePos = 0;
      }
    }

    const statusMap: Record<string, string> = {
      reading: 'Working...',
      editing: 'Working...',
      running: 'Working...',
      typing: 'Working...',
      searching: 'Working...',
      celebrating: 'Done!',
      phoning: 'Delegating...',
      error: 'Error',
      newSession: 'New Chat',
      sessionEnd: 'Chat Ended',
      toolDone: 'Tool Done',
    };

    const pollState = (): void => {
      let fd: number;
      try {
        if (!fs.existsSync(stateFile)) return;
        fd = fs.openSync(stateFile, 'r');
      } catch {
        return;
      }
      try {
        const stat = fs.fstatSync(fd);
        if (stat.size <= this.hooksFilePos) return;

        const bytesToRead = stat.size - this.hooksFilePos;
        const buf = Buffer.alloc(bytesToRead);
        fs.readSync(fd, buf, 0, bytesToRead, this.hooksFilePos);
        this.hooksFilePos = stat.size;

        const lines = buf.toString('utf-8').split('\n').filter((l) => l.trim());
        for (const line of lines) {
          this.processHooksLine(line, statusMap);
        }

        this.truncateStateFileIfLarge(stateFile, stat.size);
      } catch (e) {
        this.log.appendLine(`[hooks] Error reading state: ${e}`);
      } finally {
        try { fs.closeSync(fd); } catch { /* ignore */ }
      }
    };

    try {
      this.hooksWatcher = fs.watch(
        path.dirname(stateFile),
        { persistent: false },
        (_event, filename) => {
          if (filename === path.basename(stateFile)) {
            pollState();
          }
        },
      );
    } catch {
      this.log.appendLine(`[hooks] fs.watch on ${path.dirname(stateFile)} failed, falling back to polling`);
    }

    this.scanInterval = setInterval(pollState, 1000);
  }

  private processHooksLine(line: string, statusMap: Record<string, string>): void {
    try {
      const state = JSON.parse(line);
      let activity = state.activity || 'idle';
      const tool = state.tool || null;
      const sessionId = state.sessionId || undefined;
      const composerMode = state.composerMode || undefined;
      const isBackgroundAgent = typeof state.isBackgroundAgent === 'boolean'
        ? state.isBackgroundAgent
        : undefined;
      this.rememberSessionId(sessionId);

      if (activity === 'editing' || activity === 'running') {
        this.didRealWork = true;
      }
      if (activity === 'celebrating' && !this.didRealWork) {
        activity = 'idle';
      }
      if (activity === 'idle' || activity === 'celebrating') {
        this.didRealWork = false;
      }

      this.log.appendLine(
        `[hooks] ${activity}${tool ? ` (${tool})` : ''}${sessionId ? ` [${sessionId}]` : ''}${composerMode ? ` mode=${composerMode}` : ''}${isBackgroundAgent ? ' [bg]' : ''}`,
      );

      this.onStatusChange({
        activity: activity as ParsedStatus['activity'],
        statusText: statusMap[activity] || null,
        sessionId,
        tool: tool ?? undefined,
        composerMode,
        isBackgroundAgent,
      });
    } catch {
      this.log.appendLine(`[hooks] Skipping malformed line`);
    }
  }

  /** Prevent unbounded growth of the append-only state file */
  private truncateStateFileIfLarge(filePath: string, currentSize: number): void {
    const MAX_SIZE = 256 * 1024;
    if (currentSize <= MAX_SIZE) return;
    try {
      fs.writeFileSync(filePath, '', 'utf-8');
      this.hooksFilePos = 0;
      this.log.appendLine('[hooks] Truncated state file (exceeded 256 KB)');
    } catch {
      /* best-effort */
    }
  }

  private findTranscriptsDir(wsPath?: string): string | null {
    if (!wsPath) {
      this.log.appendLine('[find] No workspace path');
      return null;
    }

    const cursorRoot = path.join(os.homedir(), '.cursor', 'projects');
    if (!fs.existsSync(cursorRoot)) {
      this.log.appendLine(`[find] Cursor root missing: ${cursorRoot}`);
      return null;
    }

    const dirName = wsPath.replace(/[^a-zA-Z0-9-]/g, '-');
    const candidates = [dirName, dirName.replace(/^-+/, '')];

    this.log.appendLine(`[find] candidates: ${JSON.stringify(candidates)}`);

    for (const candidate of candidates) {
      const transcriptsDir = path.join(cursorRoot, candidate, 'agent-transcripts');
      if (fs.existsSync(transcriptsDir)) {
        this.log.appendLine(`[find] Match via candidate: ${candidate}`);
        return transcriptsDir;
      }
    }

    const wsBase = path.basename(wsPath);
    try {
      const dirs = fs.readdirSync(cursorRoot, { withFileTypes: true });
      for (const entry of dirs) {
        if (!entry.isDirectory() || !entry.name.includes(wsBase)) continue;
        const transcriptsDir = path.join(cursorRoot, entry.name, 'agent-transcripts');
        if (fs.existsSync(transcriptsDir)) {
          this.log.appendLine(`[find] Match via basename scan: ${entry.name}`);
          return transcriptsDir;
        }
      }
    } catch {
      /* ignore */
    }

    this.log.appendLine('[find] No match found in any candidate');
    return null;
  }

  private scanAll(): void {
    if (!this.transcriptsDir) return;

    try {
      const entries = fs.readdirSync(this.transcriptsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const jsonlPath = path.join(
          this.transcriptsDir,
          entry.name,
          entry.name + '.jsonl',
        );
        if (fs.existsSync(jsonlPath) && !this.filePositions.has(jsonlPath)) {
          const sessionId = entry.name;
          this.rememberSessionId(sessionId);
          this.log.appendLine(`[scan] New transcript (session ${sessionId}): ${entry.name}`);
          this.fileSessionIds.set(jsonlPath, sessionId);
          this.onStatusChange({
            activity: 'newSession',
            statusText: 'New Chat',
            sessionId,
          });
          this.watchFile(jsonlPath);
        }
        if (this.filePositions.has(jsonlPath)) {
          this.readNewContent(jsonlPath);
        }
      }
    } catch (e) {
      this.log.appendLine(`[scan] Error: ${e}`);
    }
  }

  private watchFile(filePath: string): void {
    try {
      const fd = fs.openSync(filePath, 'r');
      const stat = fs.fstatSync(fd);
      fs.closeSync(fd);
      this.filePositions.set(filePath, Math.max(0, stat.size - 500));
      this.log.appendLine(
        `[watch] ${path.basename(filePath)} from pos ${this.filePositions.get(filePath)}`,
      );

      const watcher = fs.watch(filePath, { persistent: false }, () => {
        this.readNewContent(filePath);
      });
      this.watchers.push(watcher);

      this.readNewContent(filePath);
    } catch (e) {
      this.log.appendLine(`[watch] Error: ${filePath} ${e}`);
    }
  }

  private readNewContent(filePath: string): void {
    const prevPos = this.filePositions.get(filePath) ?? 0;

    let fd: number;
    try {
      fd = fs.openSync(filePath, 'r');
    } catch {
      return;
    }

    try {
      const stat = fs.fstatSync(fd);
      if (stat.size <= prevPos) return;

      const bytesToRead = stat.size - prevPos;
      const buf = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buf, 0, buf.length, prevPos);
      this.filePositions.set(filePath, stat.size);

      this.log.appendLine(
        `[read] ${path.basename(filePath)} +${bytesToRead} bytes (${prevPos} -> ${stat.size})`,
      );

      const text = buf.toString('utf-8');
      const lines = text.split('\n').filter((l) => l.trim());
      const sessionId = this.fileSessionIds.get(filePath);

      for (const line of lines) {
        const status = parseTranscriptLine(line);
        if (!status) continue;
        if (sessionId) status.sessionId = sessionId;
        this.rememberSessionId(status.sessionId);
        this.log.appendLine(
          `[activity] ${status.activity}: ${status.statusText}${sessionId ? ` [${sessionId}]` : ''}`,
        );
        this.onStatusChange(status);
        if (status.activity !== 'idle') this.resetIdleTimer();
      }
    } catch (e) {
      this.log.appendLine(`[read] Error: ${e}`);
    } finally {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
  }

  private rememberSessionId(sessionId?: string): void {
    if (!sessionId) return;
    this.lastKnownSessionId = sessionId;
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.onStatusChange({
        activity: 'idle',
        statusText: null,
        sessionId: this.lastKnownSessionId ?? undefined,
      });
    }, 8000);
  }

  dispose(): void {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
    this.watchers = [];
    if (this.hooksWatcher) {
      try {
        this.hooksWatcher.close();
      } catch {
        /* ignore */
      }
      this.hooksWatcher = null;
    }
    if (this.scanInterval) clearInterval(this.scanInterval);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.filePositions.clear();
    this.fileSessionIds.clear();
    this.lastKnownSessionId = null;
    this.log.dispose();
  }
}
