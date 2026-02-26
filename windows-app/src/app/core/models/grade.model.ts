/** Grade table row from gradereport_user_get_grades_table. */
export type GradeItem = {
    id: number;
    itemname: string;
    /** Category name, or empty for top-level items. */
    category: string;
    /** Formatted grade string, e.g. "85.00" or "A+". */
    gradeformatted: string;
    /** Raw numeric grade, or null when not graded. */
    graderaw: number | null;
    /** Maximum possible grade. */
    grademax: number;
    /** Minimum possible grade. */
    grademin: number;
    /** Percentage as formatted string. */
    percentageformatted: string;
    /** Feedback HTML. */
    feedback: string;
    /** Weight in category. */
    weight: number | null;
    /** Grade letter if applicable. */
    lettergrade: string;
    /** 'category' | 'item' | 'course' */
    itemtype: string;
    /** Depth for indentation. */
    depth: number;
};

/** Course grade overview from gradereport_overview_get_course_grades. */
export type CourseGrade = {
    courseid: number;
    grade: string;
    rawgrade: number | null;
    courseFullname: string;
    courseShortname: string;
};
