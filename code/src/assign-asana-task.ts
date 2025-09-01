import * as core from '@actions/core';
import {assignAsanaTask, findAsanaUserByEmail, getTaskFromProject, getWorkspaceGid} from "./assign-asana-task-library";
// CodeReviewTaimurSDone: this file isnt following the TS formatting standards
export const assignAsanaTaskAction = async () => {
    try {
        const asanaAuthToken = core.getInput('token');
        const prUrl = core.getInput('pr-url');
        const asanaProjectId = core.getInput('project-id');
        const assigneeEmail = core.getInput('assignee-email');
        let taskId: string | null = core.getInput('task-id');

        core.info(`PR URL: ${prUrl}`);
        core.info(`Project ID: ${asanaProjectId}`);
        core.info(`Assignee Email: ${assigneeEmail}`);
        core.info(`Task ID: ${taskId}`);

        if (!assigneeEmail) {
            core.info('No assignee email provided, skipping task assignment');
            return;
        }

        if (!taskId && !prUrl) {
            core.info('Neither Task ID nor PR Url provided, skipping task assignment');
        }

        if (!taskId) {
            taskId = await getTaskFromProject(prUrl, asanaAuthToken, asanaProjectId);
            if (!taskId) {
                core.warning(`Could not find Asana task for PR: ${prUrl}`);
                return;
            } else {
                core.info(`Task ID retrieved from asana tasks' descriptions! ${taskId}`);
            }
        }

        const workspaceGid = await getWorkspaceGid(asanaAuthToken);
        const assignee = await findAsanaUserByEmail(assigneeEmail, asanaAuthToken, workspaceGid);
        if (!assignee) {
            core.warning(`Could not find Asana user with email: ${assigneeEmail}`);
            return;
        }

        const success = await assignAsanaTask(taskId, assignee.gid, asanaAuthToken);
        if (success) {
            core.info(`✅ Successfully assigned task to ${assignee.name}`);
            core.setOutput("assigned", "true");
            core.setOutput("assignee", assignee.name);
        } else {
            core.setFailed(`❌ Failed to assign task to ${assignee.name}`);
        }
    } catch (error) {
        const message = (error as Error)?.message || String(error);
        core.setFailed(`❌ Failed to assign Asana task: ${message}`);
    }
};