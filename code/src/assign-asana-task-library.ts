import {info, warning} from '@actions/core';
import {
    AsanaTaskResponse,
    AsanaTaskSearchResponse, AsanaUser,
    AsanaUserResponse,
    AsanaWorkspaceResponse, ReviewerEmailResult
} from "@/assign-asana-task.types";
import {Octokit} from '@octokit/rest';
// CodeReviewTaimurSDone: this file isnt following the TS formatting standards
// CodeReviewTaimurDone: missing import for fetch

export const getTaskFromProject = async (prUrl: string, token: string, projectId: string): Promise<string | null> => {
    try {
        const urlParts = prUrl.split('/');
        const prNumber = urlParts[urlParts.length - 1]; // Get PR number
        if (urlParts.length < 3 || !urlParts[urlParts.length - 3]) {
            warning(`PR URL "${prUrl}" does not have the expected format to extract repository name.`);
            return null;
        }

        const repoName = (urlParts[urlParts.length - 3]).toLowerCase(); // Get repository name
        let offset: string | undefined = undefined;
        const limit = 100;

        do {
            let url = `https://app.asana.com/api/1.0/projects/${projectId}/tasks?opt_fields=gid,name,notes&limit=${limit}&sort_by=modified_at&sort_ascending=false`;
            if (offset) {
                url += `&offset=${encodeURIComponent(offset)}`;
            }

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                warning(`Failed to fetch project tasks: ${response.statusText}`);
                warning(JSON.stringify(await response.json()));
                return await getTaskFromRecentTasks(prUrl, token, projectId);
            }

            const data = await response.json() as AsanaTaskSearchResponse;
            const exactTask = data.data.find(task =>
                task.notes && task.notes.includes(prUrl)
            );

            if (exactTask) {
                return exactTask.gid;
            }

            const prNumberMatch = data.data.find(task => {
                const hasRepoInName = task.name && task.name.toLowerCase().includes(repoName);
                const hasRepoInNotes = task.notes && task.notes.toLowerCase().includes(repoName);
                const hasPrInName = task.name && task.name.includes(prNumber);
                const hasPrInNotes = task.notes && task.notes.includes(prNumber);
                return (hasRepoInName || hasRepoInNotes) && (hasPrInName || hasPrInNotes);
            });
            if (prNumberMatch) {
                return prNumberMatch.gid;
            }

            const prOnlyMatch = data.data.find(task =>
                (task.notes && task.notes.includes(prNumber)) ||
                (task.name && task.name.includes(prNumber))
            );
            if (prOnlyMatch) {
                return prOnlyMatch.gid;
            }

            offset = data.next_page && data.next_page.offset ? data.next_page.offset : undefined;
        } while (offset);
        return null;

    } catch (error) {
        warning(`Failed to search for task with PR URL ${prUrl}: ${(error as Error).message}`);
        info('Attempting fallback search due to error...');
        return await getTaskFromRecentTasks(prUrl, token, projectId);
    }
};

async function getTaskFromRecentTasks(prUrl: string, token: string, projectId: string): Promise<string | null> {
    try {
        info('Using fallback search method - fetching recent tasks only');

        const response = await fetch(`https://app.asana.com/api/1.0/tasks?project=${projectId}&opt_fields=gid,name,notes&limit=50&sort_by=modified_at&sort_ascending=false`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            warning(`Fallback search failed: ${response.statusText}`);
            return null;
        }

        const data = await response.json() as AsanaTaskSearchResponse;
        const task = data.data.find(task =>
            task.notes && task.notes.includes(prUrl)
        );

        if (task) {
            info(`Found task via fallback: ${task.name} (${task.gid})`);
            return task.gid;
        }

        return null;
    } catch (error) {
        warning(`Fallback search failed: ${(error as Error).message}`);
        return null;
    }
}

export const assignAsanaTask = async (taskId: string, assigneeGid: string, token: string): Promise<boolean> => {
    try {
        info(`Assigning task ${taskId} to user ${assigneeGid}`);

        const response = await fetch(`https://app.asana.com/api/1.0/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: {
                    assignee: assigneeGid
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            warning(`Failed to assign task: ${JSON.stringify(errorData)}`);
            return false;
        }

        const taskResponse = await response.json() as AsanaTaskResponse;
        info(`✅ Task assigned successfully: ${taskResponse.data.name}`);
        return true;

    } catch (error) {
        warning(`Failed to assign task ${taskId}: ${(error as Error).message}`);
        return false;
    }
};

export const getWorkspaceGid = async (token: string): Promise<string> => {
    const getCurrentWorkspace = await fetch('https://app.asana.com/api/1.0/users/me', {
        headers: {Authorization: `Bearer ${token}`}
    });

    if (!getCurrentWorkspace.ok) {
        throw new Error(`Failed to fetch user info: ${getCurrentWorkspace.statusText}`);
    }
    const meData = await getCurrentWorkspace.json() as AsanaWorkspaceResponse;
    return meData.data.workspaces[0].gid;
}

export const findAsanaUserByEmail = async (email: string, token: string, workspaceId: string): Promise<AsanaUser | null> => {
    try {
        info(`Searching for Asana user with email: ${email}`);

        const response = await fetch(`https://app.asana.com/api/1.0/users?workspace=${workspaceId}&opt_fields=name,email`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        const data = await response.json() as AsanaUserResponse;
        if (data.errors) {
            warning(`Asana API error: ${JSON.stringify(data.errors)}`);
            return null;
        }

        const user = data.data.find(user => user.email === email);
        if (user) {
            info(`Found user: ${user.name} (${user.email})`);
            return user;
        } else {
            info(`No user found with email: ${email}`);
            return null;
        }

    } catch (error) {
        warning(`Failed to search for user with email ${email}: ${(error as Error).message}`);
        return null;
    }
}

export async function getReviewerEmail(
    octokit: Octokit,
    reviewerLogin: string,
    repository: string
): Promise<ReviewerEmailResult> {
    // Skip if reviewer is copilot or empty
    if (!reviewerLogin || reviewerLogin.toLowerCase().includes('copilot')) {
        console.log('Skipping assignment: reviewer is copilot or empty');
        return {
            reviewerLogin,
            reviewerEmail: '',
            skipAssignment: true
        };
    }

    let reviewerEmail = '';
    const [owner, repo] = repository.split('/');

    try {
        // Try Users API for public email
        console.log('Attempting to get email via Users API...');
        const userResponse = await octokit.rest.users.getByUsername({
            username: reviewerLogin
        });
        reviewerEmail = userResponse.data.email || '';

        // Try user's public events for commit emails
        if (!reviewerEmail) {
            console.log('Public email not available, checking user\'s public events...');
            const eventsResponse = await octokit.rest.activity.listPublicEventsForUser({
                username: reviewerLogin,
                per_page: 30
            });

            for (const event of eventsResponse.data) {
                if (event.type === 'PushEvent' && event.payload) {
                    // Type assertion for PushEvent payload
                    const pushPayload = event.payload as {
                        commits?: Array<{
                            author?: {
                                email?: string;
                                name?: string;
                            };
                        }>;
                    };

                    if (pushPayload.commits) {
                        for (const commit of pushPayload.commits) {
                            if (commit.author?.email && commit.author.name) {
                                reviewerEmail = commit.author.email;
                                break;
                            }
                        }
                        if (reviewerEmail) break;
                    }
                }
            }
        }

        // Search commits in current repository
        if (!reviewerEmail) {
            console.log('Searching commits in current repository...');
            const commitsResponse = await octokit.rest.repos.listCommits({
                owner,
                repo,
                author: reviewerLogin,
                per_page: 50
            });

            if (commitsResponse.data.length > 0) {
                reviewerEmail = commitsResponse.data[0].commit.author?.email || '';
            }
        }

        // Search across all commits with broader search
        if (!reviewerEmail) {
            console.log('Searching all commits with broader search...');
            const allCommitsResponse = await octokit.rest.repos.listCommits({
                owner,
                repo,
                per_page: 100
            });

            for (const commit of allCommitsResponse.data) {
                if (commit.author?.login === reviewerLogin) {
                    reviewerEmail = commit.commit.author?.email || '';
                    break;
                }
            }
        }

        // Check if user is a collaborator
        if (!reviewerEmail) {
            console.log('Checking if user is a collaborator...');
            try {
                await octokit.rest.repos.getCollaboratorPermissionLevel({
                    owner,
                    repo,
                    username: reviewerLogin
                });
                console.log('User is a confirmed collaborator but email is private');
            } catch (error) {
                console.log('User is not a collaborator or error occurred');
            }
        }

        if (!reviewerEmail) {
            console.log('Could not retrieve email address. User likely has private email settings.');
        }

        console.log(`Final result - Reviewer: ${reviewerLogin}, Email: ${reviewerEmail}`);

        return {
            reviewerLogin,
            reviewerEmail,
            skipAssignment: false
        };

    } catch (error) {
        console.error('Error retrieving reviewer email:', error);
        return {
            reviewerLogin,
            reviewerEmail: '',
            skipAssignment: true
        };
    }
}
