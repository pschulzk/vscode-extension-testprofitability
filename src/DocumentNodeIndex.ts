export interface IDocumentNodeIndex {
    projectName: string;
    timestamp: number,
    currentState?: IDocumentNodeIndexSnapShot;
    snapShots?: IDocumentNodeIndexSnapShot[]; 
}

export interface IDocumentNodeIndexSnapShot {
    snapshotDate: string;
    snapshotHash?: string;
    applicationStats?: {
        documentsParsedPaths?: string[];
        documentsParsedAmount: number;
        stats: {
            [key: string]: number;
        };
        metrics: {
            halstead: IMetricHalstead;
        };
    };
    coverageStats?: {
        documentsParsedPaths?: string[];
        documentsParsedAmount: number;
        testCaseOccurrences: number;
    };
}

export interface IDocumentNodeEntry {
    path: string;
    documentNodes: {
        [key: string]: number;
    };
}
export interface IMetricHalstead {
    length: number;
    vocabulary: number;
    volume: number;
    difficulty: number;
    effort: number;
    time: number;
    bugsDelivered: number;
    operands: number;
    operators: number;
}
