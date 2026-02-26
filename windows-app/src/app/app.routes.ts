import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    {
        path: 'login',
        loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent),
    },
    {
        path: '',
        canActivate: [authGuard],
        loadComponent: () => import('./shared/layouts/shell/shell.component').then(m => m.ShellComponent),
        children: [
            {
                path: 'dashboard',
                loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
            },
            {
                path: 'courses',
                loadComponent: () => import('./features/courses/courses.component').then(m => m.CoursesComponent),
            },
            {
                path: 'courses/search',
                loadComponent: () => import('./features/courses/course-search/course-search.component').then(m => m.CourseSearchComponent),
            },
            {
                path: 'courses/:id',
                loadComponent: () => import('./features/courses/course-detail/course-detail.component').then(m => m.CourseDetailComponent),
            },
            {
                path: 'activity/:courseId/:modname/:moduleId',
                loadComponent: () => import('./features/activity/activity-viewer.component').then(m => m.ActivityViewerComponent),
            },
            {
                path: 'grades',
                loadComponent: () => import('./features/grades/grades.component').then(m => m.GradesComponent),
            },
            {
                path: 'profile',
                loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
            },
            {
                path: 'profile/:id',
                loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
            },
            {
                path: 'messages',
                loadComponent: () => import('./features/messages/messages.component').then(m => m.MessagesComponent),
            },
            {
                path: 'calendar',
                loadComponent: () => import('./features/calendar/calendar.component').then(m => m.CalendarComponent),
            },
            {
                path: 'notifications',
                loadComponent: () => import('./features/notifications/notifications.component').then(m => m.NotificationsComponent),
            },
            {
                path: 'files',
                loadComponent: () => import('./features/files/files.component').then(m => m.FilesComponent),
            },
            {
                path: 'settings',
                loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
            },
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
        ],
    },
    { path: '**', redirectTo: 'login' },
];
