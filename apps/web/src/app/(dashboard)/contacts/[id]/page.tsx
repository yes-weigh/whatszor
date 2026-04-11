'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { useAuthStore } from '@/store/auth';
import {
    ArrowLeft, Phone, Mail, Tag, Pencil, Trash2, Save, X, Loader2, User, PackagePlus, Box
} from 'lucide-react';
import {
    Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription
} from '@/components/ui/Modal';

export default function ContactDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const qc = useQueryClient();
    const hasPermission = useAuthStore(s => s.hasPermission);

    const [editing, setEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [productModalOpen, setProductModalOpen] = useState(false);
    const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '' });
    const [productForm, setProductForm] = useState({ productId: '', relationType: 'INTERESTED' });

    // Contact queries
    const { data: contact, isLoading } = useQuery({
        queryKey: ['contact', id],
        queryFn: () => api.get(`/crm/contacts/${id}`).then(r => {
            const c = r.data;
            setForm({ firstName: c?.firstName ?? '', lastName: c?.lastName ?? '', phone: c?.phone ?? '', email: c?.email ?? '' });
            return c;
        }),
        enabled: !!id,
    });

    const updateMutation = useMutation({
        mutationFn: (payload: typeof form) => api.patch(`/crm/contacts/${id}`, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['contact', id] });
            qc.invalidateQueries({ queryKey: ['contacts'] });
            setEditing(false);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => api.delete(`/crm/contacts/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['contacts'] });
            router.push('/contacts');
        },
    });

    const { data: linkedProducts } = useQuery({
        queryKey: ['contact-products', id],
        queryFn: () => api.get(`/crm/contacts/${id}/products`).then(r => r.data?.items ?? []),
        enabled: !!id,
    });

    const { data: workspaceProducts } = useQuery({
        queryKey: ['workspace-products'],
        queryFn: () => api.get('/knowledge/products').then(r => r.data?.items ?? []),
    });

    const mapProductMutation = useMutation({
        mutationFn: (payload: { productId: string, relationType: string }) => api.post(`/crm/contacts/${id}/products`, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['contact-products', id] });
            setProductForm({ productId: '', relationType: 'INTERESTED' });
            setProductModalOpen(false);
        }
    });

    const unmapProductMutation = useMutation({
        mutationFn: ({ productId, relationType }: { productId: string, relationType: string }) => 
            api.delete(`/crm/contacts/${id}/products/${productId}?relationType=${relationType}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-products', id] })
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={24} className="animate-spin text-muted" />
            </div>
        );
    }

    if (!contact) {
        return (
            <div className="p-6">
                <p className="text-muted">Contact not found.</p>
                <button className="btn btn-primary mt-4" onClick={() => router.push('/contacts')}>
                    Back to Contacts
                </button>
            </div>
        );
    }

    return (
        <div>
            <Header title="Contact Detail" subtitle={`${contact.firstName} ${contact.lastName || ''}`} />
            <div className="p-6 max-w-2xl mx-auto flex flex-col gap-6">

                {/* Back Button */}
                <button onClick={() => router.push('/contacts')}
                    className="flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors self-start">
                    <ArrowLeft size={15} /> Back to Contacts
                </button>

                {/* Contact Card */}
                <div className="card flex flex-col gap-6">
                    {/* Header Row */}
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-white text-xl font-bold shrink-0">
                                {contact.firstName?.charAt(0).toUpperCase() ?? <User size={24} />}
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-primary">
                                    {contact.firstName} {contact.lastName}
                                </h2>
                                {contact.pipeline?.name && (
                                    <span className="badge badge-blue mt-1">{contact.pipeline.name}</span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {hasPermission('contacts:update') && (
                                <button onClick={() => setEditing(e => !e)}
                                    className="btn bg-elevated text-secondary hover:text-primary flex items-center gap-2">
                                    {editing ? <><X size={14} /> Cancel</> : <><Pencil size={14} /> Edit</>}
                                </button>
                            )}
                            {hasPermission('contacts:delete') && (
                                <button onClick={() => setConfirmDelete(true)}
                                    className="btn bg-danger/10 text-danger hover:bg-danger/20 flex items-center gap-2">
                                    <Trash2 size={14} /> Delete
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Fields — View Mode */}
                    {!editing && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted font-medium uppercase tracking-wide">Phone</span>
                                <div className="flex items-center gap-2 text-sm text-primary">
                                    <Phone size={13} className="text-muted" />
                                    {contact.phone || '—'}
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted font-medium uppercase tracking-wide">Email</span>
                                <div className="flex items-center gap-2 text-sm text-primary">
                                    <Mail size={13} className="text-muted" />
                                    {contact.email || '—'}
                                </div>
                            </div>
                            {(contact.tags ?? []).length > 0 && (
                                <div className="flex flex-col gap-1 col-span-2">
                                    <span className="text-xs text-muted font-medium uppercase tracking-wide">Tags</span>
                                    <div className="flex gap-1 flex-wrap">
                                        {contact.tags.map((t: string) => (
                                            <span key={t} className="flex items-center gap-1 badge badge-gray">
                                                <Tag size={10} /> {t}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Product Relations View */}
                            <div className="flex flex-col gap-2 col-span-2 mt-4 pt-4 border-t border-theme/50">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted font-medium uppercase tracking-wide flex items-center gap-1.5"><Box size={14}/> Mapped Products</span>
                                    <button onClick={() => setProductModalOpen(true)} className="text-xs font-semibold text-accent hover:text-accent/80 flex items-center gap-1 transition-colors">
                                        <PackagePlus size={14} /> Map Product
                                    </button>
                                </div>
                                
                                {linkedProducts?.length ? (
                                    <div className="grid grid-cols-1 gap-2 mt-1">
                                        {linkedProducts.map((p: any) => (
                                            <div key={p.product.id} className="flex items-center justify-between p-3 rounded-xl border border-theme bg-surface">
                                                <div>
                                                    <p className="text-sm font-semibold text-primary">{p.product.name}</p>
                                                    <div className="flex gap-1 mt-1.5">
                                                        {p.relationTypes.map((rt: string) => (
                                                            <span key={rt} className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${
                                                                rt === 'OWNED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                                                rt === 'CART' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                                                                'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                            }`}>
                                                                {rt} &nbsp; <X size={10} className="inline cursor-pointer hover:text-white" onClick={() => unmapProductMutation.mutate({ productId: p.product.id, relationType: rt })} />
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted italic">No products mapped yet.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Edit Form */}
                    {editing && (
                        <form onSubmit={e => { e.preventDefault(); updateMutation.mutate(form); }}
                            className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-secondary">First Name</label>
                                    <input className="input" required placeholder="First name"
                                        aria-label="First name"
                                        value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-secondary">Last Name</label>
                                    <input className="input" placeholder="Last name"
                                        aria-label="Last name"
                                        value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-secondary">Phone</label>
                                <input className="input" placeholder="+1234567890" required
                                    value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-secondary">Email</label>
                                <input className="input" type="email" placeholder="email@example.com"
                                    aria-label="Email address"
                                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" className="btn bg-elevated text-secondary" onClick={() => setEditing(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary flex items-center gap-2"
                                    disabled={updateMutation.isPending}>
                                    {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {/* Delete Confirm Modal */}
                {confirmDelete && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="card w-full max-w-sm flex flex-col gap-4">
                            <h3 className="font-bold text-primary">Delete Contact?</h3>
                            <p className="text-sm text-muted">
                                This will permanently delete <strong className="text-primary">{contact.firstName} {contact.lastName}</strong> and all associated data. This cannot be undone.
                            </p>
                            <div className="flex justify-end gap-2">
                                <button className="btn bg-elevated text-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
                                <button className="btn bg-danger text-white hover:bg-danger/80 flex items-center gap-2"
                                    onClick={() => deleteMutation.mutate()}
                                    disabled={deleteMutation.isPending}>
                                    {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Product Mapping Modal */}
                <Modal open={productModalOpen} onOpenChange={setProductModalOpen}>
                    <ModalContent>
                        <ModalHeader>
                            <ModalTitle>Map Product Relationship</ModalTitle>
                            <ModalDescription>Target explicit SaaS items against this lead natively.</ModalDescription>
                        </ModalHeader>
                        
                        <div className="flex flex-col gap-4 py-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-secondary">Target Product</label>
                                <select 
                                    className="input bg-surface"
                                    title="Target Product"
                                    aria-label="Target Product"
                                    value={productForm.productId}
                                    onChange={e => setProductForm(f => ({ ...f, productId: e.target.value }))}
                                >
                                    <option value="" disabled>Select a product...</option>
                                    {workspaceProducts?.map((wp: any) => (
                                        <option key={wp.id} value={wp.id}>{wp.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5 mt-2">
                                <label className="text-xs font-medium text-secondary">Relation State</label>
                                <div className="flex gap-2">
                                    {['INTERESTED', 'CART', 'OWNED'].map(rt => (
                                        <button 
                                            key={rt}
                                            onClick={() => setProductForm(f => ({ ...f, relationType: rt }))}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg border uppercase tracking-wider transition-all ${
                                                productForm.relationType === rt 
                                                    ? 'bg-accent/10 border-accent text-accent' 
                                                    : 'bg-surface border-theme text-muted hover:border-theme/80'
                                            }`}
                                        >
                                            {rt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-4">
                            <button className="btn bg-elevated text-secondary" onClick={() => setProductModalOpen(false)}>Cancel</button>
                            <button 
                                className="btn btn-primary"
                                disabled={!productForm.productId || mapProductMutation.isPending}
                                onClick={() => mapProductMutation.mutate(productForm)}
                            >
                                {mapProductMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Confirm Mapping'}
                            </button>
                        </div>
                    </ModalContent>
                </Modal>
            </div>
        </div>
    );
}
