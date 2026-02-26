import { Injectable } from '@angular/core';

import { MoodleApiService } from './moodle-api.service';

/** Assignment overview. */
export type Assignment = {
    id: number;
    cmid: number;
    course: number;
    name: string;
    intro: string;
    introformat: number;
    duedate: number;
    cutoffdate: number;
    allowsubmissionsfromdate: number;
    grade: number;
    nosubmissions: boolean;
    submissiondrafts: boolean;
    requiresubmissionstatement: boolean;
    configs: AssignConfig[];
};

export type AssignConfig = { plugin: string; subtype: string; name: string; value: string };

/** Submission status from mod_assign_get_submission_status. */
export type SubmissionStatus = {
    lastattempt?: {
        submission?: Submission;
        teamsubmission?: Submission;
        submissiongroupmemberswhoneedtosubmit?: number[];
        graded: boolean;
        gradingstatus: string;
    };
    feedback?: {
        grade?: {
            grade: string;
            gradefordisplay: string;
            gradeddate: number;
        };
        plugins: SubmissionPlugin[];
    };
    previousattempts?: unknown[];
};

export type Submission = {
    id: number;
    userid: number;
    status: string;
    timecreated: number;
    timemodified: number;
    plugins: SubmissionPlugin[];
};

export type SubmissionPlugin = {
    type: string;
    name: string;
    editorfields?: { name: string; description: string; text: string; format: number }[];
    fileareas?: { area: string; files: SubmissionFile[] }[];
};

export type SubmissionFile = {
    filename: string;
    filepath: string;
    fileurl: string;
    filesize: number;
    mimetype: string;
    timemodified: number;
};

/**
 * Service for Moodle assignment interactions.
 */
@Injectable({ providedIn: 'root' })
export class AssignmentService {

    constructor(private readonly api: MoodleApiService) {}

    /** Fetches assignments for given course IDs. */
    async getAssignments(courseIds: number[]): Promise<Assignment[]> {
        const res = await this.api.call<{ courses: { assignments: Assignment[] }[] }>(
            'mod_assign_get_assignments',
            { courseids: courseIds },
        );
        return res.courses?.flatMap((c) => c.assignments) ?? [];
    }

    /** Single assignment by cmid (course-module ID). */
    async getAssignmentByCmid(cmid: number, courseId: number): Promise<Assignment | undefined> {
        const all = await this.getAssignments([courseId]);
        return all.find((a) => a.cmid === cmid);
    }

    /** Fetches the submission status for an assignment. */
    async getSubmissionStatus(assignId: number): Promise<SubmissionStatus> {
        return this.api.call<SubmissionStatus>(
            'mod_assign_get_submission_status',
            { assignid: assignId },
        );
    }

    /** Saves an online text submission. */
    async saveOnlineText(assignmentId: number, text: string, format = 1): Promise<void> {
        await this.api.call(
            'mod_assign_save_submission',
            {
                assignmentid: assignmentId,
                plugindata: {
                    onlinetext: { text, format, itemid: 0 },
                },
            },
        );
    }

    /** Saves a file submission with the given draft area item ID. */
    async saveFileSubmission(assignmentId: number, draftItemId: number): Promise<void> {
        await this.api.call(
            'mod_assign_save_submission',
            {
                assignmentid: assignmentId,
                plugindata: {
                    files_filemanager: draftItemId,
                },
            },
        );
    }

    /** Saves both online text and file submission. */
    async saveFullSubmission(
        assignmentId: number,
        text: string,
        draftItemId: number,
        format = 1,
    ): Promise<void> {
        const plugindata: Record<string, unknown> = {};

        if (text) {
            plugindata['onlinetext'] = { text, format, itemid: 0 };
        }
        if (draftItemId) {
            plugindata['files_filemanager'] = draftItemId;
        }

        if (Object.keys(plugindata).length > 0) {
            await this.api.call(
                'mod_assign_save_submission',
                { assignmentid: assignmentId, plugindata },
            );
        }
    }

    /** Submits the assignment for grading. */
    async submitForGrading(assignmentId: number): Promise<void> {
        await this.api.call(
            'mod_assign_submit_for_grading',
            { assignmentid: assignmentId, acceptsubmissionstatement: true },
        );
    }

    /** Checks whether a specific submission plugin type is enabled. */
    isPluginEnabled(assignment: Assignment, pluginType: string): boolean {
        return assignment.configs.some(
            (c) => c.subtype === 'assignsubmission' && c.plugin === pluginType && c.name === 'enabled' && c.value === '1',
        );
    }

    /** Returns the max file size for file submissions (0 = unlimited). */
    getMaxFileSize(assignment: Assignment): number {
        const config = assignment.configs.find(
            (c) => c.subtype === 'assignsubmission' && c.plugin === 'file' && c.name === 'maxsubmissionsizebytes',
        );
        return config ? Number(config.value) : 0;
    }

    /** Returns the max number of uploaded files. */
    getMaxFiles(assignment: Assignment): number {
        const config = assignment.configs.find(
            (c) => c.subtype === 'assignsubmission' && c.plugin === 'file' && c.name === 'maxfilesubmissions',
        );
        return config ? Number(config.value) : 1;
    }
}
