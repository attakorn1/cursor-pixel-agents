import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const HOOKS_DIR = path.join(os.homedir(), '.cursor');
const HOOKS_JSON = path.join(HOOKS_DIR, 'hooks.json');
const HOOK_MARKER = 'cursor-pixel-agents-hook';
const STATE_FILE = path.join(os.tmpdir(), 'cursor-pixel-agents-state.jsonl');

interface HooksConfig {
  version: number;
  hooks: Record<string, Array<{ command: string; matcher?: string }>>;
}

function getHookScriptPath(extensionPath: string): string {
  return path.join(extensionPath, 'hooks', 'cursor-pixel-agents-hook.sh');
}

function buildHookCommand(extensionPath: string): string {
  return `bash "${getHookScriptPath(extensionPath)}"`;
}

export function isHooksInstalled(): boolean {
  if (!fs.existsSync(HOOKS_JSON)) return false;
  try {
    const raw = fs.readFileSync(HOOKS_JSON, 'utf-8');
    return raw.includes(HOOK_MARKER);
  } catch {
    return false;
  }
}

export function getStateFilePath(): string {
  return STATE_FILE;
}

export function installHooks(extensionPath: string): { success: boolean; message: string } {
  const hookCmd = buildHookCommand(extensionPath);

  const scriptPath = getHookScriptPath(extensionPath);
  if (!fs.existsSync(scriptPath)) {
    return { success: false, message: `Hook script not found at ${scriptPath}` };
  }

  const ourHooks: HooksConfig['hooks'] = {
    preToolUse: [{ command: hookCmd }],
    postToolUse: [{ command: hookCmd }],
    stop: [{ command: hookCmd }],
    beforeSubmitPrompt: [{ command: hookCmd }],
    subagentStart: [{ command: hookCmd }],
    subagentStop: [{ command: hookCmd }],
    sessionStart: [{ command: hookCmd }],
    sessionEnd: [{ command: hookCmd }],
  };

  if (!fs.existsSync(HOOKS_JSON)) {
    const config: HooksConfig = { version: 1, hooks: ourHooks };
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
    fs.writeFileSync(HOOKS_JSON, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true, message: 'Created hooks.json with Cursor Pixel Agents hooks.' };
  }

  let existing: HooksConfig;
  try {
    existing = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf-8'));
  } catch {
    return {
      success: false,
      message: 'Existing hooks.json is not valid JSON. Please fix it manually.',
    };
  }

  if (!existing.hooks) {
    existing.hooks = {};
  }

  let added = 0;
  for (const [event, entries] of Object.entries(ourHooks)) {
    if (!existing.hooks[event]) {
      existing.hooks[event] = [];
    }
    const hasOurs = existing.hooks[event].some((h) => h.command.includes(HOOK_MARKER));
    if (!hasOurs) {
      existing.hooks[event].push(...entries);
      added++;
    }
  }

  if (added === 0) {
    return { success: true, message: 'Cursor Pixel Agents hooks are already installed.' };
  }

  fs.writeFileSync(HOOKS_JSON, JSON.stringify(existing, null, 2), 'utf-8');
  return { success: true, message: `Added ${added} missing hook event(s) to hooks.json.` };
}

export function uninstallHooks(): { success: boolean; message: string } {
  if (!fs.existsSync(HOOKS_JSON)) {
    return { success: true, message: 'No hooks.json found.' };
  }

  let existing: HooksConfig;
  try {
    existing = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf-8'));
  } catch {
    return { success: false, message: 'hooks.json is not valid JSON.' };
  }

  if (!JSON.stringify(existing).includes(HOOK_MARKER)) {
    return { success: true, message: 'No Cursor Pixel Agents hooks found.' };
  }

  let cleaned = false;
  for (const event of Object.keys(existing.hooks || {})) {
    const before = existing.hooks[event]!.length;
    existing.hooks[event] = existing.hooks[event]!.filter(
      (h) => !h.command.includes(HOOK_MARKER),
    );
    if (existing.hooks[event]!.length === 0) {
      delete existing.hooks[event];
    }
    if (existing.hooks[event]?.length !== before) cleaned = true;
  }

  if (Object.keys(existing.hooks || {}).length === 0) {
    fs.unlinkSync(HOOKS_JSON);
    return { success: true, message: 'Removed hooks.json (no other hooks remained).' };
  }

  fs.writeFileSync(HOOKS_JSON, JSON.stringify(existing, null, 2), 'utf-8');
  return {
    success: cleaned,
    message: cleaned ? 'Removed Cursor Pixel Agents hooks.' : 'No changes needed.',
  };
}

export function registerHooksCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cursorPixelAgents.enableHooks', async () => {
      const result = installHooks(context.extensionPath);
      if (result.success && result.message === 'Cursor Pixel Agents hooks are already installed.') {
        vscode.window.showInformationMessage(result.message);
        return;
      }
      if (result.success) {
        const restart = await vscode.window.showInformationMessage(
          `${result.message} Restart Cursor to activate hooks.`,
          'Restart Now',
        );
        if (restart === 'Restart Now') {
          vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorPixelAgents.disableHooks', async () => {
      const result = uninstallHooks();
      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    }),
  );
}
