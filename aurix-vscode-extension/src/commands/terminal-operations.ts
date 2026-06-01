import * as vscode from "vscode";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleRunCommand(params: {
  command: string;
  cwd?: string;
}): Promise<{ command: string; terminal: string }> {
  // Reuse or create an Aurix terminal
  let terminal = vscode.window.terminals.find((t) => t.name === "Aurix Agent");
  if (!terminal) {
    terminal = vscode.window.createTerminal({
      name: "Aurix Agent",
      cwd:
        params.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    });
  }

  terminal.show();
  await delay(300);

  // Type command character by character for visual effect
  for (const char of params.command) {
    terminal.sendText(char, false);
    await delay(30 + Math.random() * 20);
  }

  // Press Enter
  terminal.sendText("", true);

  return { command: params.command, terminal: "Aurix Agent" };
}
