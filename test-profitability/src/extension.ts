// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in code below
// import { API as GitAPI, GitExtension, APIState } from './typings/git';
import * as vscode from 'vscode';
// import simpleGit, { CleanOptions, Options, SimpleGit, TaskOptions } from 'simple-git';
import { DocumentNodeEntry, DocumentNodeIndex, DocumentNodeIndexSnapShot } from './DocumentNodeIndex';
import SymbolKinds from './SymbolKinds';
// import { Git } from 'git';
import * as Git from 'git';

const OPTION_LIST_PARSED_FILES_PATHS: boolean = false;
const PARSE_FILE_PATTERN_INCLUDE: vscode.GlobPattern = '*.ts';
const PARSE_FILE_PATTERN_EXCLUDE: vscode.GlobPattern = '*{.|-}{po,spec,d}.ts';
// const PARSE_FILE_PATTERN_EXCLUDE: vscode.GlobPattern = '**/{node_modules/**}?/*.{po,spec,d}.ts';

function processDocumentEntry(
    path: string,
    symbols: vscode.DocumentSymbol[],
    depth: number,
    documentNodeEntry?: DocumentNodeEntry,
): DocumentNodeEntry {
    let _documentNodeEntry: DocumentNodeEntry;
    if (!documentNodeEntry) {
        _documentNodeEntry = {
            path,
            documentNodes: {},
        };
        SymbolKinds.forEach(s => _documentNodeEntry.documentNodes[s] = 0);
    } else {
        _documentNodeEntry = documentNodeEntry;
    }
    if (!Array.isArray(symbols) || symbols.length === 0) {
        return _documentNodeEntry;
    }
    for (const symbol of symbols) {
        const currentKey = `${SymbolKinds[symbol.kind]}`;
        _documentNodeEntry.documentNodes[currentKey]++;
        if (symbol.children) {
            processDocumentEntry(path, symbol.children, depth + 1, _documentNodeEntry);
        }
    }
    return _documentNodeEntry;
}

async function createSnapshot(): Promise<DocumentNodeIndexSnapShot> {
    const snapShot: DocumentNodeIndexSnapShot = {
        ...( OPTION_LIST_PARSED_FILES_PATHS && ({ documentsParsedPaths: [] }) ),
        documentsParsedAmount: 0,
        stats: {},
    };

    const matchedFilesUris: vscode.Uri[] = await vscode.workspace.findFiles(`**/${PARSE_FILE_PATTERN_INCLUDE}`, `**/${PARSE_FILE_PATTERN_EXCLUDE}`, 50);
    if (!matchedFilesUris || matchedFilesUris.length === 0) {
        vscode.window.showWarningMessage(`No files found with inclusive pattern "${PARSE_FILE_PATTERN_INCLUDE}" and exclusive pattern "${PARSE_FILE_PATTERN_EXCLUDE}".`);
        return snapShot;
    }

    const tasks: Thenable<void>[] = matchedFilesUris.map(async (uri: vscode.Uri) => {
        const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            uri,
        );
        const parsedData = processDocumentEntry(uri.path, symbols, 0);
        if (OPTION_LIST_PARSED_FILES_PATHS) {
            snapShot.documentsParsedPaths!.push(uri.path);   
        }
        snapShot.documentsParsedAmount++;

        Object.entries(parsedData.documentNodes).forEach(([symbolKey, occurrences]: [string, number]) => {
            // `constructor` causing problems reading and is irrelevant for stats parsing
            if (symbolKey === 'constructor') {
                return;
            }
            if (snapShot.stats[symbolKey]) {
                snapShot.stats[symbolKey] = snapShot.stats[symbolKey] + occurrences;
            } else {
                snapShot.stats[symbolKey] = occurrences;
            }
        });
    });
    await Promise.all(tasks);

    return snapShot;
}

async function commandParseWorkspace(): Promise<void> {
    let undoStopBefore = true;
    const showInputBoxOptions: vscode.InputBoxOptions = {
        placeHolder: '',
        validateInput: (param: string) => {
            if (!param) {
                return 'Syntax error. Provide valid string';
            }
        },
    };
    const mydata: DocumentNodeIndex = {};

    const userInputProjectName: string | undefined = await vscode.window.showInputBox(showInputBoxOptions);
    if (!userInputProjectName || typeof userInputProjectName !== 'string') {
        // undo
        if (!undoStopBefore) {
            vscode.commands.executeCommand('undo');
        }
        vscode.window.showErrorMessage('Invalid input string for projectName.');
        return;
    } else {
        mydata.projectName = userInputProjectName;
    }

    if (!Array.isArray(vscode.workspace.workspaceFolders) || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folders. Add at least one folder to workspace.');
        return;
    }

    mydata.currentState = await createSnapshot();
    const myDataAsText = JSON.stringify(mydata, null, 4);

    // show results
    vscode.workspace.openTextDocument({ content: myDataAsText }).then(doc => {
        vscode.window.showTextDocument(doc);
    });

    // get save folder target uri from user
    // const defaultUri = vscode.workspace.workspaceFolders[0];
    // const showOpenDialogOptions: vscode.OpenDialogOptions = {
    //     defaultUri,
    //     openLabel: '',
    //     canSelectFiles: false,
    //     canSelectFolders: true,
    //     canSelectMany: false,
    //     title: '',
    // };
    // const userInputSaveToFolderUri: vscode.Uri[] | undefined = await vscode.window.showOpenDialog();

    // save results
    // vscode.workspace.workspaceFolders.forEach(async (wsUri: vscode.WorkspaceFolder) => {
    //     const newUri = vscode.Uri.from({
    //         scheme: wsUri.uri.scheme,
    //         path: `${wsUri.uri.path}/${mydata.projectName}.json`,
    //     });
    //     await vscode.workspace.fs.writeFile(newUri, new TextEncoder().encode(myDataAsText));
    //     vscode.window.showTextDocument(newUri, { preview: false });
    // });
}

async function commandParseWorkspaceSnapshotsGit(): Promise<void> {
    let undoStopBefore = true;
    const showInputBoxOptions: vscode.InputBoxOptions = {
        placeHolder: '',
        validateInput: (param: string) => {
            if (!param) {
                return 'Syntax error. Provide valid string';
            }
        },
    };
    const mydata: DocumentNodeIndex = {};

    const userInputProjectName: string | undefined = await vscode.window.showInputBox(showInputBoxOptions);
    if (!userInputProjectName || typeof userInputProjectName !== 'string') {
        // undo
        if (!undoStopBefore) {
            vscode.commands.executeCommand('undo');
        }
        vscode.window.showErrorMessage('Invalid input string for projectName.');
        return;
    } else {
        mydata.projectName = userInputProjectName;
    }

    if (!Array.isArray(vscode.workspace.workspaceFolders) || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folders. Add at least one folder to workspace.');
        return;
    }

    mydata.currentState = await createSnapshot();
    const myDataAsText = JSON.stringify(mydata, null, 4);

    // const gitExtension = vscode.extensions.getExtension('vscode.git')!.exports;
    // const api = gitExtension.getAPI(1);
    // const repo = api.repositories[0];
    // await repo.checkout('hotfix-ada');

    const mainWorkspaceFolderUri: vscode.WorkspaceFolder = vscode.workspace.workspaceFolders[0];
    // const git: SimpleGit = simpleGit(mainWorkspaceFolderUri.uri.path);
    // const git: Git = new Git(mainWorkspaceFolderUri.uri.path);
    // git.rev_list(
    //     {
    //         'maxCount': 1,
    //         'before': '2019-01-01 00:00',
    //         'branch': 'dev',
    //     },
    //     (gitRes: any) => console.log( '!!! gitRes:', JSON.stringify(gitRes, null, 4) ),
    // );

    // git checkout `git rev-list --max-count=1 --before="${checkYear}-${checkMonth}-01 00:00" dev`
    // git checkout `git rev-list --max-count=1 --before="2019-01-01 00:00" dev`
    // git.rev
    // git.checkout('hotfix-ada', (gitres) => console.log( '!!! gitres:', JSON.stringify(gitres, null, 4) ));

    // show results
    vscode.workspace.openTextDocument({ content: myDataAsText }).then(doc => {
        vscode.window.showTextDocument(doc);
    });
}

// this method is called when extension is activated
// extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    
    // This line of code will only be executed once when extension is activated
    console.log('Extension "test-profitability" is now active.');
    
    // command `parseWorkspace`
    const disposableCommandParseWorkspace = vscode.commands.registerCommand('test-profitability.parseWorkspace', commandParseWorkspace);
    context.subscriptions.push(disposableCommandParseWorkspace);

    // command `commandParseWorkspaceSnapshotsGit`
    const disposableCommandParseWorkspaceSnapshotsGit = vscode.commands.registerCommand('test-profitability.commandParseWorkspaceSnapshotsGit', commandParseWorkspaceSnapshotsGit);
    context.subscriptions.push(disposableCommandParseWorkspaceSnapshotsGit);

    // open webview
    // if (vscode.window.registerWebviewPanelSerializer) {
    //     // Make sure we register a serializer in activation event
    //     vscode.window.registerWebviewPanelSerializer(MainCodingPanel.viewType, {
    //         async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
    //             console.log(`Got state: ${state}`);
    //             // // Reset the webview options so we use latest uri for `localResourceRoots`.
    //             // webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
    //             MainCodingPanel.revive(webviewPanel, context.extensionUri);
    //         }
    //     });
    // }
}

// this method is called when extension is deactivated
export function deactivate() {}

/**
 * Manages webview panels
 */
class MainCodingPanel {
    /**
     * Track the currently panel. Only allow a single panel to exist at a time.
     */
    public static currentPanel: MainCodingPanel | undefined;
    
    public static readonly viewType = 'catCoding';
    
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    
    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.viewColumn
        : undefined;
        
        // If we already have a panel, show it.
        if (MainCodingPanel.currentPanel) {
            MainCodingPanel.currentPanel._panel.reveal(column);
            return;
        }
        
        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            MainCodingPanel.viewType,
            'Test Profitability',
            column || vscode.ViewColumn.One,
            // getWebviewOptions(extensionUri),
        );
            
        MainCodingPanel.currentPanel = new MainCodingPanel(panel, extensionUri);
    }
    
    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        MainCodingPanel.currentPanel = new MainCodingPanel(panel, extensionUri);
    }
    
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        
        // Set the webview's initial html content
        this._update();
        
        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            e => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );
            
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'alert':
                    vscode.window.showErrorMessage(message.text);
                    return;
                }
            },
            null,
            this._disposables
        );
    }
        
    public doRefactor() {
        // Send a message to the webview webview.
        // You can send any JSON serializable data.
        this._panel.webview.postMessage({ command: 'refactor' });
    }
    
    public dispose() {
        MainCodingPanel.currentPanel = undefined;
        
        // Clean up our resources
        this._panel.dispose();
        
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    
    private _update() {
        const webview = this._panel.webview;
        this._updatePanel(webview, 'Compiling Cat');
        
        // // Vary the webview's content based on where it is located in the editor.
        // switch (this._panel.viewColumn) {
        //     case vscode.ViewColumn.Two:
        //         this._updateForCat(webview, 'Compiling Cat');
        //         return;
            
        //     case vscode.ViewColumn.Three:
        //         this._updateForCat(webview, 'Testing Cat');
        //         return;
            
        //     case vscode.ViewColumn.One:
        //         default:
        //         this._updateForCat(webview, 'Coding Cat');
        //         return;
        // }
    }

    private _updatePanel(webview: vscode.Webview, panelName: string) {
		this._panel.title = panelName;
		this._panel.webview.html = this._getHtmlForWebview(webview, panelName);
	}

    private _getHtmlForWebview(webview: vscode.Webview, catGifPath: string) {
		// Local path to main script run in the webview
		const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');

		// And the uri we use to load this script in the webview
		const scriptUri = (scriptPathOnDisk).with({ 'scheme': 'vscode-resource' });

		// Local path to css styles
		const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css');
		const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');

		// Uri to load styles into webview
		const stylesResetUri = webview.asWebviewUri(styleResetPath);
		const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

		// // Use a nonce to only allow specific scripts to be run
		// const nonce = getNonce();

		return `<!DOCTYPE html>
			<html lang='en'>
			<head>
				<meta charset='UTF-8'>
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta name='viewport' content='width=device-width, initial-scale=1.0'>
				<link href='${stylesResetUri}' rel='stylesheet'>
				<link href='${stylesMainUri}' rel='stylesheet'>
				<title>Cat Coding</title>
			</head>
			<body>
				<img src='${catGifPath}' width='300' />
				<h1 id='lines-of-code-counter'>0</h1>
			</body>
			</html>`;
            // <meta http-equiv='Content-Security-Policy' content='default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';'>
            // <script nonce='${nonce}' src='${scriptUri}'></script>
	}
}