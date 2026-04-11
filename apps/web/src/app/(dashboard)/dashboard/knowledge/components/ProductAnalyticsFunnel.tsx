'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, TrendingUp, Sparkles } from 'lucide-react';
import api from '@/lib/api';

export function ProductAnalyticsFunnel() {
    const { data: q, isLoading } = useQuery({
        queryKey: ['product-intelligence-analytics'],
        queryFn: () => api.get('/knowledge/analytics/products').then(r => r.data)
    });

    const metrics = q?.data || [];

    // Aggregate globally across all products
    const totalInterested = metrics.reduce((acc: number, item: any) => acc + (item.interestCounts?.INTERESTED || 0), 0);
    const totalCart = metrics.reduce((acc: number, item: any) => acc + (item.interestCounts?.CART || 0), 0);
    const totalOwned = metrics.reduce((acc: number, item: any) => acc + (item.interestCounts?.OWNED || 0), 0);

    const funnelData = [
        { stage: 'Mined Intent', count: totalInterested },
        { stage: 'Conversion (Cart)', count: totalCart },
        { stage: 'Purchased (Owned)', count: totalOwned }
    ];

    if (isLoading) {
        return (
            <div className="card w-full h-[300px] flex items-center justify-center border-l-4 border-l-accent">
                <Loader2 className="animate-spin text-accent" />
            </div>
        );
    }

    return (
        <div className="card w-full border-l-4 border-l-emerald-500 bg-surface rounded-xl overflow-hidden shadow-lg relative">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <TrendingUp size={120} />
            </div>
            
            <div className="p-5 flex items-center justify-between border-b border-theme relative z-10">
                <div>
                    <h2 className="font-bold text-lg text-primary flex items-center gap-2">
                        <Sparkles size={18} className="text-emerald-400" />
                        AI Product Intelligence Funnel
                    </h2>
                    <p className="text-xs text-muted mt-1">Aggregated intent stages identified by AI & Manual inputs.</p>
                </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-[1fr_300px] gap-8 items-center relative z-10">
                <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={funnelData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                            <XAxis dataKey="stage" stroke="#8696a0" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#8696a0" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#202c33', borderColor: '#334155', borderRadius: '8px' }}
                                itemStyle={{ color: '#10b981' }}
                                labelStyle={{ color: '#d1d7db', fontWeight: 'bold', marginBottom: '4px' }}
                            />
                            <Area type="monotone" dataKey="count" stroke="#10b981" fillOpacity={1} fill="url(#colorCount)" strokeWidth={3} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="flex flex-col gap-4">
                    <div className="p-4 bg-body rounded-lg border border-theme">
                        <p className="text-xs font-semibold text-muted uppercase">Global Interest</p>
                        <p className="text-3xl font-bold text-primary mt-1">{totalInterested}</p>
                        <p className="text-[10px] text-emerald-400 mt-1">Leads mapped</p>
                    </div>
                    <div className="p-4 bg-body rounded-lg border border-theme">
                        <p className="text-xs font-semibold text-muted uppercase">In Cart / Quoted</p>
                        <p className="text-3xl font-bold text-primary mt-1">{totalCart}</p>
                        <p className="text-[10px] text-emerald-400 mt-1">Approaching closure</p>
                    </div>
                    <div className="p-4 bg-body rounded-lg border border-theme">
                        <p className="text-xs font-semibold text-muted uppercase">Closed Won</p>
                        <p className="text-3xl font-bold text-primary mt-1">{totalOwned}</p>
                        <p className="text-[10px] text-emerald-400 mt-1">Customers secured</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
