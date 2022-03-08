export interface DocumentNodeIndex {
    projectName?: string;
    currentState?: DocumentNodeIndexSnapShot;
    snapShots?: DocumentNodeIndexSnapShot[]; 
}

export interface DocumentNodeIndexSnapShot {
    snapshotDate: string;
    documentsParsedPaths?: string[];
    documentsParsedAmount: number;
    stats: {
        [key: string]: number;
    };
}

export interface DocumentNodeEntry {
    path: string;
    documentNodes: {
        [key: string]: number;
    };
}