import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
    title: 'Whatsvue — AI WhatsApp CRM',
    description: 'AI-native WhatsApp CRM and automation platform for small and medium businesses.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            {/* suppressHydrationWarning on body prevents false-positive hydration errors
                caused by zustand-persist rehydrating from localStorage on mount */}
            <body suppressHydrationWarning>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
