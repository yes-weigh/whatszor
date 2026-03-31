'use client';

import { Header } from '@/components/layout/Header';
import api from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { Users, Search, Trash2, AlertCircle, Edit } from 'lucide-react';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

export default function AudiencesPage() {
    const [search, setSearch] = useState('');
    const hasPermission = useAuthStore(s => s.hasPermission);
    const user = useAuthStore(s => s.user);

    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => { setIsMounted(true); }, []);

    const [addModal, setAddModal] = useState(false);
    const [form, setForm] = useState({ name: '', description: '' });

    const [editModal, setEditModal] = useState<any>(null);
    const [editForm, setEditForm] = useState({ name: '', description: '' });

    const [deleteModal, setDeleteModal] = useState<string | null>(null);

    const { data: audiencesData, refetch } = useQuery({
        queryKey: ['audiences', search],
        // Backend returns { items: Audience[], total: number } via sendSuccess({ items, total })
        // After interceptor unwrap, r.data = { items, total }
        queryFn: () => api.get(`/crm/audiences`).then(r => r.data.items),
        enabled: isMounted,
    });

    const handleCreateAudience = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/crm/audiences', form);
            toast.success('Audience created successfully');
            setAddModal(false);
            setForm({ name: '', description: '' });
            refetch();
        } catch (error: any) {
            toast.error(error.response?.data?.error?.message || 'Failed to create audience');
        }
    };

    const handleUpdateAudience = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editModal) return;
        try {
            await api.patch(`/crm/audiences/${editModal.id}`, editForm);
            toast.success('Audience updated successfully');
            setEditModal(null);
            refetch();
        } catch (error: any) {
            toast.error(error.response?.data?.error?.message || 'Failed to update audience');
        }
    };

    const handleDeleteAudience = async () => {
        if (!deleteModal) return;
        try {
            await api.delete(`/crm/audiences/${deleteModal}`);
            toast.success('Audience deleted securely');
            setDeleteModal(null);
            refetch();
        } catch (error: any) {
            toast.error(error.response?.data?.error?.message || 'Failed to delete audience');
        }
    };

    const audiences: any[] = audiencesData ?? [];
    
    // Filter visually locally if backend doesn't support text-search yet
    const filteredAudiences = audiences.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="animate-in fade-in duration-500">
            <Header title="Audiences" subtitle="Manage your segmented contact lists" />
            <div className="p-6">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-theme bg-elevated w-64 shadow-sm">
                        <Search size={14} className="text-muted" />
                        <input className="bg-transparent text-sm outline-none flex-1 text-primary placeholder:text-muted"
                            placeholder="Find audiences..."
                            value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    {isMounted && hasPermission('contacts:manage') && (
                        <button className="btn btn-primary shadow-sm" onClick={() => setAddModal(true)}>+ New Audience</button>
                    )}
                </div>

                {addModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="card w-full max-w-md shadow-xl border border-gray-100">
                            <h2 className="text-xl font-bold text-gray-900 mb-1">Create Audience Segment</h2>
                            <p className="text-sm text-gray-500 mb-6">Group your contacts to target campaigns efficiently.</p>
                            <form onSubmit={handleCreateAudience} className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-medium text-gray-700">Audience Name</label>
                                    <input type="text" className="input bg-gray-50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-500" placeholder="e.g. VIP Customers Q3" required
                                        value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-medium text-gray-700">Description (Optional)</label>
                                    <textarea className="input bg-gray-50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-500 resize-none h-24" placeholder="People who purchased in the last 6 months..."
                                        value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                                </div>
                                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                                    <button type="button" className="btn bg-white border border-gray-200 text-gray-700 hover:bg-gray-50" onClick={() => setAddModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary bg-blue-600 hover:bg-blue-700 text-white">Save Audience</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {editModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="card w-full max-w-md shadow-xl border border-gray-100">
                            <h2 className="text-xl font-bold text-gray-900 mb-1">Edit Audience Segment</h2>
                            <p className="text-sm text-gray-500 mb-6">Modify the details of this audience segment.</p>
                            <form onSubmit={handleUpdateAudience} className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-medium text-gray-700">Audience Name</label>
                                    <input type="text" className="input bg-gray-50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-500" placeholder="e.g. VIP Customers Q3" required
                                        value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-medium text-gray-700">Description (Optional)</label>
                                    <textarea className="input bg-gray-50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-500 resize-none h-24" placeholder="People who purchased in the last 6 months..."
                                        value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                                </div>
                                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                                    <button type="button" className="btn bg-white border border-gray-200 text-gray-700 hover:bg-gray-50" onClick={() => setEditModal(null)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary bg-blue-600 hover:bg-blue-700 text-white">Update Audience</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Destructive Delete Alert Modal */}
                {deleteModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
                         <div className="card w-full max-w-md shadow-xl border border-red-100">
                            <div className="flex items-center gap-3 text-red-600 mb-4">
                                <div className="p-2 bg-red-100 rounded-full">
                                    <AlertCircle size={24} />
                                </div>
                                <h2 className="text-xl font-bold">Delete Audience?</h2>
                            </div>
                            <p className="text-sm text-gray-600 mb-6 font-medium">
                                Are you sure you want to permanently delete this audience? 
                                <br/><br/>
                                <span className="text-gray-500 text-xs">Note: The underlying contacts will NOT be deleted from your CRM. Only this group mapping will be destroyed.</span>
                            </p>
                            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                                <button className="btn bg-white border border-gray-200 text-gray-700 hover:bg-gray-50" onClick={() => setDeleteModal(null)}>Cancel</button>
                                <button className="btn bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteAudience}>Yes, Delete Permanently</button>
                            </div>
                         </div>
                    </div>
                )}

                {/* Grid UI */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAudiences.length === 0 && (
                        <div className="col-span-full card py-16 text-center border-dashed border-2 flex flex-col items-center justify-center bg-gray-50/50">
                            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4 text-blue-600">
                                <Users size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-1">No audiences found</h3>
                            <p className="text-sm text-gray-500 max-w-sm">Create your first audience to group contacts together and blast campaigns seamlessly.</p>
                            {isMounted && hasPermission('contacts:manage') && (
                                <button className="btn btn-primary mt-6 shadow-sm" onClick={() => setAddModal(true)}>+ Create Audience</button>
                            )}
                        </div>
                    )}
                    
                    {filteredAudiences.map((a: any) => (
                        <div key={a.id} className="card p-0 overflow-hidden hover:shadow-md transition-shadow duration-200 border border-gray-200">
                            <div className="p-5">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-semibold text-lg text-gray-900 truncate pr-4" title={a.name}>{a.name}</h3>
                                    <div className="flex space-x-1 shrink-0">
                                      {isMounted && hasPermission('contacts:manage') && (
                                          <button 
                                            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"
                                            onClick={() => {
                                                setEditForm({ name: a.name, description: a.description || '' });
                                                setEditModal(a);
                                            }}
                                            title="Edit"
                                          >
                                              <Edit size={16} />
                                          </button>
                                      )}
                                      {isMounted && user?.role === 'OWNER' && (
                                          <button 
                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                            onClick={() => setDeleteModal(a.id)}
                                            title="Delete"
                                          >
                                              <Trash2 size={16} />
                                          </button>
                                      )}
                                    </div>
                                </div>
                                <p className="text-sm text-gray-500 line-clamp-2 h-10 mb-4">
                                    {a.description || 'No description provided.'}
                                </p>
                                
                                <div className="flex items-center space-x-2 text-sm text-gray-700 font-medium bg-gray-50 w-fit px-3 py-1.5 rounded-lg border border-gray-100">
                                    <Users size={16} className="text-blue-500" />
                                    <span>{a.contactCount.toLocaleString()} Contacts</span>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500">
                                <span>Updated {formatDistanceToNow(new Date(a.updatedAt))} ago</span>
                                <span className="font-mono bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-[10px]">ID: {a.id.slice(-6)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
