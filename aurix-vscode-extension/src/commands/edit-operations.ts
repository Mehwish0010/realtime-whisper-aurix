import * as vscode from "vscode";

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
    await editor.edit((editBuilder) => {
      editBuilder.insert(startPos, params.content || "");
    });
  } else if (params.operation === "replace") {
    const endPos = new vscode.Position(
      (params.endLine || params.line) - 1,
      (params.endColumn || 999) - 1,
    );
    const range = new vscode.Range(startPos, endPos);
    await editor.edit((editBuilder) => {
      editBuilder.replace(range, params.content || "");
    });
  } else if (params.operation === "delete") {
    const endPos = new vscode.Position(
      (params.endLine || params.line) - 1,
      (params.endColumn || 999) - 1,
    );
    const range = new vscode.Range(startPos, endPos);
    await editor.edit((editBuilder) => {
      editBuilder.delete(range);
    });
  }

  await doc.save();
  return { path: params.path, operation: params.operation };
}
