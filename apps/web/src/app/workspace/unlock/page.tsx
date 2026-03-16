'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { KeyRound, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import api from '@/lib/api';

// Inner component uses useSearchParams — must be wrapped in Suspense at the export level
function UnlockForm() {
    const searchParams = useSearchParams();
    const [licenseKey, setLicenseKey] = useState(searchParams.get('key') || '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleRedeem = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        if (!licenseKey.trim()) {
            setError('Please enter a license key.');
            return;
        }

        try {
            setIsLoading(true);
            const res = await api.post('/licenses/redeem', { key: licenseKey.trim() });
            if (res.data?.success) {
                setSuccess(true);
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 2000);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to redeem license key. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex h-screen items-center justify-center bg-gray-950 p-4">
            <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-red-400"></div>
                
                <div className="flex flex-col items-center mb-8 text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                        <KeyRound size={28} className="text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Workspace Locked</h1>
                    <p className="text-gray-400 text-sm">
                        Your workspace requires an active license key to proceed. Please enter a valid key below to unlock all features.
                    </p>
                </div>

                {success ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
                        <CheckCircle2 size={48} className="text-emerald-500 mb-4" />
                        <h2 className="text-lg font-semibold text-white mb-2">License Activated</h2>
                        <p className="text-emerald-400 text-sm">
                            Your workspace has been successfully unlocked. Redirecting you to the dashboard...
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleRedeem} className="space-y-4">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg flex items-start gap-3">
                                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                <div>{error}</div>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5" htmlFor="licenseKey">
                                License Key
                            </label>
                            <input
                                id="licenseKey"
                                type="text"
                                placeholder="WZOR-PRO-XXXX-XXXX-XXXX"
                                className="w-full bg-gray-950 border border-gray-800 text-white rounded-lg p-3 outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all font-mono tracking-wider text-center"
                                value={licenseKey}
                                onChange={(e) => setLicenseKey(e.target.value)}
                                disabled={isLoading}
                                autoFocus
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading || !licenseKey.trim()}
                            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                        >
                            {isLoading ? 'Verifying...' : 'Unlock Workspace'}
                            {!isLoading && <ArrowRight size={18} />}
                        </button>
                    </form>
                )}

                {!success && (
                    <div className="mt-6 text-center">
                        <p className="text-xs text-gray-500">
                            Don&apos;t have a license key? Contact your distributor to purchase one.
                        </p>
                        <button 
                            onClick={() => {
                                localStorage.removeItem('accessToken');
                                window.location.href = '/login';
                            }}
                            className="text-xs text-red-400 hover:text-red-300 mt-4 transition-colors"
                        >
                            Sign out of this session
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function UnlockWorkspacePage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen items-center justify-center bg-gray-950">
                <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <UnlockForm />
        </Suspense>
    );
}


