import * as vscode from "vscode";
import { animateTyping } from "../utils/typing-animator";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleEditFile(params: {
  path: string;
  operation: "insert" | "replace" | "delete";
  line: number;
  column?: number;
  content?: string;
  endLine?: number;
  endColumn?: number;
}): Promise<{ path: string; operation: string }> {
  const uri = vscode.Uri.file(params.path);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });

  const startPos = new vscode.Position(
    params.line - 1,
    (params.column || 1) - 1,
  );

  if (params.operation === "insert") {
    // Move cursor to position, then animate typing
    editor.selection = new vscode.Selection(startPos, startPos);
    editor.revealRange(new vscode.Range(startPos, startPos));
    await delay(200);
    await animateTyping(editor, params.content || "");
  } else if (params.operation === "replace") {
    const endPos = new vscode.Position(
      (params.endLine || params.line) - 1,
      (params.endColumn || 999) - 1,
    );
    const range = new vscode.Range(startPos, endPos);

    // Visually select the range first
    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(range);
    await delay(300);

    // Delete the selection
    await editor.edit((editBuilder) => {
      editBuilder.delete(range);
    });
    await delay(200);

    // Type the new content
    await animateTyping(editor, params.content || "");
  } else if (params.operation === "delete") {
    const endPos = new vscode.Position(
      (params.endLine || params.line) - 1,
      (params.endColumn || 999) - 1,
    );
    const range = new vscode.Range(startPos, endPos);

    // Visually select then delete
    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(range);
    await delay(300);
    await editor.edit((editBuilder) => {
      editBuilder.delete(range);
    });
  }

  await doc.save();
  return { path: params.path, operation: params.operation };
}
