import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { marked } from "marked";

interface InboundMessage {
  type: "ready" | "openFile" | "openLink";
  href?: string;
}

export class NotesViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "sidebarNotes.view";

  private view?: vscode.WebviewView;
  private watcher?: vscode.FileSystemWatcher;
  private stylesWatcher?: vscode.FileSystemWatcher;

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("sidebarNotes")) {
          this.rewatch();
          void this.reloadFromDisk();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.rewatch();
        void this.reloadFromDisk();
      }),
    );
  }

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
        this.context.globalStorageUri,
      ],
    };

    view.webview.onDidReceiveMessage((m: InboundMessage) => this.handleMessage(m));
    view.onDidDispose(() => {
      this.view = undefined;
      this.watcher?.dispose();
      this.watcher = undefined;
      this.stylesWatcher?.dispose();
      this.stylesWatcher = undefined;
    });

    void this.ensureStylesFile().then(() => {
      if (this.view) this.view.webview.html = this.renderHtml(this.view.webview);
    });

    this.rewatch();
    this.watchStyles();
  }

  public async reloadFromDisk(): Promise<void> {
    if (!this.view) return;
    const filePath = this.resolveFilePath();
    if (!filePath) {
      this.view.title = "Notes";
      this.postState({ html: "", filePath: "", missing: true });
      return;
    }
    this.view.title = path.basename(filePath);
    const text = await this.readOrEmpty(filePath);
    const html = marked.parse(text, { async: false }) as string;
    this.postState({ html, filePath, missing: false });
  }

  public async openInEditor(): Promise<void> {
    const filePath = this.resolveFilePath();
    if (!filePath) {
      vscode.window.showWarningMessage("Sidebar Notes: no workspace folder and no global file configured.");
      return;
    }
    await this.ensureFileExists(filePath);
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
  }

  public async openStyles(): Promise<void> {
    await this.ensureStylesFile();
    const doc = await vscode.workspace.openTextDocument(this.stylesFsPath());
    await vscode.window.showTextDocument(doc);
  }

  public async clearNotes(): Promise<void> {
    const filePath = this.resolveFilePath();
    if (!filePath) {
      vscode.window.showWarningMessage("Sidebar Notes: no workspace folder and no global file configured.");
      return;
    }
    await this.ensureFileExists(filePath);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    if (doc.getText().length === 0) return;
    // Edit through an editor so the change lands in VS Code's undo history (revertable with Ctrl+Z).
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    await editor.edit((b) => b.delete(fullRange));
    await doc.save();
  }

  private handleMessage(m: InboundMessage): void {
    if (m.type === "ready") {
      void this.reloadFromDisk();
      return;
    }
    if (m.type === "openFile") {
      void this.openInEditor();
      return;
    }
    if (m.type === "openLink" && typeof m.href === "string") {
      void this.openLink(m.href);
      return;
    }
  }

  private async openLink(href: string): Promise<void> {
    // External / absolute URIs (http, https, mailto, vscode, etc.) open via VS Code.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href) || /^mailto:/i.test(href)) {
      await vscode.env.openExternal(vscode.Uri.parse(href));
      return;
    }

    // Strip any anchor/query fragment from the path portion.
    const [rawPath] = href.split(/[?#]/);
    if (!rawPath) return;

    const decoded = decodeURIComponent(rawPath);
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const notesFile = this.resolveFilePath();
    const baseDir = notesFile ? path.dirname(notesFile) : workspaceDir;

    let target: string;
    if (/^[/\\]/.test(decoded)) {
      // Leading slash = workspace-root-relative.
      if (!workspaceDir) return;
      target = path.join(workspaceDir, decoded.replace(/^[/\\]+/, ""));
    } else if (path.isAbsolute(decoded)) {
      target = decoded;
    } else {
      if (!baseDir) return;
      target = path.resolve(baseDir, decoded);
    }

    try {
      await fs.access(target);
    } catch {
      vscode.window.showWarningMessage(`Sidebar Notes: file not found: ${target}`);
      return;
    }

    const uri = vscode.Uri.file(target);
    if (/\.md$/i.test(target)) {
      await vscode.commands.executeCommand("markdown.showPreview", uri);
    } else {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    }
  }

  private rewatch(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    const filePath = this.resolveFilePath();
    if (!filePath) return;
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder && filePath.startsWith(folder.uri.fsPath)) {
      const rel = path.relative(folder.uri.fsPath, filePath);
      this.watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, rel),
      );
    } else {
      this.watcher = vscode.workspace.createFileSystemWatcher(filePath);
    }
    const onChange = () => {
      void this.reloadFromDisk();
    };
    this.watcher.onDidChange(onChange);
    this.watcher.onDidCreate(onChange);
    this.watcher.onDidDelete(onChange);
    this.context.subscriptions.push(this.watcher);
  }

  private resolveFilePath(): string | undefined {
    const cfg = vscode.workspace.getConfiguration("sidebarNotes");
    const fileName = cfg.get<string>("fileName", "notes.md");
    const globalFile = cfg.get<string>("globalFile", "");
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) return path.join(folder.uri.fsPath, fileName);
    if (globalFile) return globalFile;
    return undefined;
  }

  private async readOrEmpty(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch {
      return "";
    }
  }

  private async ensureFileExists(filePath: string): Promise<void> {
    try {
      await fs.access(filePath);
    } catch {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "# Notes\n\nWrite anything here. Claude can edit this file too.\n", "utf8");
    }
  }

  private stylesFsPath(): string {
    return path.join(this.context.globalStorageUri.fsPath, "notes-styles.css");
  }

  private async ensureStylesFile(): Promise<void> {
    const dest = this.stylesFsPath();
    try {
      await fs.access(dest);
    } catch {
      const src = path.join(this.context.extensionUri.fsPath, "media", "main.css");
      const css = await this.readOrEmpty(src);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, css, "utf8");
    }
  }

  private watchStyles(): void {
    this.stylesWatcher?.dispose();
    const dir = this.context.globalStorageUri.fsPath;
    this.stylesWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(dir), "notes-styles.css"),
    );
    const reload = () => {
      if (this.view) this.view.webview.html = this.renderHtml(this.view.webview);
    };
    this.stylesWatcher.onDidChange(reload);
    this.stylesWatcher.onDidCreate(reload);
    this.stylesWatcher.onDidDelete(reload);
    this.context.subscriptions.push(this.stylesWatcher);
  }

  private postState(state: { html: string; filePath: string; missing: boolean }): void {
    this.view?.webview.postMessage({ type: "state", ...state });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = makeNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} https: data:`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    const mediaUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", file));

    const stylesUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.globalStorageUri, "notes-styles.css"))
      .with({ query: `v=${Date.now()}` });

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link rel="stylesheet" href="${stylesUri}" />
</head>
<body>
  <div id="content"></div>
  <script nonce="${nonce}" src="${mediaUri("main.js")}"></script>
</body>
</html>`;
  }
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}
