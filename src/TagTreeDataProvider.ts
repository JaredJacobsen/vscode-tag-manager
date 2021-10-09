import {
  concat,
  has,
  includes,
  intersection,
  pull,
  sortBy,
  union,
  unset,
  values,
} from "lodash";
import * as vscode from "vscode";
import { Uri } from "vscode";
import extractEdgesFromFile from "./extractEdgesFromFile";
import { getBasename } from "./utils/getBasename";

type TagNode = {
  name: string;
  isStarred: boolean;
  in: string[];
  out: string[];
};
type FileNode = {
  uri: Uri;
  name: string; //name corresponds to the basename of the file, which must be unique
  isStarred: boolean;
  in: string[];
  out: string[];
};
type Node = TagNode | FileNode;
type Edges = Set<string>;
type Names = Set<string>;

export class TagTreeDataProvider
  implements vscode.TreeDataProvider<Node>, vscode.DragAndDropController<Node>
{
  supportedTypes = ["text/treeitems"];
  private _onDidChangeTreeData: vscode.EventEmitter<Node[] | undefined> =
    new vscode.EventEmitter<Node[] | undefined>();
  // We want to use an array as the event type, so we use the proposed onDidChangeTreeData2.
  public onDidChangeTreeData2: vscode.Event<Node[] | undefined> =
    this._onDidChangeTreeData.event;

  private nodeIndex: { [name: string]: Node } = {};
  private nameToEdgesMap: { [name: string]: Edges } = {};
  private edgeToSourcesMap: { [edge: string]: Names } = {};

  constructor(context: vscode.ExtensionContext) {
    const view = vscode.window.createTreeView("tagManager", {
      treeDataProvider: this,
      showCollapseAll: true,
      canSelectMany: true,
      dragAndDropController: this,
    });

    const disposable1 = vscode.workspace.onDidSaveTextDocument(
      this.onDidSaveTextDocument
    );
    const disposable2 = vscode.workspace.onDidDeleteFiles(
      this.onDidDeleteFiles
    );
    const disposable3 = vscode.workspace.onDidCreateFiles(
      this.onDidCreateFiles
    );
    const disposable4 = vscode.workspace.onDidRenameFiles(
      this.onDidRenameFiles
    );

    context.subscriptions.push(
      view,
      disposable1,
      disposable2,
      disposable3,
      disposable4
    );

    this.initGraph();
  }

  public getChildren(element?: Node): Node[] {
    if (!element) {
      return sortNodes(values(this.nodeIndex));
    }

    const inAndOutNodes = intersection(element.in, element.out).map(
      (name) => this.nodeIndex[name]
    );
    const inNodes = element.in.map((name) => this.nodeIndex[name]);
    const outNodes = element.out.map((name) => this.nodeIndex[name]);

    const sortedInAndOutNodes = sortNodes(inAndOutNodes);
    const sortedInNodes = sortNodes(inNodes);
    const sortedOutNodes = sortNodes(outNodes);

    return concat<Node>(sortedInAndOutNodes, sortedInNodes, sortedOutNodes);
  }

  public getTreeItem(element: Node): vscode.TreeItem {
    if (isFileNode(element)) {
      return {
        label: element.name,
        tooltip: new vscode.MarkdownString(element.uri.fsPath),
        iconPath: vscode.ThemeIcon.File,
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        resourceUri: element.uri,
        command: {
          title: "",
          command: "vscode.open",
          arguments: [element.uri],
        },
      };
    }
    return {
      label: element.name,
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
    };
  }

  // Drag and drop controller
  public async onDrop(
    sources: vscode.TreeDataTransfer,
    target: Node
  ): Promise<void> {
    const treeItems: Node[] = JSON.parse(
      await sources.items.get("text/treeitems")!.asString()
    );

    treeItems.forEach((item) => {
      target.in = union(target.in, [item.name]);
    });

    this._onDidChangeTreeData.fire(undefined);
  }

  public getNodes(): Node[] {
    return values(this.nodeIndex);
  }

  public getTagNodes(): TagNode[] {
    return values(this.nodeIndex).filter((node) => !isFileNode(node));
  }

  private async initGraph() {
    const uriList = await vscode.workspace.findFiles(
      "**/src/**",
      "**/node_modules/**"
    );
    uriList.forEach((uri) => this.updateGraphOnFileChange(uri));
  }

  private onDidSaveTextDocument(document: vscode.TextDocument): Promise<void> {
    return this.updateGraphOnFileChange(document.uri);
  }

  private onDidCreateFiles(e: vscode.FileCreateEvent) {
    e.files.forEach((uri) => {
      this.updateGraphOnFileChange(uri);
    });
  }

  private onDidRenameFiles(e: vscode.FileRenameEvent) {
    e.files.forEach(({ oldUri, newUri }) => {
      this.updateGraphOnFileDelete(oldUri);
      this.updateGraphOnFileChange(newUri);
    });
  }

  private onDidDeleteFiles(e: vscode.FileDeleteEvent) {
    e.files.forEach((uri) => {
      this.updateGraphOnFileDelete(uri);
    });
  }

  private async updateGraphOnFileChange(uri: Uri): Promise<void> {
    const filepath = uri.fsPath;
    if (this.ignoreFile(filepath)) {
      return;
    }
    const basename = getBasename(filepath);

    let shouldUpdate = false;
    let fileNode = this.nodeIndex[basename];
    if (!fileNode) {
      shouldUpdate = true;
      fileNode = {
        uri,
        name: basename,
        isStarred: false,
        in: [],
        out: [],
      };
      this.nodeIndex[basename] = fileNode;
      this.nameToEdgesMap[basename] = new Set();
    }

    const prevEdges = this.nameToEdgesMap[basename];
    const newEdges = await extractEdgesFromFile(filepath);
    this.nameToEdgesMap[basename] = newEdges;

    const edgesToAdd = difference(newEdges, prevEdges);
    if (edgesToAdd.size > 0) {
      shouldUpdate = true;
    }
    this.addSourceForEdges(basename, edgesToAdd);

    shouldUpdate =
      this.deleteSourceForEdges(basename, difference(prevEdges, newEdges)) ||
      shouldUpdate;

    if (shouldUpdate) {
      this._onDidChangeTreeData.fire(undefined);
      // this._onDidChangeTreeData.fire([...modifiedTags, fileNode]);
    }
  }

  private updateGraphOnFileDelete(uri: Uri) {
    const filepath = uri.fsPath;
    if (this.ignoreFile(filepath)) {
      return;
    }
    const basename = getBasename(filepath);

    this.deleteSourceForEdges(basename, this.nameToEdgesMap[basename]);
    unset(this.nameToEdgesMap, basename);

    this._onDidChangeTreeData.fire(undefined);
  }

  private addSourceForEdges(source: string, edges: Edges) {
    edges.forEach((edge) => {
      const names = this.edgeToSourcesMap[edge];
      if (names) {
        names.add(source);
      } else {
        this.edgeToSourcesMap[edge] = new Set([source]);
        const [from, to] = edge.split("->");
        if (!has(this.nodeIndex, from)) {
          this.nodeIndex[from] = {
            name: from,
            isStarred: false,
            in: [],
            out: [],
          };
        }
        const fromNode = this.nodeIndex[from];
        if (!has(this.nodeIndex, to)) {
          this.nodeIndex[to] = {
            name: to,
            isStarred: false,
            in: [],
            out: [],
          };
        }
        const toNode = this.nodeIndex[to];
        fromNode.out.push(to);
        toNode.in.push(from);
      }
    });
  }

  private deleteSourceForEdges(source: string, edges: Edges) {
    let shouldUpdate = false;

    edges.forEach((edge) => {
      const edgeSources = this.edgeToSourcesMap[edge];
      edgeSources.delete(source);
      if (edgeSources.size === 0) {
        shouldUpdate = true;
        unset(this.edgeToSourcesMap, edge);
        const [from, to] = edge.split("->");
        pull(this.nodeIndex[from].out, to);
        pull(this.nodeIndex[to].in, from);
      }
    });

    return shouldUpdate;
  }

  private ignoreFile(filepath: string): boolean {
    return (
      !filepath.includes("/src/") ||
      !this.matchesWatchedFileExtensions(filepath)
    );
  }

  private matchesWatchedFileExtensions(filepath: string) {
    const supportedFileExtensions = ["js", "jsx", "ts", "tsx", "md", "txt"];
    const fileExtension = filepath.split(".").pop();
    return includes(supportedFileExtensions, fileExtension);
  }

  dispose(): void {}
}

function sortNodes(nodes: Node[]) {
  const tagNodes = nodes.filter((node) => !("uri" in node));
  const fileNodes = nodes.filter((node) => "uri" in node);
  const sortedTagNodes = sortBy(tagNodes, ({ name }) => name);
  const sortedFileNodes = sortBy(fileNodes, ({ name }) => name);
  return concat<Node>(sortedTagNodes, sortedFileNodes);
}

function difference<t>(setA: Set<t>, setB: Set<t>) {
  let _difference = new Set(setA);
  for (let elem of setB) {
    _difference.delete(elem);
  }
  return _difference;
}

function isFileNode(node: FileNode | TagNode): node is FileNode {
  return (node as FileNode).uri !== undefined;
}
