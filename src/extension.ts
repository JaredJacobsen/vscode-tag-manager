import * as vscode from "vscode";
import { makeCompletionItemsProvider } from "./provideCompletionItems";
import { TagTreeDataProvider } from "./TagTreeDataProvider";

export function activate(context: vscode.ExtensionContext) {
  const tagTreeDataProvider = new TagTreeDataProvider(context);

  const disposable = vscode.languages.registerCompletionItemProvider(
    ["typescript", "javascript", "markdown", "plaintext"],
    makeCompletionItemsProvider(tagTreeDataProvider),
    "#"
  );

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
