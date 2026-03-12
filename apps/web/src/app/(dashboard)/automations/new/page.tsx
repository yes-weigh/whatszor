import { redirect } from 'next/navigation';

/**
 * /automations/new — thin redirect to the actual flow builder at /automations/create.
 * Keeps the "natural" URL pattern consistent with other modules (/campaigns/new, etc.)
 */
export default function AutomationsNewPage() {
    redirect('/automations/create');
}
