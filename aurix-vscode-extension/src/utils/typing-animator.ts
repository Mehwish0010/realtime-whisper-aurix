import * as vscode from "vscode";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function animateTyping(
  editor: vscode.TextEditor,
  text: string,
  baseDelay: number = 20,
): Promise<void> {
  // For large content, use line-by-line insertion
  if (text.length > 500) {
    await animateTypingByLine(editor, text);
    return;
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const position = editor.selection.active;

    await editor.edit(
      (editBuilder) => {
        editBuilder.insert(position, char);
      },
      { undoStopBefore: false, undoStopAfter: false },
    );

    // Randomize delay for natural feel
    let charDelay = baseDelay + Math.random() * 20;
    if (char === "\n") {
      charDelay = 80 + Math.random() * 60;
    } else if (char === " ") {
      charDelay = baseDelay + Math.random() * 10;
    }

    await delay(charDelay);
  }
}

async function animateTypingByLine(
  editor: vscode.TextEditor,
  text: string,
): Promise<void> {
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = i < lines.length - 1 ? lines[i] + "\n" : lines[i];
    const position = editor.selection.active;

    await editor.edit(
      (editBuilder) => {
        editBuilder.insert(position, line);
      },
      { undoStopBefore: false, undoStopAfter: false },
    );

    await delay(50 + Math.random() * 30);
  }
}
