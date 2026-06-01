import * as vscode from "vscode";
import { animateTyping } from "../utils/typing-animator";

export async function handleCreateFile(params: {
  path: string;
  content: string;
}): Promise<{ path: string; size: number }> {
  const uri = vscode.Uri.file(params.path);

  // Create empty file first so we can animate typing into it
  await vscode.workspace.fs.writeFile(uri, Buffer.from(""));

  // Open and show the document
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });

  // Animate typing the content
  await animateTyping(editor, params.content);

  // Save
  await doc.save();

  return { path: params.path, size: params.content.length };
}

export async function handleOpenFile(params: {
  path: string;
}): Promise<{ path: string; lines: number }> {
  const uri = vscode.Uri.file(params.path);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
  return { path: params.path, lines: doc.lineCount };
}

export async function handleReadFile(params: {
  path: string;
}): Promise<{ path: string; content: string }> {
  const uri = vscode.Uri.file(params.path);
  const bytes = await vscode.workspace.fs.readFile(uri);
  const content = Buffer.from(bytes).toString("utf-8");

  // Truncate large files to avoid blowing up LLM context
  const truncated =
    content.length > 5000 ? content.slice(0, 5000) + "\n...[truncated]" : content;

  return { path: params.path, content: truncated };
}
