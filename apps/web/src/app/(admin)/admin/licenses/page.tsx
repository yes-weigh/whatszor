import { redirect } from 'next/navigation';

/**
 * /admin/licenses → redirect to /admin/dashboard
 * The dashboard is where license keys are generated and managed.
 */
export default function AdminLicensesPage() {
    redirect('/admin/dashboard');
}
