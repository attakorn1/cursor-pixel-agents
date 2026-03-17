import * as vscode from 'vscode';

import { COMMAND_SHOW_PANEL, VIEW_ID } from './constants.js';
import { installHooks, isHooksInstalled, registerHooksCommands } from './hooksInstaller.js';
import { CursorPixelAgentsPanelProvider } from './panelProvider.js';

let providerInstance: CursorPixelAgentsPanelProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    -100,
  );
  statusBar.text = '$(window) Pixel Agents';
  statusBar.tooltip = 'Open Cursor Pixel Agents';
  statusBar.command = COMMAND_SHOW_PANEL;
  statusBar.show();
  context.subscriptions.push(statusBar);

  const provider = new CursorPixelAgentsPanelProvider(context, statusBar);
  providerInstance = provider;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_SHOW_PANEL, () => {
      vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    }),
  );

  registerHooksCommands(context);

  const hookResult = installHooks(context.extensionPath);
  if (hookResult.success && hookResult.message !== 'Cursor Pixel Agents hooks are already installed.') {
    vscode.window.showInformationMessage(
      `${hookResult.message} Restart Cursor to activate hooks.`,
      'Restart Now',
    ).then((choice) => {
      if (choice === 'Restart Now') {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    });
  }
}

export function deactivate(): void {
  providerInstance?.dispose();
}
