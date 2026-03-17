import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  loadCharacterSprites,
  loadDefaultLayout,
  loadFloorTiles,
  loadFurnitureAssets,
  loadWallTiles,
  sendAssetsToWebview,
  sendCharacterSpritesToWebview,
  sendFloorTilesToWebview,
  sendWallTilesToWebview,
} from './assetLoader.js';
import {
  GLOBAL_KEY_SOUND_ENABLED,
  GLOBAL_KEY_VIEW_STATE,
  WORKSPACE_KEY_AGENT_SEATS,
} from './constants.js';
import { CursorWatcher } from './cursorWatcher.js';
import type { LayoutWatcher } from './layoutPersistence.js';
import {
  migrateAndLoadLayout,
  readLayoutFromFile,
  watchLayoutFile,
  writeLayoutToFile,
} from './layoutPersistence.js';
import type { AgentActivityType, ParsedStatus } from './transcriptParser.js';

const FALLBACK_SESSION = '__default__';

const ACTIVITY_TO_TOOL: Record<string, string> = {
  reading: 'Read',
  editing: 'StrReplace',
  running: 'Shell',
  typing: 'Write',
  searching: 'Grep',
  phoning: 'Task',
};

interface AgentState {
  id: number;
  subAgentSpawned: boolean;
  subAgentToolId: string | null;
  lastActivity: AgentActivityType;
  composerMode?: 'agent' | 'ask' | 'edit';
  isBackgroundAgent?: boolean;
}

export class CursorPixelAgentsPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'cursorPixelAgents.panel';

  private view?: vscode.WebviewView;
  private watcher?: CursorWatcher;
  private layoutWatcher: LayoutWatcher | null = null;
  private defaultLayout: Record<string, unknown> | null = null;

  private sessionAgentMap = new Map<string, AgentState>();
  private nextAgentId = 1;
  private currentToolId = 0;
  private celebrateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly statusBar: vscode.StatusBarItem,
  ) {}

  private get extensionUri(): vscode.Uri {
    return this.context.extensionUri;
  }

  private getOrCreateAgent(
    sessionId: string,
    webview: vscode.Webview,
    meta?: { composerMode?: 'agent' | 'ask' | 'edit'; isBackgroundAgent?: boolean },
  ): AgentState {
    const existing = this.sessionAgentMap.get(sessionId);
    if (existing) return existing;

    const agentState: AgentState = {
      id: this.nextAgentId++,
      subAgentSpawned: false,
      subAgentToolId: null,
      lastActivity: 'idle',
      composerMode: meta?.composerMode,
      isBackgroundAgent: meta?.isBackgroundAgent,
    };
    this.sessionAgentMap.set(sessionId, agentState);
    webview.postMessage({
      type: 'agentCreated',
      id: agentState.id,
      composerMode: meta?.composerMode,
      isBackgroundAgent: meta?.isBackgroundAgent,
    });
    return agentState;
  }

  private resolveSessionId(status: ParsedStatus): string {
    return status.sessionId || FALLBACK_SESSION;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _resolveContext: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    this.watcher = new CursorWatcher((status: ParsedStatus) => {
      this.handleStatusChange(status);
    });
    this.watcher.start();

    webviewView.webview.onDidReceiveMessage((msg) => {
      this.handleWebviewMessage(msg);
    });

    webviewView.onDidDispose(() => {
      this.watcher?.dispose();
      this.watcher = undefined;
    });
  }

  private handleStatusChange(status: ParsedStatus): void {
    if (!this.view) return;
    const webview = this.view.webview;
    const { activity } = status;
    const sessionId = this.resolveSessionId(status);

    if (this.celebrateTimer) {
      clearTimeout(this.celebrateTimer);
      this.celebrateTimer = null;
    }

    if (activity === 'newSession') {
      this.getOrCreateAgent(sessionId, webview, {
        composerMode: status.composerMode,
        isBackgroundAgent: status.isBackgroundAgent,
      });
      this.updateStatusBar(status);
      return;
    }

    if (activity === 'sessionEnd') {
      const agent = this.sessionAgentMap.get(sessionId);
      if (agent) {
        webview.postMessage({ type: 'agentClosed', id: agent.id });
        this.sessionAgentMap.delete(sessionId);
      }
      this.updateStatusBar(status);
      return;
    }

    if (activity === 'toolDone') {
      const agent = this.sessionAgentMap.get(sessionId);
      if (agent) {
        webview.postMessage({ type: 'agentToolsClear', id: agent.id });
      }
      return;
    }

    const agent = this.getOrCreateAgent(sessionId, webview);
    const agentId = agent.id;

    if (activity === 'phoning' && !agent.subAgentSpawned) {
      agent.subAgentSpawned = true;
      agent.subAgentToolId = `tool-${++this.currentToolId}`;
      webview.postMessage({
        type: 'agentToolStart',
        id: agentId,
        toolId: agent.subAgentToolId,
        status: 'Subtask: Sub-agent',
      });
    } else if (activity !== 'phoning' && agent.subAgentSpawned) {
      if (agent.subAgentToolId) {
        webview.postMessage({
          type: 'subagentClear',
          id: agentId,
          parentToolId: agent.subAgentToolId,
        });
      }
      agent.subAgentSpawned = false;
      agent.subAgentToolId = null;
    }

    if (activity === 'idle' || activity === 'celebrating') {
      webview.postMessage({ type: 'agentToolsClear', id: agentId });
      webview.postMessage({
        type: 'agentStatus',
        id: agentId,
        status: 'waiting',
      });
      if (activity === 'celebrating') {
        this.celebrateTimer = setTimeout(() => {
          this.statusBar.text = '$(window) Pixel Agents';
          this.statusBar.backgroundColor = undefined;
        }, 5000);
      }
    } else if (activity === 'error') {
      webview.postMessage({
        type: 'agentToolPermission',
        id: agentId,
      });
    } else {
      const tool = ACTIVITY_TO_TOOL[activity] ?? 'Write';
      const toolId = `tool-${++this.currentToolId}`;
      webview.postMessage({
        type: 'agentToolPermissionClear',
        id: agentId,
      });
      webview.postMessage({ type: 'agentToolsClear', id: agentId });
      webview.postMessage({
        type: 'agentStatus',
        id: agentId,
        status: 'active',
      });
      webview.postMessage({
        type: 'agentToolStart',
        id: agentId,
        toolId,
        status: tool,
      });
    }

    agent.lastActivity = activity;
    this.updateStatusBar(status);
  }

  private static readonly WORKING_ACTIVITIES = new Set([
    'typing', 'editing', 'running', 'reading', 'searching', 'phoning',
  ]);

  private updateStatusBar(status: ParsedStatus): void {
    if (CursorPixelAgentsPanelProvider.WORKING_ACTIVITIES.has(status.activity)) {
      this.statusBar.text = '$(window) Working...';
      this.statusBar.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground',
      );
    } else if (status.activity === 'celebrating') {
      this.statusBar.text = '$(window) Done!';
      this.statusBar.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.prominentBackground',
      );
    } else {
      this.statusBar.text = '$(window) Pixel Agents';
      this.statusBar.backgroundColor = undefined;
    }
  }

  private handleWebviewMessage(msg: Record<string, unknown>): void {
    const webview = this.view?.webview;
    if (!webview) return;

    switch (msg.type) {
      case 'webviewReady':
        this.onWebviewReady(webview);
        break;
      case 'saveAgentSeats':
        this.context.workspaceState.update(WORKSPACE_KEY_AGENT_SEATS, msg.seats);
        break;
      case 'saveLayout':
        this.layoutWatcher?.markOwnWrite();
        writeLayoutToFile(msg.layout as Record<string, unknown>);
        break;
      case 'setSoundEnabled':
        this.context.globalState.update(GLOBAL_KEY_SOUND_ENABLED, msg.enabled);
        break;
      case 'saveViewState':
        this.context.globalState.update(GLOBAL_KEY_VIEW_STATE, msg.viewState);
        break;
      case 'exportLayout': {
        const layout = readLayoutFromFile();
        if (!layout) {
          vscode.window.showWarningMessage('Cursor Pixel Agents: No saved layout to export.');
          return;
        }
        vscode.window
          .showSaveDialog({
            filters: { 'JSON Files': ['json'] },
          })
          .then((uri) => {
            if (uri) {
              fs.writeFileSync(uri.fsPath, JSON.stringify(layout, null, 2), 'utf-8');
              vscode.window.showInformationMessage('Layout exported successfully.');
            }
          });
        break;
      }
      case 'importLayout': {
        vscode.window
          .showOpenDialog({
            filters: { 'JSON Files': ['json'] },
            canSelectMany: false,
          })
          .then((uris) => {
            if (!uris || uris.length === 0) return;
            try {
              const raw = fs.readFileSync(uris[0].fsPath, 'utf-8');
              const imported = JSON.parse(raw) as Record<string, unknown>;
              if (imported.version !== 1 || !Array.isArray(imported.tiles)) {
                vscode.window.showErrorMessage('Invalid layout file.');
                return;
              }
              this.layoutWatcher?.markOwnWrite();
              writeLayoutToFile(imported);
              webview.postMessage({ type: 'layoutLoaded', layout: imported });
              vscode.window.showInformationMessage('Layout imported successfully.');
            } catch {
              vscode.window.showErrorMessage('Failed to read or parse layout file.');
            }
          });
        break;
      }
    }
  }

  private async onWebviewReady(webview: vscode.Webview): Promise<void> {
    const soundEnabled = this.context.globalState.get<boolean>(GLOBAL_KEY_SOUND_ENABLED, true);
    const viewState = this.context.globalState.get(GLOBAL_KEY_VIEW_STATE, null);
    webview.postMessage({ type: 'settingsLoaded', soundEnabled, viewState });

    await this.loadAndSendAssets(webview);

    const result = migrateAndLoadLayout(this.context, this.defaultLayout);
    if (result) {
      webview.postMessage({
        type: 'layoutLoaded',
        layout: result.layout,
        wasReset: result.wasReset,
      });
    } else {
      webview.postMessage({ type: 'layoutLoaded', layout: null });
    }

    this.startLayoutWatcher(webview);
  }

  private async loadAndSendAssets(webview: vscode.Webview): Promise<void> {
    const extensionPath = this.extensionUri.fsPath;
    const bundledAssetsDir = path.join(extensionPath, 'dist', 'assets');

    let assetsRoot: string | null = null;
    if (fs.existsSync(bundledAssetsDir)) {
      assetsRoot = path.join(extensionPath, 'dist');
    } else {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        assetsRoot = workspaceRoot;
      }
    }

    if (!assetsRoot) return;

    try {
      this.defaultLayout = loadDefaultLayout(assetsRoot);

      const charSprites = await loadCharacterSprites(assetsRoot);
      if (charSprites) sendCharacterSpritesToWebview(webview, charSprites);

      const floorTiles = await loadFloorTiles(assetsRoot);
      if (floorTiles) sendFloorTilesToWebview(webview, floorTiles);

      const wallTiles = await loadWallTiles(assetsRoot);
      if (wallTiles) sendWallTilesToWebview(webview, wallTiles);

      const assets = await loadFurnitureAssets(assetsRoot);
      if (assets) sendAssetsToWebview(webview, assets);
    } catch (err) {
      console.error('[CursorPixelAgents] Error loading assets:', err);
    }
  }

  private startLayoutWatcher(webview: vscode.Webview): void {
    if (this.layoutWatcher) return;
    this.layoutWatcher = watchLayoutFile((layout) => {
      webview.postMessage({ type: 'layoutLoaded', layout });
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    const indexPath = vscode.Uri.joinPath(distPath, 'index.html').fsPath;

    let html = fs.readFileSync(indexPath, 'utf-8');

    html = html.replace(/(href|src)="\.\/([^"]+)"/g, (_match, attr, filePath) => {
      const fileUri = vscode.Uri.joinPath(distPath, filePath);
      const webviewUri = webview.asWebviewUri(fileUri);
      return `${attr}="${webviewUri}"`;
    });

    return html;
  }

  dispose(): void {
    if (this.celebrateTimer) {
      clearTimeout(this.celebrateTimer);
      this.celebrateTimer = null;
    }
    this.layoutWatcher?.dispose();
    this.layoutWatcher = null;
    this.watcher?.dispose();
    this.watcher = undefined;
  }
}
