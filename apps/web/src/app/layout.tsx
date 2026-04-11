import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const outfit = Outfit({ 
    subsets: ['latin'], 
    display: 'swap',
    variable: '--font-outfit' 
});

export const metadata: Metadata = {
    title: 'Whatsvue — AI WhatsApp CRM',
    description: 'AI-native WhatsApp CRM and automation platform for small and medium businesses.',
    icons: {
        icon: '/logo.png',
        apple: '/logo.png',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning className={outfit.variable}>
            <body suppressHydrationWarning className="antialiased font-sans">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
