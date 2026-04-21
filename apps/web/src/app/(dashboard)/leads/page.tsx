'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LeadGenerationRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        // Redirect legacy route to the unified Outreach Hub
        router.replace('/audiences?tab=leads');
    }, [router]);

    return null;
}
