import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/**
 * Route guard that redirects unauthenticated users to the login page.
 * Attempts session restore before rejecting.
 */
export const authGuard: CanActivateFn = async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (auth.isAuthenticated()) {
        return true;
    }

    // Try restoring a persisted session
    const restored = await auth.restoreSession();
    if (restored) {
        return true;
    }

    return router.createUrlTree(['/login']);
};
