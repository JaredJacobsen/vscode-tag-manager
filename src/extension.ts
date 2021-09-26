// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { isEmpty, startsWith } from "lodash";
import * as vscode from "vscode";
import { TagTreeDataProvider } from "./TagTreeDataProvider";
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "tag-manager" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable1 = vscode.commands.registerCommand(
    "tag-manager.helloWorld",
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage("Hello Word from tag manager!");
    }
  );

  const tagTreeDataProvider = new TagTreeDataProvider(context);

  const disposable2 = vscode.languages.registerCompletionItemProvider(
    ["typescript", "javascript", "markdown", "plaintext"],
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        // get all text until the `position` and check if it reads `console.`
        // and if so then complete if `log`, `warn`, and `error`
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

  context.subscriptions.push(disposable1, disposable2);
}

// this method is called when your extension is deactivated
export function deactivate() {}
