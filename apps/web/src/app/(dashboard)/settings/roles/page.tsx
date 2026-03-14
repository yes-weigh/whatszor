'use client';

import { Shield, ShieldAlert, Users, Eye, CheckCircle2, XCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const rolesConfig = [
    {
        name: 'Owner',
        icon: ShieldAlert,
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
        description: 'Highest level of access. Complete control over the workspace, billing, and all features.',
        capabilities: [
            { name: 'Delete Workspace & Manage Billing', allowed: true },
            { name: 'Transfer Ownership', allowed: true },
            { name: 'Create & Delete Audiences Globally', allowed: true },
            { name: 'Manage Webhooks & Integrations', allowed: true },
        ]
    },
    {
        name: 'Admin',
        icon: Shield,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        description: 'Management level. Can configure integrations, manage team members, and build workflows.',
        capabilities: [
            { name: 'Connect WhatsApp Sessions', allowed: true },
            { name: 'Manage Team Members (Roles)', allowed: true },
            { name: 'Create Global Automations', allowed: true },
            { name: 'Delete Workspace & Manage Billing', allowed: false },
        ]
    },
    {
        name: 'Member',
        icon: Users,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        description: 'Core daily operations. Handles CRM, replies to Inbox, and launches Campaigns.',
        capabilities: [
            { name: 'Chat & Reply in Inbox', allowed: true },
            { name: 'Create/Edit CRM Contacts', allowed: true },
            { name: 'Launch Campaigns (Approved Templates)', allowed: true },
            { name: 'Connect WhatsApp Sessions', allowed: false },
        ]
    },
    {
        name: 'Viewer',
        icon: Eye,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        description: 'Read-only observation. Can view metrics and CRM data but cannot modify or send messages.',
        capabilities: [
            { name: 'View Dashboards & Metrics', allowed: true },
            { name: 'View CRM Contacts', allowed: true },
            { name: 'Send Messages / Launch Campaigns', allowed: false },
            { name: 'Edit Any Settings', allowed: false },
        ]
    }
];

export default function RolesExplainerPage() {
    const user = useAuthStore(s => s.user);
    const isOwner = user?.role === 'OWNER';
    const router = useRouter();

    useEffect(() => {
        // Enforce OWNER only visibility at the component level layout
        if (user && !isOwner) {
            router.replace('/settings/members');
        }
    }, [user, isOwner, router]);

    if (!isOwner) return null;

    return (
        <div className="max-w-4xl space-y-8 animate-in fade-in duration-500">
            <header className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Roles & Privileges Matrix</h1>
                <p className="text-gray-500 text-lg">
                    Understand the capability boundaries assigned to each role within your workspace.
                </p>
            </header>

            <div className="grid gap-6 md:grid-cols-2">
                {rolesConfig.map((role) => {
                    const Icon = role.icon;
                    return (
                        <div key={role.name} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className={`p-3 rounded-xl ${role.bgColor} ${role.color}`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <h2 className="text-xl font-semibold text-gray-900">{role.name}</h2>
                            </div>
                            
                            <p className="text-sm text-gray-600 mb-6 flex-grow">{role.description}</p>
                            
                            <div className="space-y-3 pt-4 border-t border-gray-100">
                                {role.capabilities.map((cap, i) => (
                                    <div key={i} className="flex items-start space-x-3">
                                        {cap.allowed ? (
                                            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                        ) : (
                                            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                        )}
                                        <span className={`text-sm ${cap.allowed ? 'text-gray-700 font-medium' : 'text-gray-400 line-through decoration-red-200'}`}>
                                            {cap.name}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <div className="mt-8 p-6 bg-blue-50 border border-blue-100 rounded-xl">
                <h3 className="text-blue-900 font-semibold flex items-center mb-2">
                    <Shield className="w-5 h-5 mr-2 text-blue-600" />
                    Security Best Practices
                </h3>
                <p className="text-sm text-blue-800">
                    Always apply the Principle of Least Privilege. Restrict technical users to Admin, and restrict standard operators to Member. Owners should be exclusively reserved for stakeholders making billing and destructive structural decisions.
                </p>
            </div>
        </div>
    );
}
