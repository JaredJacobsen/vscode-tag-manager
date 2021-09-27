import { isEmpty, startsWith } from "lodash";
import * as vscode from "vscode";
import { TagTreeDataProvider } from "./TagTreeDataProvider";

export function activate(context: vscode.ExtensionContext) {
  const tagTreeDataProvider = new TagTreeDataProvider(context);

  const disposable = vscode.languages.registerCompletionItemProvider(
    ["typescript", "javascript", "markdown", "plaintext"],
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        const linePrefix = document
          .lineAt(position)
          .text.substr(0, position.character);

        // const re = /#\[([^#\[\]]*)\]$/;
        const re = /#([^#\[\]])$/;
        const match = linePrefix.match(re);
        if (match) {
          const tagPrefix = match[1];
          const suggestions = tagTreeDataProvider
            .getTags()
            .filter((tag) => startsWith(tag, tagPrefix))
            .map(
              (tag) =>
                new vscode.CompletionItem(
                  `[${tag}]`,
                  vscode.CompletionItemKind.Text
                )
            );

          return isEmpty(suggestions)
            ? [
                new vscode.CompletionItem(
                  `[${tagPrefix}]`,
                  vscode.CompletionItemKind.Text
                ),
              ]
            : suggestions;
        }
      },
    },
    "#"
  );

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
