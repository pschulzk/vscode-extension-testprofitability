import * as vscode from 'vscode';
import { IDocumentNodeIndex } from './DocumentNodeIndex';
import { createSnapshot, extractRepositoryData, getDateFormatted, showLoadingInProgress } from './utils';
import { EXTENSION_VERSION } from './version';

const OPTION_LIST_PARSED_APP_FILES_PATHS: boolean = false;
const OPTION_PARSE_COVERGAGE_STATS: boolean = true;
const userInputBranchToAnalyze = 'dev';
const OPTION_PARSE_APP_FILE_PATTERN_INCLUDE: vscode.GlobPattern = '**/*.ts';
const OPTION_PARSE_APP_FILE_PATTERN_EXCLUDE: vscode.GlobPattern = '**/*.{e2e-spec,d,po,spec,test}.ts';
const OPTION_PARSE_TEST_FILE_PATTERN_INCLUDE: vscode.GlobPattern = '**/*.spec.ts';

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
    const mydata: IDocumentNodeIndex = {
        version: EXTENSION_VERSION,
        projectName: 'PROJECT_NAME_PLACEHOLDER',
        timestamp: Math.floor( new Date().getTime() / 1000 ),
    };

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
    const mainWorkspaceFolderUri: vscode.WorkspaceFolder = vscode.workspace.workspaceFolders[0];
    await showLoadingInProgress(async (cancellationToken: vscode.CancellationToken) => {
        mydata.currentState = await createSnapshot({
            cancellationToken,
            workspaceFolderUri: mainWorkspaceFolderUri,
            snapshotDate: getDateFormatted(),
            parseAppFilePatternInclude: OPTION_PARSE_APP_FILE_PATTERN_INCLUDE,
            parseAppFilePatternExclude: OPTION_PARSE_APP_FILE_PATTERN_EXCLUDE,
            parseTestFilePatternInclude: OPTION_PARSE_TEST_FILE_PATTERN_INCLUDE,
            parseCoverageStats: OPTION_PARSE_COVERGAGE_STATS,
            listParsedAppFiles: OPTION_LIST_PARSED_APP_FILES_PATHS,
        });
    });
    
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
    const mydata: IDocumentNodeIndex = {
        version: EXTENSION_VERSION,
        projectName: 'PROJECT_NAME_PLACEHOLDER',
        timestamp: Math.floor( new Date().getTime() / 1000 ),
    };

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
    showInputBoxOptions.value = '2018';
    const userInputStartYear: string | undefined = await vscode.window.showInputBox(showInputBoxOptions);
    if (!userInputStartYear || typeof userInputStartYear !== 'string') {
        // undo
        if (!undoStopBefore) {
            vscode.commands.executeCommand('undo');
        }
        vscode.window.showErrorMessage('Invalid input string for start year.');
        return;
    }
    showInputBoxOptions.value = '1';
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
    mydata.snapShots = await extractRepositoryData({
        workspaceFolderUri: mainWorkspaceFolderUri,
        branch: userInputBranchToAnalyze,
        startYear: userInputStartYear,
        startMonth: userInputStartMonth,
        parseAppFilePatternInclude: OPTION_PARSE_APP_FILE_PATTERN_INCLUDE,
        parseAppFilePatternExclude: OPTION_PARSE_APP_FILE_PATTERN_EXCLUDE,
        parseTestFilePatternInclude: OPTION_PARSE_TEST_FILE_PATTERN_INCLUDE,
        parseCoverageStats: OPTION_PARSE_COVERGAGE_STATS,
        listParsedFiles: OPTION_LIST_PARSED_APP_FILES_PATHS,
    });
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
}

// this method is called when extension is deactivated
export function deactivate() {}
