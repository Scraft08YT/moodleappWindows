/** Moodle user profile returned by core_webservice_get_site_info. */
export type SiteInfo = {
    sitename: string;
    username: string;
    firstname: string;
    lastname: string;
    fullname: string;
    lang: string;
    userid: number;
    siteurl: string;
    userpictureurl: string;
    /** User email address. */
    email: string;
    /** Moodle release string, e.g. "4.3 (Build: 20231113)". */
    release: string;
    version: string;
    functions: SiteFunction[];
};

export type SiteFunction = {
    name: string;
    version: string;
};

/** Token pair returned after successful authentication. */
export type AuthToken = {
    token: string;
    privateToken: string;
};

/** Stored session that combines site URL, token, and user info. */
export type Session = {
    siteUrl: string;
    token: string;
    privateToken: string;
    siteInfo: SiteInfo;
};

/** A stored account entry for the account switcher. */
export type StoredAccount = {
    /** Unique key: `userid@siteurl` */
    id: string;
    siteUrl: string;
    token: string;
    privateToken: string;
    fullname: string;
    username: string;
    userpictureurl: string;
    sitename: string;
    userid: number;
};
