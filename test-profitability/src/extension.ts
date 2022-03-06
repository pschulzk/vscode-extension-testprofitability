// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import path = require('path');
import * as vscode from 'vscode';
import { DocumentNodeEntry, DocumentNodeIndex } from './DocumentNodeIndex';
import SymbolKinds from './SymbolKinds';

function processDocumentEntry(path: string, symbols: vscode.DocumentSymbol[], depth: number, documentNodeEntry?: DocumentNodeEntry): DocumentNodeEntry {
    
    let _documentNodeEntry: DocumentNodeEntry;
    if (!documentNodeEntry) {
        _documentNodeEntry = {
            path,
            documentNodes: {},
        };
        // SymbolKinds.forEach(s => _documentNodeEntry.documentNodes[s] = []);
        SymbolKinds.forEach(s => _documentNodeEntry.documentNodes[s] = 0);
    } else {
        _documentNodeEntry = documentNodeEntry;
    }
    

    for (const symbol of symbols) {
        // store amount of symbol in index
        const currentKey = `${SymbolKinds[symbol.kind]}`;
        // _documentNodeEntry.documentNodes[currentKey].push(symbol.name);
        _documentNodeEntry.documentNodes[currentKey]++;

        if (symbol.children) {
            processDocumentEntry(path, symbol.children, depth + 1, _documentNodeEntry);
        }
    }

    return _documentNodeEntry;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Extension "test-profitability" is now active!');
    
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('test-profitability.parseWorkspace', () => {

        let undoStopBefore = true;
        // const rootFolderUri: vscode.Uri = vscode.window.activeTextEditor.document.fileName;
        const userTextInputOptions: vscode.InputBoxOptions = {
            placeHolder: '',
            validateInput: (param: string) => {
                if (!param) {
                    return 'Syntax error. Provide valid string';
                }
            },
        };
        const userInputData: {
            projectName: string | null;
            selectedFolders: vscode.Uri[] | null;
        } = {
            projectName: null,
            selectedFolders: null,
        };

        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        vscode.window.showInformationMessage(`!!! Extension 'test-profitability' .`);
        
        if (!vscode.window.activeTextEditor) {
            vscode.window.showWarningMessage('There must be an active text editor');
            return;
        }

        vscode.window.showInputBox(userTextInputOptions)
            .then((userInput: unknown) => {
                if (!userInput || typeof userInput !== 'string') {
                    // undo
                    if (!undoStopBefore) {
                        vscode.commands.executeCommand('undo');
                    }
                    throw new Error(`ERROR: invalid input string for projectName!`);
                } else {
                    userInputData.projectName = userInput;
                    return;
                }
            })
            .then(() => {
                const includePattern: vscode.GlobPattern = '*.ts';
                const excludePattern: vscode.GlobPattern = '*.{po,spec,d}.ts';
                return vscode.workspace.findFiles(`**/${includePattern}`, `**/${excludePattern}`, 50).then((uris: vscode.Uri[]) => {
                    if (!uris || uris.length === 0) {
                        throw new Error(`No files found with extension '${includePattern}'.`);
                    }
                    return uris;
                });
            })
            .then((uris: vscode.Uri[]) => {

                const mydata: DocumentNodeIndex = {
                    projectName: userInputData.projectName!,
                    documentsParsed: [],
                    stats: {},
                };

                const tasks: Thenable<void>[] = uris.map(uri => {
                    return (vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', vscode.Uri.file(vscode.window.activeTextEditor!.document.fileName)) as Thenable<vscode.DocumentSymbol[]>)
                        .then((symbols: vscode.DocumentSymbol[]) => {

                            const parsedData = processDocumentEntry(uri.path, symbols, 0);
                            // mydata.documents.push( parsedData );
                            mydata.documentsParsed!.push( uri.path );

                            Object.entries(parsedData.documentNodes).forEach(([symbolKey, occurrences]: [string, number]) => {
                                // `constructor` causing problems reading and is irrelevant for stats parsing
                                if (symbolKey === 'constructor') {
                                    return;
                                }
                                if (mydata.stats[symbolKey]) {
                                    mydata.stats[symbolKey] = mydata.stats[symbolKey] + occurrences;
                                } else {
                                    mydata.stats[symbolKey] = occurrences;
                                }
                                
                            });
                            return;
                    });
                });
                return Promise.all(tasks)
                    .then(() => mydata);

            })
            .then((mydata: DocumentNodeIndex) => {
                console.log( '!!! mydata:', JSON.stringify(mydata, null, 4) );
                
                // vscode.workspace.openTextDocument({ content: JSON.stringify(mydata, null, 4) }).then(doc => {
                    // vscode.window.showTextDocument(doc);
    
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
                // });
            });

        
    });
    
    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}


/**
* Manages cat coding webview panels
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