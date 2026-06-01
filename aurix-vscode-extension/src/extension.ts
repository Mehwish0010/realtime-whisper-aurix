import * as vscode from "vscode";
import { AurixWebSocketServer } from "./websocket-server";

let server: AurixWebSocketServer | null = null;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.text = "$(circle-outline) Aurix: Disconnected";
  statusBarItem.tooltip = "Aurix VS Code Agent";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register start command
  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.startServer", () => {
      if (!server) {
        server = new AurixWebSocketServer(9877, statusBarItem);
        server.start();
        vscode.window.showInformationMessage(
          "Aurix agent server started on port 9877",
        );
      } else {
        vscode.window.showInformationMessage(
          "Aurix agent server is already running",
        );
      }
    }),
  );

  // Register stop command
  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.stopServer", () => {
      if (server) {
        server.stop();
        server = null;
        vscode.window.showInformationMessage("Aurix agent server stopped");
      }
    }),
  );

  // Auto-start the server
  server = new AurixWebSocketServer(9877, statusBarItem);
  server.start();
}

export function deactivate(): void {
  if (server) {
    server.stop();
    server = null;
  }
}
