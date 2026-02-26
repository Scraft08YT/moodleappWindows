/** Moodle course returned by core_enrol_get_users_courses. */
export type Course = {
    id: number;
    shortname: string;
    fullname: string;
    displayname: string;
    summary: string;
    summaryformat: number;
    category: number;
    progress: number | null;
    completed: boolean;
    startdate: number;
    enddate: number;
    visible: boolean;
    courseImage: string;
    /** Whether the user marked this course as favourite. */
    isfavourite: boolean;
    /** Enrolment status: 0 = active, 1 = suspended. */
    enrolledusercount: number;
    overviewfiles: CourseFile[];
};

export type CourseFile = {
    filename: string;
    filepath: string;
    filesize: number;
    fileurl: string;
    mimetype: string;
};

/** Course section returned by core_course_get_contents. */
export type CourseSection = {
    id: number;
    name: string;
    summary: string;
    visible: boolean;
    modules: CourseModule[];
};

/** A single course module (activity / resource). */
export type CourseModule = {
    id: number;
    name: string;
    instance: number;
    modname: string;
    modicon: string;
    description: string;
    url: string;
    visible: boolean;
    contents: ModuleContent[];
};

export type ModuleContent = {
    type: string;
    filename: string;
    filepath: string;
    filesize: number;
    fileurl: string;
    timecreated: number;
    timemodified: number;
    mimetype: string;
};
