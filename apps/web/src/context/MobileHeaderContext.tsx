'use client';

import { createContext, useContext, useState } from 'react';

interface MobileHeaderContextValue {
    title: string;
    subtitle?: string;
    setHeader: (title: string, subtitle?: string) => void;
}

const MobileHeaderContext = createContext<MobileHeaderContextValue>({
    title: 'WhatsVue',
    subtitle: undefined,
    setHeader: () => {},
});

export function MobileHeaderProvider({ children }: { children: React.ReactNode }) {
    const [title, setTitle] = useState('WhatsVue');
    const [subtitle, setSubtitle] = useState<string | undefined>(undefined);

    const setHeader = (t: string, s?: string) => {
        setTitle(t);
        setSubtitle(s);
    };

    return (
        <MobileHeaderContext.Provider value={{ title, subtitle, setHeader }}>
            {children}
        </MobileHeaderContext.Provider>
    );
}

export function useMobileHeader() {
    return useContext(MobileHeaderContext);
}
