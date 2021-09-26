import {
  concat,
  difference,
  get,
  includes,
  isEmpty,
  keys,
  pull,
  union,
  uniq,
  unset,
  values,
} from "lodash";
import * as vscode from "vscode";
import { Uri } from "vscode";
import * as fs from "fs";

type TagNode = {
  name: string;
  childTags: string[];
  filePaths: string[];
};
type FileNode = {
  filePath: string;
  tags: string[];
};
type Node = TagNode | FileNode;

export class TagTreeDataProvider
  implements vscode.TreeDataProvider<Node>, vscode.DragAndDropController<Node>
{
  supportedTypes = ["text/treeitems"];
  private _onDidChangeTreeData: vscode.EventEmitter<Node[] | undefined> =
    new vscode.EventEmitter<Node[] | undefined>();
  // We want to use an array as the event type, so we use the proposed onDidChangeTreeData2.
  public onDidChangeTreeData2: vscode.Event<Node[] | undefined> =
    this._onDidChangeTreeData.event;

  private tagToTagNodeMap: { [key: string]: TagNode } = {};

  public getTags(): string[] {
    return keys(this.tagToTagNodeMap);
  }
  // {
  //   tagA: { name: "tagA", childTags: [], filePaths: [] },
  //   tagB: { name: "tagB", childTags: [], filePaths: [] },
  // };
  private filePathTofileNodeMap: { [key: string]: FileNode } = {};

  constructor(context: vscode.ExtensionContext) {
    const view = vscode.window.createTreeView("tagManager", {
      treeDataProvider: this,
      showCollapseAll: true,
      canSelectMany: true,
      dragAndDropController: this,
    });
    context.subscriptions.push(view);

    vscode.workspace.onDidSaveTextDocument((document) =>
      this.onWillSaveTextDocument(document)
    );

    console.log("setup tree view");
  }

  private async onWillSaveTextDocument(
    document: vscode.TextDocument
  ): Promise<void> {
    if (this.matchesWatchedFileExtensions(document.uri)) {
      const filePath = document.fileName;
      let fileNode = this.filePathTofileNodeMap[filePath];
      let shouldUpdate = false;
      if (!fileNode) {
        shouldUpdate = true;
        fileNode = { filePath, tags: [] };
        this.filePathTofileNodeMap[filePath] = fileNode;
      }

      const tags = await this.getTagsFromFileOnFileSystem(filePath);
      const tagsToAdd = difference(tags, fileNode.tags);
      const tagsToRemove = difference(fileNode.tags, tags);
      if (tagsToAdd.length > 0 || tagsToRemove.length > 0) {
        shouldUpdate = true;
        fileNode.tags = tags;
      }

      const modifiedTags: Node[] = [];
      tagsToAdd.forEach((tag) => {
        let tagNode = this.tagToTagNodeMap[tag];
        if (!tagNode) {
          tagNode = { name: tag, filePaths: [], childTags: [] };
          this.tagToTagNodeMap[tag] = tagNode;
        }
        tagNode.filePaths.push(filePath);
        modifiedTags.push(tagNode);
      });
      tagsToRemove.forEach((tag) => {
        const tagNode = this.tagToTagNodeMap[tag];
        if (tagNode) {
          pull(tagNode.filePaths, filePath);
          modifiedTags.push(tagNode);
          if (isEmpty(tagNode.filePaths) && isEmpty(tagNode.childTags)) {
            unset(this.tagToTagNodeMap, tag);
          }
        }
      });

      console.log("saving file", shouldUpdate, fileNode);
      if (shouldUpdate) {
        this._onDidChangeTreeData.fire(undefined);
        // this._onDidChangeTreeData.fire([...modifiedTags, fileNode]);
      }
    }
  }

  private matchesWatchedFileExtensions(uri: Uri) {
    const supportedFileExtensions = ["ts", "md", "txt"];
    const fileExtension = uri.fsPath.split(".").pop();
    return includes(supportedFileExtensions, fileExtension);
  }

  private async getTagsFromFileOnFileSystem(
    filePath: string
  ): Promise<string[]> {
    const buffer = await fs.promises.readFile(filePath);
    const tags = [];
    for (const match of buffer.toString().matchAll(/#\[(.*?)\]/g)) {
      tags.push(match[1]);
    }
    return uniq(tags);
  }

  // Tree data provider

  public getChildren(element?: Node): Node[] {
    if (!element) {
      console.log(
        "children",
        concat<Node>(
          values(this.tagToTagNodeMap),
          values(this.filePathTofileNodeMap)
        )
      );
      return concat<Node>(
        values(this.tagToTagNodeMap),
        values(this.filePathTofileNodeMap).filter((fileNode) =>
          isEmpty(fileNode.tags)
        )
      );
    }

    return "filePath" in element
      ? []
      : concat<Node>(
          element.childTags.map((tag) => this.tagToTagNodeMap[tag]),
          element.filePaths.map(
            (filePath) => this.filePathTofileNodeMap[filePath]
          )
        );
  }

  public getTreeItem(element: Node): vscode.TreeItem {
    if ("filePath" in element) {
      return {
        label: element.filePath.split("/").pop(),
        tooltip: new vscode.MarkdownString(element.filePath),
        collapsibleState: vscode.TreeItemCollapsibleState.None,
      };
    }
    return {
      label: element.name,
      collapsibleState:
        element.childTags.length > 0 || element.filePaths.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
    };
  }

  dispose(): void {
    // nothing to dispose
  }

  // Drag and drop controller
  public async onDrop(
    sources: vscode.TreeDataTransfer,
    target: Node
  ): Promise<void> {
    const treeItems = JSON.parse(
      await sources.items.get("text/treeitems")!.asString()
    );

    if ("childTags" in target) {
      treeItems.forEach((item: any) => {
        // if ("filePath" in item) {
        //   target.filePaths = union(target.filePaths, [item.filePath]);
        // }
        if ("childTags" in item) {
          target.childTags = union(target.childTags, [item.name]);
        }
      });
      this._onDidChangeTreeData.fire(undefined);
    }
  }
}
