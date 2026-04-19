'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Loader2, Save, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function AdminSettingsPage() {
    const qc = useQueryClient();
    const [configs, setConfigs] = useState({
        UPI_VPA: '',
        UPI_MERCHANT_NAME: ''
    });

    const { data: serverConfigs, isLoading } = useQuery({
        queryKey: ['admin-config'],
        queryFn: () => api.get('/admin/config').then(r => r.data)
    });

    useEffect(() => {
        if (serverConfigs) {
            setConfigs({
                UPI_VPA: serverConfigs['UPI_VPA'] || '',
                UPI_MERCHANT_NAME: serverConfigs['UPI_MERCHANT_NAME'] || ''
            });
        }
    }, [serverConfigs]);

    const saveMutation = useMutation({
        mutationFn: (updates: typeof configs) => api.put('/admin/config', updates),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['admin-config'] });
            // Alert or toast could go here
            alert("Settings saved successfully.");
        }
    });

    const handleSave = () => {
        saveMutation.mutate(configs);
    };

    if (isLoading) {
        return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>;
    }

    return (
        <div className="p-8 max-w-4xl mx-auto w-full">
            <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <Settings className="text-gray-400" /> Global System Settings
            </h1>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
                <h2 className="text-lg font-medium text-gray-200 mb-4 border-b border-gray-800 pb-2">UPI Billing Configuration</h2>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Merchant VPA (UPI ID)
                        </label>
                        <input
                            type="text"
                            value={configs.UPI_VPA}
                            onChange={(e) => setConfigs(prev => ({ ...prev, UPI_VPA: e.target.value }))}
                            placeholder="e.g. yourbusiness@upi"
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <p className="text-xs text-gray-500 mt-1">The main UPI ID that will receive SaaS subscription payments.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Merchant Display Name
                        </label>
                        <input
                            type="text"
                            value={configs.UPI_MERCHANT_NAME}
                            onChange={(e) => setConfigs(prev => ({ ...prev, UPI_MERCHANT_NAME: e.target.value }))}
                            placeholder="e.g. My SaaS Company Ltd"
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <p className="text-xs text-gray-500 mt-1">The business name authenticated with NPCI associated with the above VPA.</p>
                    </div>
                </div>

                <div className="mt-8 pt-4 border-t border-gray-800 flex justify-end">
                    <Button 
                        onClick={handleSave} 
                        disabled={saveMutation.isPending}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2"
                    >
                        {saveMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                        Save Configuration
                    </Button>
                </div>
            </div>
        </div>
    );
}
