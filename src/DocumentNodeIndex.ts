export interface DocumentNodeIndex {
    projectName: string;
    timestamp: number,
    currentState?: DocumentNodeIndexSnapShot;
    snapShots?: DocumentNodeIndexSnapShot[]; 
}

export interface DocumentNodeIndexSnapShot {
    snapshotDate: string;
    applicationStats?: {
        documentsParsedPaths?: string[];
        documentsParsedAmount: number;
        stats: {
            [key: string]: number;
        };
    };
    coverageStats?: {
        documentsParsedPaths?: string[];
        documentsParsedAmount: number;
        stats: {
            [key: string]: number;
        };
    };
}

export interface DocumentNodeEntry {
    path: string;
    documentNodes: {
        [key: string]: number;
    };
}