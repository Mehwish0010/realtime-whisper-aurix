import * as ws from "ws";
import * as vscode from "vscode";
import { AgentMessage, AgentResponse } from "./utils/protocol";
import {
  handleCreateFile,
  handleOpenFile,
  handleReadFile,
} from "./commands/file-operations";
import { handleEditFile } from "./commands/edit-operations";
import { handleRunCommand } from "./commands/terminal-operations";

export class AurixWebSocketServer {
  private wss: ws.WebSocketServer | null = null;
  private port: number;
  private statusBar: vscode.StatusBarItem;

  constructor(port: number, statusBar: vscode.StatusBarItem) {
    this.port = port;
    this.statusBar = statusBar;
  }

  start(): void {
    this.wss = new ws.WebSocketServer({ port: this.port });
    this.statusBar.text = "$(circle-filled) Aurix: Listening";
    console.log(`Aurix WS server listening on port ${this.port}`);

    this.wss.on("connection", (socket) => {
      this.statusBar.text = "$(check) Aurix: Connected";
      vscode.window.showInformationMessage("Aurix agent connected");

      socket.on("message", async (data) => {
        try {
          const msg: AgentMessage = JSON.parse(data.toString());
          const response = await this.handleMessage(msg);
          socket.send(JSON.stringify(response));
        } catch (err: any) {
          socket.send(
            JSON.stringify({
              id: "unknown",
              success: false,
              error: err.message,
            }),
          );
        }
      });

      socket.on("close", () => {
        this.statusBar.text = "$(circle-filled) Aurix: Listening";
        vscode.window.showInformationMessage("Aurix agent disconnected");
      });

      socket.on("error", (err) => {
        console.error("Aurix WS client error:", err.message);
      });
    });

    this.wss.on("error", (err) => {
      console.error("Aurix WS server error:", err.message);
      vscode.window.showErrorMessage(
        `Aurix server error: ${err.message}`,
      );
    });
  }

  private async handleMessage(msg: AgentMessage): Promise<AgentResponse> {
    try {
      let result: any;

      switch (msg.action) {
        case "create_file":
          result = await handleCreateFile(msg.params as any);
          break;
        case "open_file":
          result = await handleOpenFile(msg.params as any);
          break;
        case "read_file":
          result = await handleReadFile(msg.params as any);
          break;
        case "edit_file":
          result = await handleEditFile(msg.params as any);
          break;
        case "run_command":
          result = await handleRunCommand(msg.params as any);
          break;
        default:
          return {
            id: msg.id,
            success: false,
            error: `Unknown action: ${msg.action}`,
          };
      }

      return { id: msg.id, success: true, result };
    } catch (err: any) {
      return { id: msg.id, success: false, error: err.message };
    }
  }

  stop(): void {
    this.wss?.close();
    this.wss = null;
    this.statusBar.text = "$(circle-outline) Aurix: Disconnected";
    console.log("Aurix WS server stopped");
  }
}
