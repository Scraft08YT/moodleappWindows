import { type HttpInterceptorFn } from '@angular/common/http';

import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * HTTP interceptor that attaches the Moodle token as a POST body parameter
 * for requests targeting the connected Moodle site.
 *
 * Avoids placing tokens in URLs where they could leak via Referrer headers,
 * server access logs, or browser history.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const auth = inject(AuthService);
    const session = auth.session();

    if (!session) {
        return next(req);
    }

    // Only add auth for requests to the connected Moodle site
    if (req.url.startsWith(session.siteUrl)) {
        const authedReq = req.clone({
            setHeaders: {
                Authorization: `token ${session.token}`,
            },
        });
        return next(authedReq);
    }

    return next(req);
};
