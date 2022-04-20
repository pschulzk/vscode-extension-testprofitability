import * as cp from 'child_process';
import * as vscode from 'vscode';
import { IDocumentNodeEntry, IDocumentNodeIndexSnapShot, IMetricHalstead } from './DocumentNodeIndex';
import SymbolKinds from './SymbolKinds';
const tscomplex = require('ts-complex');

/**
 * Get potential bugs contained in an application based on Gaffney's formula
 * @param loc amount of lines of code
 * @returns amount of potential bugs devlivered
 */
export function getMetricGaffney(loc: number): any {
    const GAFFNEY_CONST_A = 4.2;
    const GAFFNEY_CONST_B = 0.0015;
    return Math.floor(GAFFNEY_CONST_A + GAFFNEY_CONST_B * Math.pow(loc, (4/3)));
}

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
    documentNodeEntry?: IDocumentNodeEntry,
): IDocumentNodeEntry {
    let _documentNodeEntry: IDocumentNodeEntry;
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
    cancellationToken: vscode.CancellationToken,
    workspaceFolderUri: vscode.WorkspaceFolder,
    snapshotDate: string,
    parseAppFilePatternInclude: vscode.GlobPattern,
    parseAppFilePatternExclude: vscode.GlobPattern,
    parseTestFilePatternInclude?: vscode.GlobPattern,
    parseCoverageStats?: boolean,
    listParsedAppFiles?: boolean,
}): Promise<IDocumentNodeIndexSnapShot> {
    const currentCommitHash = scmGitGetCurrentCommitHash(opts.workspaceFolderUri);
    const snapShot: IDocumentNodeIndexSnapShot = {
        snapshotDate: opts.snapshotDate,
        snapshotHash: scmGitGetCurrentCommitHash(opts.workspaceFolderUri),
        applicationStats: {
            ...(opts.listParsedAppFiles && ({ documentsParsedPaths: [] })),
            documentsParsedAmount: 0,
            locIncludingTests: 0,
            locExcludingTests: 0,
            stats: {},
            metrics: {
                gaffney: {
                    bugsIncludingTests: 0,
                    bugsExcludingTests: 0,
                    bugsTestsOnly: 0,
                },
                halstead: {
                    length: 0,
                    vocabulary: 0,
                    volume: 0,
                    difficulty: 0,
                    effort: 0,
                    time: 0,
                    bugsDelivered: 0,
                    operands: 0,
                    operators: 0,
                }
            },
        },
        ...( opts.parseCoverageStats && ({coverageStats: {
            ...(opts.listParsedAppFiles && ({ documentsParsedPaths: [] })),
            documentsParsedAmount: 0,
            locTestsOnly: 0,
            testCaseOccurrences: 0,
        }})),
    };
    const errorMessage = 'Operation has been cancelled';

    const matchedFilesUrisApp: vscode.Uri[] = await vscode.workspace.findFiles(opts.parseAppFilePatternInclude, opts.parseAppFilePatternExclude);
    if (!matchedFilesUrisApp || matchedFilesUrisApp.length === 0) {
        vscode.window.showWarningMessage(
            `No files found with inclusive pattern "${opts.parseAppFilePatternInclude}" and exclusive pattern "${opts.parseAppFilePatternExclude}" at commit with hash "${currentCommitHash}".`
        );
        return snapShot;
    }

    // parse application stats
    const tasksApp: Thenable<void>[] = matchedFilesUrisApp.map(async (uri: vscode.Uri) => {
        if (opts.cancellationToken.isCancellationRequested) {
            throw new Error(errorMessage);
        }
        const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            uri,
        );
        // count lines of count
        snapShot.applicationStats!.locExcludingTests = snapShot.applicationStats!.locExcludingTests + getFolderLOC(opts.workspaceFolderUri, uri);
        const parsedData = processDocumentEntry(uri.path, symbols, 0);
        if (opts.listParsedAppFiles) {
            snapShot.applicationStats!.documentsParsedPaths!.push(uri.path);   
        }
        snapShot.applicationStats!.documentsParsedAmount++;

        Object.entries(parsedData.documentNodes).forEach(([symbolKey, occurrences]: [string, number]) => {
            if (snapShot.applicationStats!.stats[symbolKey]) {
                snapShot.applicationStats!.stats[symbolKey] = snapShot.applicationStats!.stats[symbolKey] + occurrences;
            } else {
                snapShot.applicationStats!.stats[symbolKey] = occurrences;
            }
        });

        // Metric Halstead via ts-complex
        const metricHalsteadFunctions: { [key: string]: IMetricHalstead; } = tscomplex.calculateHalstead(uri.path);
        Object.values(metricHalsteadFunctions).forEach((metricHalstead) => {
            Object.entries(metricHalstead).forEach(([param, val]) => {
                const _param = param as keyof IMetricHalstead;
                if (!['operands', 'operators'].includes(_param)) {
                    if (!Number.isNaN(val)) {
                        snapShot.applicationStats!.metrics.halstead[_param] = snapShot.applicationStats!.metrics.halstead[_param] + val;
                    }
                } else {
                    // because:
                    // operands/operators: {
                    //     total: number;
                    //     _unique: string[];
                    //     unique: number;
                    // };
                    snapShot.applicationStats!.metrics.halstead[_param] = snapShot.applicationStats!.metrics.halstead[_param] + val.total;
                }
            });
        });
        
    });

    // parse application coverage
    let tasksCoverage: Thenable<void>[] = [];
    if (opts.parseCoverageStats && opts.parseTestFilePatternInclude) {
        const matchedFilesUrisCoverage: vscode.Uri[] = await vscode.workspace.findFiles(opts.parseTestFilePatternInclude, null);
        if (!matchedFilesUrisCoverage || matchedFilesUrisCoverage.length === 0) {
            vscode.window.showWarningMessage(`No test files found with inclusive pattern "${opts.parseTestFilePatternInclude}" at commit with hash "${currentCommitHash}".`);
            return snapShot;
        }
        tasksCoverage = matchedFilesUrisCoverage.map(async (uri: vscode.Uri) => {
            if (opts.cancellationToken.isCancellationRequested) {
                throw new Error(errorMessage);
            }
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

            snapShot.coverageStats!.locTestsOnly = snapShot.coverageStats!.locTestsOnly + getFolderLOC(opts.workspaceFolderUri, uri);

        });
    }

    const allTasks: Thenable<void>[] = [ ...tasksApp ];
    if (opts.parseCoverageStats && tasksCoverage.length > 0) {
        allTasks.concat(tasksCoverage);
    }
    await Promise.all(allTasks);

    // beautify
    Object.entries(snapShot.applicationStats!.metrics.halstead).forEach(([param, val]) => {
        const _param = param as keyof IMetricHalstead;
        snapShot.applicationStats!.metrics.halstead[_param] = Math.floor(snapShot.applicationStats!.metrics.halstead[_param]);
    });

    // sum LOCs
    snapShot.applicationStats!.locIncludingTests = snapShot.applicationStats!.locExcludingTests + snapShot.coverageStats!.locTestsOnly;

    // metric Gaffney
    snapShot.applicationStats!.metrics.gaffney.bugsIncludingTests = getMetricGaffney(snapShot.applicationStats!.locIncludingTests);
    snapShot.applicationStats!.metrics.gaffney.bugsExcludingTests = getMetricGaffney(snapShot.applicationStats!.locExcludingTests);
    snapShot.applicationStats!.metrics.gaffney.bugsTestsOnly = getMetricGaffney(snapShot.coverageStats!.locTestsOnly);

    return snapShot;
}

/**
 * ## showLoadingInProgress
 * @param asyncFn async method triggering loading indicator until completed
 */
export async function showLoadingInProgress(asyncFn: (cancellationToken: vscode.CancellationToken) => Promise<void>): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Window,
            cancellable: true,
            title: 'Parsing application profile data',
        },
        async (progress, cancellationToken) => {
            progress.report({ increment: 0 });
            await asyncFn(cancellationToken);
            progress.report({ increment: 100 });
        },
    );
}

/**
 * ## getFolderLOC
 * @param documentUri object containing document file system location of repository
 * @returns amount of Lines of Code
 */
 export function getFolderLOC(
    workspaceFolder: vscode.WorkspaceFolder,
    documentUri: vscode.Uri,
): number {
    const procGitCheckout: cp.SpawnSyncReturns<Buffer> = cp.spawnSync('wc', ['-l', documentUri.path], { cwd: workspaceFolder.uri.path });
    const sanitizedValue = String(procGitCheckout.stdout).replace(/^\s+|\s+$/g, '');
    const parsedInt = parseInt(sanitizedValue, 10);
    return parsedInt;
}

/**
 * ## scmGitGetCurrentCommitHash
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
}): Promise<IDocumentNodeIndexSnapShot[]> {
    // clean up
    scmGitCleanup(opts.workspaceFolderUri, opts.branch);

    const retVal: IDocumentNodeIndexSnapShot[] = [];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const startDate = new Date(`${opts.startYear}-${opts.startMonth}-01`);
    const endDate = new Date(`${currentYear}-${currentMonth}-01`);

    await showLoadingInProgress(async (cancellationToken: vscode.CancellationToken) => {
        var loop = new Date(startDate);
        while (loop <= endDate) {
            if (cancellationToken.isCancellationRequested) {
                vscode.window.showErrorMessage('Operation has been cancelled');
                break;
            }
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
                cancellationToken,
            });

            if (!snapshotData) {
                return;
            }
            
            retVal.push(snapshotData);

            const newDate = new Date(loop.setMonth(loop.getMonth() + 1));
            loop = new Date(newDate);
        }
    });
    // clean up
    scmGitCleanup(opts.workspaceFolderUri, opts.branch);
    return retVal;
}
