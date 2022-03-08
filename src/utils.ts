import * as cp from 'child_process';
import * as vscode from 'vscode';
import { DocumentNodeEntry, DocumentNodeIndexSnapShot } from './DocumentNodeIndex';
import SymbolKinds from './SymbolKinds';

/**
 * ## getDateFormatted
 * @param convertDate 
 * @returns 
 */
export function getDateFormatted(convertDate: Date = new Date()): string {
    const yyyy = convertDate.getFullYear();
    const mm = convertDate.getMonth() + 1; // Months start at 0!
    const dd = convertDate.getDate();
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * ## processDocumentEntry
 * @param path absolute path of file parsed
 * @param symbols AST categories
 * @param depth depth lvel within AST
 * @param documentNodeEntry object to be enriched with data
 * @returns object enriched with data parsed from AST
 */
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

/**
 * ## createSnapshot
 * @param workspaceFolder object containing root file system location of repository
 * @param snapshotDate date formatted as string of `YYYY-mm-dd`
 * @param parseAppFilePatternInclude glob pattern to include functional application files
 * @param parseAppFilePatternExclude glob pattern to exclude functional application files
 * @param parseTestFilePatternInclude glob pattern to include test application files
 * @param parseCoverageStats if TRUE, files matching `parseTestFilePatternInclude` will be included
 * @param listParsedAppFiles if TRUE, filesystem path strings of parsed files will be included
 * @returns snapshot of parsed application profile
 */
export async function createSnapshot(opts: {
    workspaceFolderUri: vscode.WorkspaceFolder,
    snapshotDate: string,
    parseAppFilePatternInclude: vscode.GlobPattern,
    parseAppFilePatternExclude: vscode.GlobPattern,
    parseTestFilePatternInclude?: vscode.GlobPattern,
    parseCoverageStats?: boolean,
    listParsedAppFiles?: boolean,
}): Promise<DocumentNodeIndexSnapShot> {
    const snapShot: DocumentNodeIndexSnapShot = {
        snapshotDate: opts.snapshotDate,
        snapshotHash: scmGitGetCurrentCommitHash(opts.workspaceFolderUri),
        applicationStats: {
            ...(opts.listParsedAppFiles && ({ documentsParsedPaths: [] })),
            documentsParsedAmount: 0,
            stats: {},
        },
        ...( opts.parseCoverageStats && ({coverageStats: {
            ...(opts.listParsedAppFiles && ({ documentsParsedPaths: [] })),
            documentsParsedAmount: 0,
            testCaseOccurrences: 0,
        }})),
    };

    const matchedFilesUrisApp: vscode.Uri[] = await vscode.workspace.findFiles(opts.parseAppFilePatternInclude, opts.parseAppFilePatternExclude, 100);
    if (!matchedFilesUrisApp || matchedFilesUrisApp.length === 0) {
        vscode.window.showWarningMessage(`No files found with inclusive pattern "${opts.parseAppFilePatternInclude}" and exclusive pattern "${opts.parseAppFilePatternExclude}".`);
        return snapShot;
    }

    // parse application stats
    const tasksApp: Thenable<void>[] = matchedFilesUrisApp.map(async (uri: vscode.Uri) => {
        const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            uri,
        );
        const parsedData = processDocumentEntry(uri.path, symbols, 0);
        if (opts.listParsedAppFiles) {
            snapShot.applicationStats!.documentsParsedPaths!.push(uri.path);   
        }
        snapShot.applicationStats!.documentsParsedAmount++;

        Object.entries(parsedData.documentNodes).forEach(([symbolKey, occurrences]: [string, number]) => {
            // `constructor` causing problems reading and is irrelevant for stats parsing
            if (symbolKey === 'constructor') {
                return;
            }
            if (snapShot.applicationStats!.stats[symbolKey]) {
                snapShot.applicationStats!.stats[symbolKey] = snapShot.applicationStats!.stats[symbolKey] + occurrences;
            } else {
                snapShot.applicationStats!.stats[symbolKey] = occurrences;
            }
        });
    });

    // parse application coverage
    let tasksCoverage: Thenable<void>[] = [];
    if (opts.parseCoverageStats && opts.parseTestFilePatternInclude) {
        const matchedFilesUrisCoverage: vscode.Uri[] = await vscode.workspace.findFiles(opts.parseTestFilePatternInclude, null, 100);
        if (!matchedFilesUrisCoverage || matchedFilesUrisCoverage.length === 0) {
            vscode.window.showWarningMessage(`No test files found with inclusive pattern "${opts.parseTestFilePatternInclude}".`);
            return snapShot;
        }
        tasksCoverage = matchedFilesUrisCoverage.map(async (uri: vscode.Uri) => {
            if (opts.listParsedAppFiles) {
                snapShot.coverageStats!.documentsParsedPaths!.push(uri.path);   
            }
            snapShot.coverageStats!.documentsParsedAmount++;
            // try to parse test cases
            const testCasePattern = new RegExp(/\sit\(/, 'gi');
            const fileContent = await vscode.workspace.fs.readFile(uri);
            const fileContentString = Buffer.from(fileContent).toString('utf8');
            const occurrences = fileContentString.match(testCasePattern);
            if (Array.isArray(occurrences) && occurrences.length > 0) {
                snapShot.coverageStats!.testCaseOccurrences = snapShot.coverageStats!.testCaseOccurrences + occurrences.length;
            }

        });
    }

    const allTasks: Thenable<void>[] = [ ...tasksApp ];
    if (opts.parseCoverageStats && tasksCoverage.length > 0) {
        allTasks.concat(tasksCoverage);
    }
    await showLoadingInProgress(async () => {
        await Promise.all(allTasks);
    });

    return snapShot;
}

/**
 * ## showLoadingInProgress
 * @param asyncFn async method triggering loading indicator until completed
 */
export async function showLoadingInProgress(asyncFn: () => Promise<void>): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        cancellable: false,
        title: 'Extension test-profitability: Extracting repository data'
    }, async (progress) => {
        progress.report({  increment: 0 });
        await asyncFn();
        progress.report({ increment: 100 });
    });
}

/**
 * ## scmGitCleanup
 * @param workspaceFolder object containing root file system location of repository
 * @returns commit hash of current Git repo state
 */
 export function scmGitGetCurrentCommitHash(
    workspaceFolder: vscode.WorkspaceFolder,
): string {
    const procGitCheckout: cp.SpawnSyncReturns<Buffer> = cp.spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: workspaceFolder.uri.path
    });
    const sanitizedValue = String(procGitCheckout.stdout).replace(/^\s+|\s+$/g, '');
    return sanitizedValue;
}

/**
 * ## scmGitCleanup
 * @param workspaceFolder object containing root file system location of repository
 * @param branch name of Git branch
 */
export function scmGitCleanup(
    workspaceFolder: vscode.WorkspaceFolder,
    branch: string,
): void {
    const procGitCheckout: cp.SpawnSyncReturns<Buffer> = cp.spawnSync('git', ['checkout', branch], {
        cwd: workspaceFolder.uri.path
    });
    console.log('!!! scmGitCleanup: ' + String(procGitCheckout.stdout));
}

/**
 * ## scmGitCheckoutBefore
 * @param workspaceFolder object containing root file system location of repository
 * @param branch name of Git branch
 * @param year Search for commit near to year, e. g. `2017`
 * @param month Search for commit near to month, e. g. `3`
 */
export function scmGitCheckoutBefore(
    workspaceFolder: vscode.WorkspaceFolder,
    branch: string,
    year: number,
    month: number,
): void {
    const _month = month < 10 ? `0${month}` : `${month}`;
    console.log( `!!! scmGitCheckoutBefore.year, month:`, year, _month );
    const procGitRevList: cp.SpawnSyncReturns<Buffer> = cp.spawnSync('git', ['rev-list', '--max-count=1', `--before="${year}-${_month}-01 00:00"`, 'dev'], {
        cwd: workspaceFolder.uri.path
    });
    const revListOutput = String(procGitRevList.stdout).replace(/^\s+|\s+$/g, '');
    console.log( '!!! scmGitCheckoutBefore.revListOutput:', JSON.stringify(revListOutput, null, 4) );
    const procGitCheckout: cp.SpawnSyncReturns<Buffer> = cp.spawnSync('git', ['checkout', revListOutput], {
        cwd: workspaceFolder.uri.path
    });
    console.log('!!! scmGitCheckoutBefore.stderr:' + String(procGitCheckout.stderr));
}
/**
 * ## extractRepositoryData
 * @param workspaceFolder object containing root file system location of repository
 * @param branch name of Git branch
 * @param startYear Search for commit near to year, e. g. `2017`
 * @param startMonth Search for commit near to month, e. g. `3`
 * @param parseAppFilePatternInclude glob pattern to include functional application files
 * @param parseAppFilePatternExclude glob pattern to exclude functional application files
 * @param parseTestFilePatternInclude glob pattern to include test application files
 * @param parseCoverageStats if TRUE, files matching `parseTestFilePatternInclude` will be included
 * @param listParsedAppFiles if TRUE, filesystem path strings of parsed files will be included
 * @returns application profile snapshot data object
 */
export async function extractRepositoryData(opts: {
    workspaceFolderUri: vscode.WorkspaceFolder,
    branch: string,
    startYear: string,
    startMonth: string,
    parseAppFilePatternInclude: vscode.GlobPattern,
    parseAppFilePatternExclude: vscode.GlobPattern,
    parseTestFilePatternInclude?: vscode.GlobPattern,
    parseCoverageStats?: boolean,
    listParsedFiles?: boolean,
}): Promise<DocumentNodeIndexSnapShot[]> {
    // clean up
    scmGitCleanup(opts.workspaceFolderUri, opts.branch);

    const retVal: DocumentNodeIndexSnapShot[] = [];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const startDate = new Date(`${opts.startYear}-${opts.startMonth}-01`);
    const endDate = new Date(`${currentYear}-${currentMonth}-01`);

    await showLoadingInProgress(async () => {
        var loop = new Date(startDate);
        while(loop <= endDate) {
            console.log( '!!! loop current date:', JSON.stringify(loop, null, 4) );
            const _currentMonth = loop.getMonth() + 1;
            const _currentYear = loop.getFullYear();
            // checkout at date
            scmGitCheckoutBefore(opts.workspaceFolderUri, opts.branch, _currentYear, _currentMonth);
    
            // get software complexity data
            const snapshotData = await createSnapshot({
                workspaceFolderUri: opts.workspaceFolderUri,
                snapshotDate: getDateFormatted(loop),
                parseAppFilePatternInclude: opts.parseAppFilePatternInclude,
                parseAppFilePatternExclude: opts.parseAppFilePatternExclude,
                parseTestFilePatternInclude: opts.parseTestFilePatternInclude,
                parseCoverageStats: opts.parseCoverageStats,
                listParsedAppFiles: opts.listParsedFiles,
            });
            retVal.push(snapshotData);

            const newDate = new Date(loop.setMonth(loop.getMonth() + 1));
            loop = new Date(newDate);
        }
    });
    // clean up
    scmGitCleanup(opts.workspaceFolderUri, opts.branch);
    return retVal;
}
