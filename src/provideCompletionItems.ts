import { isEmpty, startsWith } from "lodash";
import * as vscode from "vscode";
import { TagTreeDataProvider } from "./TagTreeDataProvider";

export function makeCompletionItemsProvider(
  tagTreeDataProvider: TagTreeDataProvider
) {
  return {
    provideCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position
    ) {
      const linePrefix = document
        .lineAt(position)
        .text.substr(0, position.character + 1);

      // const re = /#\[([^#\[\]]*)\]$/;
      const re = /#\[([^#\[\]]*)\]$/;
      const match = linePrefix.match(re);
      if (match) {
        const tagPrefix = match[1];
        const suggestions = tagTreeDataProvider
          .getNodes()
          .filter((tag) => startsWith(tag.name, tagPrefix))
          .map(
            (tag) =>
              new vscode.CompletionItem(
                tag.name,
                vscode.CompletionItemKind.Value
              )
          );

        // console.log(match, tagPrefix, suggestions);
        // const defaultCompletionItem = new vscode.CompletionItem(
        //   `${tagPrefix}`,
        //   vscode.CompletionItemKind.Text
        // );

        const completionList = new vscode.CompletionList(
          suggestions,
          // isEmpty(suggestions) ? [defaultCompletionItem] : suggestions,
          true
        );

        return completionList;
      }
    },
  };
}
