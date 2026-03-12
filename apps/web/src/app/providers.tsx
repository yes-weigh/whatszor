'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'react-hot-toast';

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: { queries: { staleTime: 30000, retry: 1 } }
    }));
    return (
        <QueryClientProvider client={queryClient}>
            {children}
            <Toaster position="bottom-right" />
        </QueryClientProvider>
    );
}
