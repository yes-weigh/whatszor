'use client';

import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Users, Megaphone, Zap, TrendingUp, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ElementType;
    trend?: string;
    colorClass: string; // e.g. 'bg-accent/20 text-accent'
}

function StatCard({ title, value, icon: Icon, trend, colorClass }: StatCardProps) {
    return (
        <div className="card flex flex-col gap-4">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
                    <p className="text-3xl font-bold mt-1 text-primary">{value}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass}`}>
                    <Icon size={20} />
                </div>
            </div>
            {trend && (
                <p className="text-xs flex items-center gap-1 text-success">
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
        { title: 'Total Contacts', value: stats?.totalContacts ?? '—', icon: Users, colorClass: 'bg-accent/20 text-accent', trend: '+12 this week' },
        { title: 'Active Conversations', value: stats?.activeConversations ?? '—', icon: MessageSquare, colorClass: 'bg-success/20 text-success', trend: '3 unread' },
        { title: 'Campaigns Sent', value: stats?.campaignsSent ?? '—', icon: Megaphone, colorClass: 'bg-warning/20 text-warning' },
        { title: 'Active Automations', value: stats?.activeAutomations ?? '—', icon: Zap, colorClass: 'bg-[#a78bfa]/20 text-[#a78bfa]' },
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
                <div className="card">
                    <div className="flex items-center gap-2 mb-6">
                        <Activity className="text-secondary" size={18} />
                        <h2 className="font-semibold text-sm text-secondary">Platform Activity (Last 7 Days)</h2>
                    </div>
                    <div className="h-[280px] w-full">
                        {mounted && chartData ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#4f7ef8" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#4f7ef8" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorContacts" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-theme)" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-strong)', borderRadius: '8px' }}
                                        itemStyle={{ fontSize: '14px' }}
                                    />
                                    <Area type="monotone" dataKey="messages" name="Messages" stroke="#4f7ef8" strokeWidth={2} fillOpacity={1} fill="url(#colorMessages)" />
                                    <Area type="monotone" dataKey="contacts" name="New Contacts" stroke="#34d399" strokeWidth={2} fillOpacity={1} fill="url(#colorContacts)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted text-sm">Loading chart data...</div>
                        )}
                    </div>
                </div>

                {/* Activity Feed & Quick Actions */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="card xl:col-span-2">
                        <h2 className="font-semibold text-sm mb-4 text-secondary">Recent Activity</h2>
                        <div className="flex flex-col gap-3">
                            {activityLoading ? (
                                <div className="text-sm text-muted">Loading activity...</div>
                            ) : activityData?.length ? (
                                activityData.map((item: any, i: number) => (
                                    <div key={i} className="flex items-start gap-3 animate-in fade-in duration-500 delay-100">
                                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.dot}`} />
                                        <div className="flex-1">
                                            <p className="text-sm text-primary">{item.msg}</p>
                                            <p className="text-xs mt-0.5 text-muted">{item.time}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-sm text-muted">No recent activity.</div>
                            )}
                        </div>
                    </div>

                    <div className="card">
                        <h2 className="font-semibold text-sm mb-4 text-secondary">Quick Actions</h2>
                        <div className="flex flex-col gap-2">
                            {[
                                { label: 'New Campaign', href: '/campaigns/new', cls: 'bg-accent/10 text-accent hover:bg-accent/20' },
                                { label: 'Add Contact', href: '/contacts', cls: 'bg-success/10 text-success hover:bg-success/20' },
                                { label: 'Create Automation', href: '/automations', cls: 'bg-[#a78bfa]/10 text-[#a78bfa] hover:bg-[#a78bfa]/20' },
                            ].map(a => (
                                <a key={a.label} href={a.href}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${a.cls}`}
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
