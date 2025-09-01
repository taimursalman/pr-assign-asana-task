// CodeReviewTaimurSDone: formatting issues
export interface AsanaUser {
    gid: string;
    name: string;
    email: string;
}

export interface AsanaUserResponse {
    data: AsanaUser[];
    errors?: any[];
}

export interface AsanaWorkspace {
    gid: string;
    name: string;
}

export interface AsanaTaskProject {
    gid: string;
    name: string;
}

export interface AsanaWorkspaceResponse {
    data: {
        gid: string;
        // CodeReviewTaimurSDone: old array notation. make an interface for {gid, name} then do obj[]
        workspaces: AsanaWorkspace[];
    };
}

export interface AsanaTaskResponse {
    data: {
        gid: string;
        name: string;
        assignee?: AsanaUser;
        // CodeReviewTaimurSDone: old array notation. make an interface for {gid, name} then do obj[]
        projects: AsanaTaskProject[];
    };
}

export interface AsanaTaskSearchData {
    gid: string;
    name: string;
    assignee?: AsanaUser;
    notes?: string;
}

export interface AsanaTaskSearchLazyData {
    offset: string;
    path: string;
    uri: string;
}

export interface AsanaTaskSearchResponse {
    data: AsanaTaskSearchData[];
    next_page: AsanaTaskSearchLazyData | null;
}

export interface ReviewerEmailResult {
    reviewerLogin: string;
    reviewerEmail: string;
    skipAssignment: boolean;
}