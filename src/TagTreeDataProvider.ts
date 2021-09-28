import {
  concat,
  difference,
  get,
  includes,
  isEmpty,
  keys,
  pull,
  remove,
  sortBy,
  union,
  uniq,
  unset,
  values,
  without,
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
  fileUri: Uri;
  fileName: string;
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

    this.initTags();

    const disposable1 = vscode.workspace.onDidSaveTextDocument((document) =>
      this.onDidSaveTextDocument(document)
    );

    const disposable2 = vscode.workspace.onDidDeleteFiles((e) =>
      this.onDidDeleteFiles(e)
    );

    const disposable3 = vscode.workspace.onDidCreateFiles((e) =>
      this.onDidCreateFiles(e)
    );

    const disposable4 = vscode.workspace.onDidRenameFiles((e) => {
      this.onDidRenameFiles(e);
    });

    context.subscriptions.push(
      disposable1,
      disposable2,
      disposable3,
      disposable4
    );
  }

  private async initTags() {
    const uris = await vscode.workspace.findFiles(
      "**/*.*",
      "**/node_modules/**"
    );
    uris.forEach((uri) => this.updateTagsForFile(uri));
  }

  private onDidRenameFiles(e: vscode.FileRenameEvent) {
    e.files.forEach(({ oldUri, newUri }) => {
      this.removeFileData(oldUri);
      this.updateTagsForFile(newUri);
    });
  }

  private onDidCreateFiles(e: vscode.FileCreateEvent) {
    e.files.forEach((file) => {
      this.updateTagsForFile(file);
    });
  }

  private onDidDeleteFiles(e: vscode.FileDeleteEvent) {
    e.files.forEach((file) => {
      this.removeFileData(file);
    });

    this._onDidChangeTreeData.fire(undefined);
  }

  private removeFileData(file: Uri) {
    this.filePathTofileNodeMap[file.fsPath].tags.forEach((tag) => {
      const tagNode = this.tagToTagNodeMap[tag];
      pull(tagNode.filePaths, file.fsPath);
      if (isEmpty(tagNode.filePaths) && isEmpty(tagNode.childTags)) {
        unset(this.tagToTagNodeMap, tag);
      }
    });

    unset(this.filePathTofileNodeMap, file.fsPath);
  }

  private onDidSaveTextDocument(document: vscode.TextDocument): Promise<void> {
    this.updateTagsForFile(document.uri);
  }

  private async updateTagsForFile(fileUri: Uri): Promise<void> {
    const filePath = fileUri.fsPath;
    if (this.matchesWatchedFileExtensions(filePath)) {
      let fileNode = this.filePathTofileNodeMap[filePath];
      let shouldUpdate = false;
      if (!fileNode) {
        shouldUpdate = true;
        fileNode = {
          fileUri,
          fileName: fileUri.fsPath.split("/").pop() || "",
          tags: [],
        };
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

      if (shouldUpdate) {
        this._onDidChangeTreeData.fire(undefined);
        // this._onDidChangeTreeData.fire([...modifiedTags, fileNode]);
      }
    }
  }

  private matchesWatchedFileExtensions(filePath: string) {
    const supportedFileExtensions = ["js", "ts", "md", "txt"];
    const fileExtension = filePath.split(".").pop();
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
    if (element && "fileUri" in element) {
      return [];
    }

    const sortedTagNodes = sortBy(
      element
        ? element.childTags.map((tag) => this.tagToTagNodeMap[tag])
        : values(this.tagToTagNodeMap),
      ({ name }) => name
    );

    const sortedFileNodes = sortBy(
      element
        ? element.filePaths.map(
            (filePath) => this.filePathTofileNodeMap[filePath]
          )
        : values(this.filePathTofileNodeMap).filter((fileNode) =>
            isEmpty(fileNode.tags)
          ),
      ({ fileName }) => fileName
    );

    return concat<Node>(sortedTagNodes, sortedFileNodes);
  }

  public getTreeItem(element: Node): vscode.TreeItem {
    if ("fileName" in element) {
      return {
        label: element.fileName,
        tooltip: new vscode.MarkdownString(element.fileUri.fsPath),
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        resourceUri: element.fileUri,
        command: {
          title: "",
          command: "vscode.open",
          arguments: [element.fileUri],
        },
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
        if ("childTags" in item) {
          target.childTags = union(target.childTags, [item.name]);
        }
      });
      this._onDidChangeTreeData.fire(undefined);
    }
  }
}
