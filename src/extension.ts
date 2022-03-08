/* eslint-disable @typescript-eslint/naming-convention */
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in code below
import * as vscode from 'vscode';
import { DocumentNodeIndex } from './DocumentNodeIndex';
import { createSnapshot, extractRepositoryData, getDateFormatted } from './utils';

const OPTION_LIST_PARSED_FILES_PATHS: boolean = true;
const userInputBranchToAnalyze = 'dev';
const OPTION_PARSE_FILE_PATTERN_INCLUDE: vscode.GlobPattern = '*.ts';
const OPTION_PARSE_FILE_PATTERN_EXCLUDE: vscode.GlobPattern = '*{.,-}{po,spec,d}.ts';
// const PARSE_FILE_PATTERN_EXCLUDE: vscode.GlobPattern = '**/{node_modules/**}?/*.{po,spec,d}.ts';

/**
 * ## Command: ParseWorkspace
*/
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

    mydata.currentState = await createSnapshot(
        getDateFormatted(),
        OPTION_PARSE_FILE_PATTERN_INCLUDE,
        OPTION_PARSE_FILE_PATTERN_EXCLUDE,
        OPTION_LIST_PARSED_FILES_PATHS,
    );
    const myDataAsText = JSON.stringify(mydata, null, 4);

    // show results
    vscode.workspace.openTextDocument({ content: myDataAsText }).then(doc => {
        vscode.window.showTextDocument(doc);
    });
}

/**
 * ## Command: ParseWorkspaceSnapshotsGit
*/
async function commandParseWorkspaceSnapshotsGit(): Promise<void> {
    let undoStopBefore = true;
    const mydata: DocumentNodeIndex = {};

    const showInputBoxOptions: vscode.InputBoxOptions = {
        placeHolder: '',
        validateInput: (param: string) => {
            if (!param) {
                return 'Syntax error. Provide valid string';
            }
        },
    };
    const userInputProjectName: string | undefined = await vscode.window.showInputBox(showInputBoxOptions);
    if (!userInputProjectName || typeof userInputProjectName !== 'string') {
        // undo
        if (!undoStopBefore) {
            vscode.commands.executeCommand('undo');
        }
        vscode.window.showErrorMessage('Invalid input string for project name.');
        return;
    } else {
        mydata.projectName = userInputProjectName;
    }
    showInputBoxOptions.value = '2021';
    const userInputStartYear: string | undefined = await vscode.window.showInputBox(showInputBoxOptions);
    if (!userInputStartYear || typeof userInputStartYear !== 'string') {
        // undo
        if (!undoStopBefore) {
            vscode.commands.executeCommand('undo');
        }
        vscode.window.showErrorMessage('Invalid input string for start year.');
        return;
    }
    showInputBoxOptions.value = '09';
    const userInputStartMonth: string | undefined = await vscode.window.showInputBox(showInputBoxOptions);
    if (!userInputStartMonth || typeof userInputStartMonth !== 'string') {
        // undo
        if (!undoStopBefore) {
            vscode.commands.executeCommand('undo');
        }
        vscode.window.showErrorMessage('Invalid input string for start month.');
        return;
    }

    if (!Array.isArray(vscode.workspace.workspaceFolders) || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folders. Add at least one folder to workspace.');
        return;
    }
    const mainWorkspaceFolderUri: vscode.WorkspaceFolder = vscode.workspace.workspaceFolders[0];

    mydata.snapShots = await extractRepositoryData(
        mainWorkspaceFolderUri,
        userInputBranchToAnalyze,
        userInputStartYear,
        userInputStartMonth,
        OPTION_PARSE_FILE_PATTERN_INCLUDE,
        OPTION_PARSE_FILE_PATTERN_EXCLUDE,
        OPTION_LIST_PARSED_FILES_PATHS
    );
    const myDataAsText = JSON.stringify(mydata, null, 4);

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
// class MainCodingPanel {
//     /**
//      * Track the currently panel. Only allow a single panel to exist at a time.
//      */
//     public static currentPanel: MainCodingPanel | undefined;
    
//     public static readonly viewType = 'catCoding';
    
//     private readonly _panel: vscode.WebviewPanel;
//     private readonly _extensionUri: vscode.Uri;
//     private _disposables: vscode.Disposable[] = [];
    
//     public static createOrShow(extensionUri: vscode.Uri) {
//         const column = vscode.window.activeTextEditor
//         ? vscode.window.activeTextEditor.viewColumn
//         : undefined;
        
//         // If we already have a panel, show it.
//         if (MainCodingPanel.currentPanel) {
//             MainCodingPanel.currentPanel._panel.reveal(column);
//             return;
//         }
        
//         // Otherwise, create a new panel.
//         const panel = vscode.window.createWebviewPanel(
//             MainCodingPanel.viewType,
//             'Test Profitability',
//             column || vscode.ViewColumn.One,
//             // getWebviewOptions(extensionUri),
//         );
            
//         MainCodingPanel.currentPanel = new MainCodingPanel(panel, extensionUri);
//     }
    
//     public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
//         MainCodingPanel.currentPanel = new MainCodingPanel(panel, extensionUri);
//     }
    
//     private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
//         this._panel = panel;
//         this._extensionUri = extensionUri;
        
//         // Set the webview's initial html content
//         this._update();
        
//         // Listen for when the panel is disposed
//         // This happens when the user closes the panel or when the panel is closed programmatically
//         this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
//         // Update the content based on view changes
//         this._panel.onDidChangeViewState(
//             e => {
//                 if (this._panel.visible) {
//                     this._update();
//                 }
//             },
//             null,
//             this._disposables
//         );
            
//         // Handle messages from the webview
//         this._panel.webview.onDidReceiveMessage(
//             message => {
//                 switch (message.command) {
//                     case 'alert':
//                     vscode.window.showErrorMessage(message.text);
//                     return;
//                 }
//             },
//             null,
//             this._disposables
//         );
//     }
        
//     public doRefactor() {
//         // Send a message to the webview webview.
//         // You can send any JSON serializable data.
//         this._panel.webview.postMessage({ command: 'refactor' });
//     }
    
//     public dispose() {
//         MainCodingPanel.currentPanel = undefined;
        
//         // Clean up our resources
//         this._panel.dispose();
        
//         while (this._disposables.length) {
//             const x = this._disposables.pop();
//             if (x) {
//                 x.dispose();
//             }
//         }
//     }
    
//     private _update() {
//         const webview = this._panel.webview;
//         this._updatePanel(webview, 'Compiling Cat');
        
//         // // Vary the webview's content based on where it is located in the editor.
//         // switch (this._panel.viewColumn) {
//         //     case vscode.ViewColumn.Two:
//         //         this._updateForCat(webview, 'Compiling Cat');
//         //         return;
            
//         //     case vscode.ViewColumn.Three:
//         //         this._updateForCat(webview, 'Testing Cat');
//         //         return;
            
//         //     case vscode.ViewColumn.One:
//         //         default:
//         //         this._updateForCat(webview, 'Coding Cat');
//         //         return;
//         // }
//     }

//     private _updatePanel(webview: vscode.Webview, panelName: string) {
// 		this._panel.title = panelName;
// 		this._panel.webview.html = this._getHtmlForWebview(webview, panelName);
// 	}

//     private _getHtmlForWebview(webview: vscode.Webview, catGifPath: string) {
// 		// Local path to main script run in the webview
// 		const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');

// 		// And the uri we use to load this script in the webview
// 		const scriptUri = (scriptPathOnDisk).with({ 'scheme': 'vscode-resource' });

// 		// Local path to css styles
// 		const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css');
// 		const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');

// 		// Uri to load styles into webview
// 		const stylesResetUri = webview.asWebviewUri(styleResetPath);
// 		const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

// 		// // Use a nonce to only allow specific scripts to be run
// 		// const nonce = getNonce();

// 		return `<!DOCTYPE html>
// 			<html lang='en'>
// 			<head>
// 				<meta charset='UTF-8'>
// 				<!--
// 					Use a content security policy to only allow loading images from https or from our extension directory,
// 					and only allow scripts that have a specific nonce.
// 				-->
// 				<meta name='viewport' content='width=device-width, initial-scale=1.0'>
// 				<link href='${stylesResetUri}' rel='stylesheet'>
// 				<link href='${stylesMainUri}' rel='stylesheet'>
// 				<title>Cat Coding</title>
// 			</head>
// 			<body>
// 				<img src='${catGifPath}' width='300' />
// 				<h1 id='lines-of-code-counter'>0</h1>
// 			</body>
// 			</html>`;
//             // <meta http-equiv='Content-Security-Policy' content='default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';'>
//             // <script nonce='${nonce}' src='${scriptUri}'></script>
// 	}
// }