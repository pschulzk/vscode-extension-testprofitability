export interface DocumentNodeIndex {
    projectName: string;
    documentsParsed: string[];
    stats: {
        [key: string]: number;
    };
}

export interface DocumentNodeEntry {
    path: string;
    documentNodes: {
        // [key: string]: string[];
        [key: string]: number;
    };
}