/** Moodle user profile from core_user_get_users_by_field. */
export type UserProfile = {
    id: number;
    username: string;
    fullname: string;
    firstname: string;
    lastname: string;
    email: string;
    profileimageurl: string;
    profileimageurlsmall: string;
    city: string;
    country: string;
    description: string;
    descriptionformat: number;
    firstaccess: number;
    lastaccess: number;
    department: string;
    institution: string;
    interests: string;
    url: string;
    customfields: UserCustomField[];
    roles: UserRole[];
    enrolledcourses: UserEnrolledCourse[];
};

export type UserCustomField = {
    type: string;
    value: string;
    name: string;
    shortname: string;
};

export type UserRole = {
    roleid: number;
    name: string;
    shortname: string;
};

export type UserEnrolledCourse = {
    id: number;
    fullname: string;
    shortname: string;
};
