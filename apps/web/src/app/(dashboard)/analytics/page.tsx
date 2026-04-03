'use client';

import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Users, Megaphone, Zap, TrendingUp, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ElementType;
    trend?: string;
    colorClass: string; // e.g. 'bg-accent/20 text-accent'
}

function StatCard({ title, value, icon: Icon, trend, colorClass }: StatCardProps) {
    return (
        <div className="glass-card glass-card-interactive flex flex-col gap-4">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
                    <p className="text-3xl font-bold mt-1 text-white">{value}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-black/40 border border-white/5 shadow-inner ${colorClass}`}>
                    <Icon size={20} />
                </div>
            </div>
            {trend && (
                <p className="text-xs flex items-center gap-1 text-emerald-400">
                    <TrendingUp size={12} />
                    {trend}
                </p>
            )}
        </div>
    );
}

export default function DashboardPage() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const { data: stats } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: () => api.get('/dashboard/stats').then(r => r.data),
        retry: false,
    });

    const { data: chartData } = useQuery({
        queryKey: ['dashboard-chart'],
        queryFn: () => api.get('/dashboard/chart').then(r => r.data),
        retry: false,
    });

    const { data: activityData, isLoading: activityLoading } = useQuery({
        queryKey: ['dashboard-activity'],
        queryFn: () => api.get('/dashboard/activity').then(r => r.data),
        retry: false,
    });

    const cards = [
        { title: 'Total Contacts', value: stats?.totalContacts ?? '—', icon: Users, colorClass: 'text-zinc-300', trend: '+12 this week' },
        { title: 'Active Conversations', value: stats?.activeConversations ?? '—', icon: MessageSquare, colorClass: 'text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]', trend: '3 unread' },
        { title: 'Campaigns Sent', value: stats?.campaignsSent ?? '—', icon: Megaphone, colorClass: 'text-yellow-400' },
        { title: 'Active Automations', value: stats?.activeAutomations ?? '—', icon: Zap, colorClass: 'text-purple-400' },
    ];

    return (
        <div>
            <Header title="Dashboard" subtitle="Your Whatsvue workspace at a glance" />
            <div className="p-6 flex flex-col gap-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {cards.map(c => <StatCard key={c.title} {...c} />)}
                </div>

                {/* Activity Chart */}
                <div className="glass-card">
                    <div className="flex items-center gap-2 mb-6">
                        <Activity className="text-emerald-500" size={18} />
                        <h2 className="font-semibold text-sm text-zinc-300">Platform Activity (Last 7 Days)</h2>
                    </div>
                    <div className="h-[280px] w-full">
                        {mounted && chartData ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorContacts" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#a1a1aa" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#a1a1aa" stopOpacity={0} />
                                        </linearGradient>
                                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                            <feGaussianBlur stdDeviation="4" result="blur" />
                                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                        </filter>
                                    </defs>
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', borderColor: 'rgba(16,185,129,0.3)', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
                                        itemStyle={{ fontSize: '14px', color: '#fff' }}
                                    />
                                    <Area type="monotone" dataKey="messages" name="Messages" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorMessages)" filter="url(#glow)" />
                                    <Area type="monotone" dataKey="contacts" name="New Contacts" stroke="#a1a1aa" strokeWidth={2} fillOpacity={1} fill="url(#colorContacts)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">Loading chart data...</div>
                        )}
                    </div>
                </div>

                {/* Activity Feed & Quick Actions */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="glass-card xl:col-span-2">
                        <h2 className="font-semibold text-sm mb-4 text-zinc-300">Recent Activity</h2>
                        <div className="flex flex-col gap-3">
                            {activityLoading ? (
                                <div className="text-sm text-zinc-500">Loading activity...</div>
                            ) : activityData?.length ? (
                                activityData.map((item: any, i: number) => (
                                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-black/20 border border-white/5 animate-in fade-in duration-500 delay-100 hover:bg-black/40 transition-colors">
                                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 shadow-[0_0_8px_currentColor] ${item.dot.replace('bg-accent', 'bg-emerald-500').replace('bg-success', 'bg-emerald-400')}`} />
                                        <div className="flex-1">
                                            <p className="text-sm text-white">{item.msg}</p>
                                            <p className="text-xs mt-0.5 text-zinc-500">{item.time}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-sm text-zinc-500">No recent activity.</div>
                            )}
                        </div>
                    </div>

                    <div className="glass-card">
                        <h2 className="font-semibold text-sm mb-4 text-zinc-300">Quick Actions</h2>
                        <div className="flex flex-col gap-2">
                            {[
                                { label: 'New Campaign', href: '/campaigns/new', cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]' },
                                { label: 'Add Contact', href: '/contacts', cls: 'bg-zinc-800/40 text-zinc-300 border border-white/5 hover:bg-zinc-800/80 hover:text-white' },
                                { label: 'Create Automation', href: '/automations', cls: 'bg-zinc-800/40 text-zinc-300 border border-white/5 hover:bg-zinc-800/80 hover:text-white' },
                            ].map(a => (
                                <a key={a.label} href={a.href}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${a.cls}`}
                                >
                                    <span className="text-sm font-medium">{a.label}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
