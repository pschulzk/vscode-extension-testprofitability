import * as cp from 'child_process';
import * as vscode from 'vscode';
import { DocumentNodeEntry, DocumentNodeIndexSnapShot } from './DocumentNodeIndex';
import SymbolKinds from './SymbolKinds';

export function getDateFormatted(convertDate: Date = new Date()): string {
    // const today = new Date();
    const yyyy = convertDate.getFullYear();
    const mm = convertDate.getMonth() + 1; // Months start at 0!
    const dd = convertDate.getDate();
    return `${yyyy}-${mm}-${dd}`;
}

export function processDocumentEntry(
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

export async function createSnapshot(
    snapshotDate: string,
    parseFilePatternInclude: vscode.GlobPattern,
    parseFilePatternExclude: vscode.GlobPattern,
    listParsedFiles: boolean = false,
): Promise<DocumentNodeIndexSnapShot> {
    const snapShot: DocumentNodeIndexSnapShot = {
        snapshotDate,
        ...( listParsedFiles && ({ documentsParsedPaths: [] }) ),
        documentsParsedAmount: 0,
        stats: {},
    };

    const matchedFilesUris: vscode.Uri[] = await vscode.workspace.findFiles(`**/${parseFilePatternInclude}`, `**/${parseFilePatternExclude}`, 10);
    if (!matchedFilesUris || matchedFilesUris.length === 0) {
        vscode.window.showWarningMessage(`No files found with inclusive pattern "${parseFilePatternInclude}" and exclusive pattern "${parseFilePatternExclude}".`);
        return snapShot;
    }

    const tasks: Thenable<void>[] = matchedFilesUris.map(async (uri: vscode.Uri) => {
        const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            uri,
        );
        const parsedData = processDocumentEntry(uri.path, symbols, 0);
        if (listParsedFiles) {
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

export async function showLoadingInProgress(asyncFn: () => Promise<void>): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        cancellable: false,
        title: 'Extracting repository data'
    }, async (progress) => {
        progress.report({  increment: 0 });
        await asyncFn();
        progress.report({ increment: 100 });
    });
}
export function scmGitCleanup(workspaceFolderUri: vscode.WorkspaceFolder, branch: string): void {
    const procGitCheckout: cp.SpawnSyncReturns<Buffer> = cp.spawnSync('git', ['checkout', branch], {
        cwd: workspaceFolderUri.uri.path
    });
    console.log('!!! scmGitCleanup: ' + String(procGitCheckout.stdout));
}
export function scmGitCheckoutBefore(workspaceFolderUri: vscode.WorkspaceFolder, branch: string, year: string, month: string): void {
    console.log( `!!! scmGitCheckoutBefore.year, month:`, year, month );
    scmGitCleanup(workspaceFolderUri, branch);
    const procGitRevList: cp.SpawnSyncReturns<Buffer> = cp.spawnSync('git', ['rev-list', '--max-count=1', `--before="${year}-${month}-01 00:00"`, 'dev'], {
        cwd: workspaceFolderUri.uri.path
    });
    const procGitCheckout: cp.SpawnSyncReturns<Buffer> = cp.spawnSync('git', ['checkout', String(procGitRevList.stdout)], {
        cwd: workspaceFolderUri.uri.path
    });
    console.log('!!! scmGitCheckoutBefore: ' + String(procGitCheckout.stdout));
}
export async function extractRepositoryData(
    workspaceFolderUri: vscode.WorkspaceFolder,
    branch: string,
    startYear: string,
    startMonth: string,
    parseFilePatternInclude: vscode.GlobPattern,
    parseFilePatternExclude: vscode.GlobPattern,
    listParsedFiles: boolean = false,
): Promise<DocumentNodeIndexSnapShot[]> {
    const retVal: DocumentNodeIndexSnapShot[] = [];

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const startDate = new Date(`${startYear}-${startMonth}-01`);
    const endDate = new Date(`${currentYear}-${currentMonth}-01`);

    await showLoadingInProgress(async () => {
        var loop = new Date(startDate);
        while(loop <= endDate) {
            console.log( '!!! loop current date:', JSON.stringify(loop, null, 4) );
            // checkout at date
            // scmGitCheckoutBefore(workspaceFolderUri, branch, currentYear, currentMonth);
    
            // get software complexity data
            const snapshotData = await createSnapshot(
                getDateFormatted(loop),
                parseFilePatternInclude,
                parseFilePatternExclude,
                listParsedFiles,
            );
            retVal.push(snapshotData);
            // TODO: get software test coverage data
            
            // const newDate = loop.setDate(loop.getDate() + 1);
            const newDate = new Date(loop.setMonth(loop.getMonth() + 1));
            loop = new Date(newDate);
        }
    });
    // clean up
    // scmGitCleanup(workspaceFolderUri, branch);
    return retVal;
}