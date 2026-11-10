import { env } from '$env/dynamic/public';

export const learnUrl = () => env.PUBLIC_LEARN_URL || 'https://learn.lovat.app';
export const dashboardUrl = () => env.PUBLIC_DASHBOARD_URL || 'https://dashboard.lovat.app';
export const websiteUrl = () => env.PUBLIC_WEBSITE_URL || 'https://lovat.app';
