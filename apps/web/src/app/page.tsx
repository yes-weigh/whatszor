"use client";

import Link from 'next/link';
import { motion, useScroll, useTransform, useMotionTemplate, useMotionValue } from 'framer-motion';
import { MouseEvent, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { 
    ArrowRight, Bot, Zap, ImageIcon, Users, MessageSquare, 
    TrendingUp, ShieldCheck, CheckCircle2, 
    BarChart3, Database, Play, AlertCircle, PhoneMissed, 
    Clock, Store, Building2, MonitorSmartphone, Briefcase, Star,
    Sun, Moon
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*                               SHARED COMPONENTS                            */
/* -------------------------------------------------------------------------- */

function GlowCard({ children, className = "" }: { children: React.ReactNode, className?: string }) {
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    }

    return (
        <div 
            onMouseMove={handleMouseMove}
            className={`group relative overflow-hidden rounded-2xl bg-surface border border-theme hover:border-strong backdrop-blur-md transition-colors ${className}`}
        >
            <motion.div
                className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition duration-500 group-hover:opacity-100 dark:block hidden"
                style={{
                    background: useMotionTemplate`
                        radial-gradient(
                            600px circle at ${mouseX}px ${mouseY}px,
                            rgba(16, 185, 129, 0.15),
                            transparent 80%
                        )
                    `,
                }}
            />
            <div className="relative z-10 w-full h-full text-left">
                {children}
            </div>
        </div>
    );
}

function LandingThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;
    const isDark = theme === 'dark';
    return (
        <button 
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="p-2 rounded-full text-muted hover:text-primary hover:bg-hover transition-colors"
            aria-label="Toggle theme"
        >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
    );
}

/* -------------------------------------------------------------------------- */
/*                               MAIN PAGE COMPONENT                          */
/* -------------------------------------------------------------------------- */

export default function LandingPage() {
    const { scrollYProgress } = useScroll();
    const yHero = useTransform(scrollYProgress, [0, 1], [0, 200]);
    const opacityHero = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

    return (
        <div className="min-h-screen bg-base font-sans text-secondary selection:bg-emerald-500/30 selection:text-emerald-200 overflow-x-hidden transition-colors">
            
            {/* Animated Background Gradients & Particles */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-600/10 blur-[120px]" />
                <div className="absolute bottom-[10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-900/10 blur-[150px]" />
                {/* Subtle Grid overlay */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxwYXRoIGQ9Ik00MCAwaC00MHY0MGg0MHoiIGZpbGw9Im5vbmUiIC8+CjxwYXRoIGQ9Ik00MCAwaC00MHYxQzAgbTAgNDAsNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAyKSIgc3Ryb2tlLXdpZHRoPSIxIiAvPgo8L3N2Zz4=')] opacity-50" />
            </div>

            {/* Navbar */}
            <header className="fixed inset-x-0 top-0 z-50 bg-base/80 backdrop-blur-xl border-b border-theme transition-colors">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-black">
                                <MessageSquare className="h-5 w-5" />
                            </div>
                            <span className="text-xl font-bold tracking-tight text-primary">WhatsVue</span>
                        </div>
                        <div className="flex items-center gap-4 sm:gap-6">
                            <LandingThemeToggle />
                            <Link href="/login" className="text-sm font-medium text-muted hover:text-primary transition-colors hidden sm:block">
                                Sign In
                            </Link>
                            <Link
                                href="/register"
                                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white sm:text-black shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 transition-all"
                            >
                                Start Free Trial
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            <main className="relative z-10 pt-16">
                
                {/* 1. HERO SECTION (CRITICAL) */}
                <section className="relative overflow-hidden px-4 pt-20 pb-24 sm:px-6 lg:px-8 lg:pt-32 lg:pb-32">
                    <div className="mx-auto max-w-7xl">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                            
                            {/* Left: Value Proposition */}
                            <motion.div 
                                style={{ y: yHero, opacity: opacityHero }}
                                className="max-w-2xl"
                            >
                                <motion.div 
                                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-6"
                                >
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    The ultimate WhatsApp CRM for India
                                </motion.div>
                                
                                <motion.h1 
                                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
                                    className="text-5xl font-extrabold tracking-tight text-primary sm:text-6xl lg:text-7xl leading-[1.1]"
                                >
                                    Turn WhatsApp into Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-cyan-500 dark:from-emerald-400 dark:to-cyan-400">Sales Engine</span>
                                </motion.h1>
                                
                                <motion.p 
                                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
                                    className="mt-6 text-xl leading-8 text-secondary"
                                >
                                    Stop losing leads from unread messages. Automate your ad replies, launch bulk campaigns in seconds, and close deals faster with AI.
                                </motion.p>
                                
                                <motion.div 
                                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
                                    className="mt-10 flex flex-col sm:flex-row items-center gap-4"
                                >
                                    <Link
                                        href="/register"
                                        className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 py-4 text-base font-bold text-white dark:text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] hover:scale-105 transition-all"
                                    >
                                        Start Campaign in 2 Minutes
                                        <ArrowRight className="h-5 w-5" />
                                    </Link>
                                    <a
                                        href="#demo"
                                        className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-surface border border-strong px-8 py-4 text-base font-semibold text-primary hover:bg-hover transition-colors"
                                    >
                                        <Play className="h-4 w-4 fill-current" />
                                        See Demo
                                    </a>
                                </motion.div>
                                
                                <motion.div 
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} 
                                    className="mt-8 flex flex-wrap items-center gap-6 text-sm text-muted font-medium"
                                >
                                    <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Bulk campaigns</div>
                                    <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Auto replies from ads</div>
                                    <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> AI-assisted replies</div>
                                </motion.div>
                            </motion.div>

                            {/* Right: Motion-driven Visual */}
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
                                className="relative hidden lg:block"
                            >
                                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-transparent blur-3xl opacity-50 rounded-full dark:opacity-50 opacity-20" />
                                <div className="relative h-[500px] w-full rounded-2xl border border-theme bg-surface/80 backdrop-blur-xl shadow-2xl p-6 flex flex-col justify-center">
                                    
                                    {/* Animated Nodes */}
                                    <div className="space-y-6 relative z-10 w-full max-w-sm mx-auto">
                                        <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="bg-elevated p-4 rounded-xl border border-theme shadow-lg flex items-center gap-4">
                                            <div className="bg-blue-500/20 text-blue-500 p-3 rounded-lg"><MonitorSmartphone className="h-6 w-6" /></div>
                                            <div>
                                                <p className="text-primary text-sm font-semibold">User clicked FB Ad</p>
                                                <p className="text-muted text-xs">&quot;Interested in catalog&quot;</p>
                                            </div>
                                        </motion.div>
                                        
                                        {/* Connector */}
                                        <div className="w-1 h-8 bg-gradient-to-b from-theme to-emerald-500/50 ml-10 rounded-full"></div>
                                        
                                        <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.8 }} className="bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/30 shadow-lg flex items-center gap-4 relative ml-8">
                                            <div className="bg-emerald-500 text-white dark:text-black p-3 rounded-lg"><Zap className="h-6 w-6" /></div>
                                            <div>
                                                <p className="text-emerald-700 dark:text-emerald-100 text-sm font-semibold">Auto-Reply Triggered</p>
                                                <p className="text-emerald-600 dark:text-emerald-500 text-xs">Instantly sent PDF + Pricing</p>
                                            </div>
                                        </motion.div>

                                        {/* Connector */}
                                        <div className="w-1 h-8 bg-gradient-to-b from-emerald-500/50 to-emerald-500 ml-16 rounded-full"></div>

                                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.1 }} className="bg-elevated p-4 rounded-xl border border-emerald-500/50 shadow-xl flex items-center gap-4 relative ml-12">
                                            <div className="bg-gradient-to-r from-emerald-400 to-emerald-600 text-white dark:text-black p-3 rounded-full"><TrendingUp className="h-6 w-6" /></div>
                                            <div>
                                                <p className="text-primary text-sm font-bold">Deal Closed!</p>
                                                <p className="text-muted text-xs">Collected ₹1,500 automatically</p>
                                            </div>
                                        </motion.div>
                                    </div>

                                </div>
                            </motion.div>

                        </div>
                    </div>
                </section>

                {/* 2. STORY FLOW: Problem -> Solution */}
                <section className="py-24 border-y border-theme bg-surface transition-colors">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                            
                            {/* Problem Section */}
                            <motion.div 
                                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
                            >
                                <div className="text-red-500 text-sm font-bold tracking-wider uppercase mb-2">The Old Way</div>
                                <h2 className="text-3xl font-bold text-primary mb-6">Leads coming from ads<br/>→ no response<br/>→ lost sales.</h2>
                                <GlowCard className="p-6 bg-red-500/5 border border-red-500/20">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 opacity-60"><PhoneMissed className="text-red-500 h-5 w-5" /> <span className="text-secondary">Customer 1: Left waiting 4 hrs</span></div>
                                        <div className="flex items-center gap-3 opacity-60"><AlertCircle className="text-red-500 h-5 w-5" /> <span className="text-secondary">Customer 2: Ignored on Facebook</span></div>
                                        <div className="flex items-center gap-3 opacity-60"><Clock className="text-red-500 h-5 w-5" /> <span className="text-secondary">Customer 3: Saw ad, got bored</span></div>
                                    </div>
                                    <div className="mt-6 pt-6 border-t border-red-500/20 text-red-600 dark:text-red-300 text-sm">
                                        You are paying for ads, but throwing the leads away because manual WhatsApp is too slow.
                                    </div>
                                </GlowCard>
                            </motion.div>

                            {/* Solution Section */}
                            <motion.div 
                                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}
                            >
                                <div className="text-emerald-500 text-sm font-bold tracking-wider uppercase mb-2">The WhatsVue Way</div>
                                <h2 className="text-3xl font-bold text-primary mb-6">Zero delays. Total automation. Maximum conversion.</h2>
                                <GlowCard className="p-6">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-4 bg-elevated/80 p-3 rounded-lg border border-theme">
                                            <span className="flex-shrink-0 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold px-2 py-1 rounded">1. ADS</span>
                                            <span className="text-sm text-primary">User clicks Facebook or Insta Ad</span>
                                        </div>
                                        <div className="flex justify-center"><ArrowRight className="h-4 w-4 text-muted rotate-90" /></div>
                                        <div className="flex items-center gap-4 bg-elevated/80 p-3 rounded-lg border border-theme">
                                            <span className="flex-shrink-0 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold px-2 py-1 rounded">2. KEYWORD</span>
                                            <span className="text-sm text-primary">Sends automated trigger (&quot;Hi!&quot;)</span>
                                        </div>
                                        <div className="flex justify-center"><ArrowRight className="h-4 w-4 text-muted rotate-90" /></div>
                                        <div className="flex items-center gap-4 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                                            <span className="flex-shrink-0 bg-emerald-500 text-white dark:text-black text-xs font-bold px-2 py-1 rounded">3. CONVERT</span>
                                            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Instant AI response & Media sharing</span>
                                        </div>
                                    </div>
                                </GlowCard>
                            </motion.div>

                        </div>
                    </div>
                </section>

                {/* 3. BUSINESS VALUE FEATURES */}
                <section className="py-24 bg-base relative transition-colors">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="text-center max-w-3xl mx-auto mb-16">
                            <h2 className="text-3xl font-bold text-primary sm:text-4xl mb-4">Features built strictly to increase your revenue</h2>
                            <p className="text-muted text-lg">We didn&apos;t build vanity metrics. We built tools that directly map to closing more sales on WhatsApp.</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <GlowCard className="p-8">
                                <div className="flex gap-4 items-start">
                                    <div className="bg-elevated p-3 rounded-xl border border-theme text-emerald-500"><Users className="h-6 w-6" /></div>
                                    <div>
                                        <h3 className="text-xl font-bold text-primary mb-2">Bulk WhatsApp Campaigns</h3>
                                        <p className="text-secondary mb-4">Send personalized offers and festival greetings instantly.</p>
                                        <div className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-300 px-3 py-1.5 rounded-lg text-sm font-semibold">
                                            Outcome: Reach 1000+ customers instantly
                                        </div>
                                    </div>
                                </div>
                            </GlowCard>

                            <GlowCard className="p-8">
                                <div className="flex gap-4 items-start">
                                    <div className="bg-elevated p-3 rounded-xl border border-theme text-emerald-500"><Zap className="h-6 w-6" /></div>
                                    <div>
                                        <h3 className="text-xl font-bold text-primary mb-2">Keyword Auto Replies</h3>
                                        <p className="text-secondary mb-4">Target specific keywords to trigger exact PDF menus or pricing.</p>
                                        <div className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-300 px-3 py-1.5 rounded-lg text-sm font-semibold">
                                            Outcome: Never miss a targeted lead
                                        </div>
                                    </div>
                                </div>
                            </GlowCard>

                            <GlowCard className="p-8">
                                <div className="flex gap-4 items-start">
                                    <div className="bg-elevated p-3 rounded-xl border border-theme text-emerald-500"><Bot className="h-6 w-6" /></div>
                                    <div>
                                        <h3 className="text-xl font-bold text-primary mb-2">AI Reply Suggestions</h3>
                                        <p className="text-secondary mb-4">Empower your staff with 1-click intelligent responses to FAQs.</p>
                                        <div className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-300 px-3 py-1.5 rounded-lg text-sm font-semibold">
                                            Outcome: Faster closing times
                                        </div>
                                    </div>
                                </div>
                            </GlowCard>

                            <GlowCard className="p-8">
                                <div className="flex gap-4 items-start">
                                    <div className="bg-elevated p-3 rounded-xl border border-theme text-emerald-500"><ImageIcon className="h-6 w-6" /></div>
                                    <div>
                                        <h3 className="text-xl font-bold text-primary mb-2">Automated Media Storage</h3>
                                        <p className="text-secondary mb-4">Store catalogs and videos once, send via automation forever.</p>
                                        <div className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-300 px-3 py-1.5 rounded-lg text-sm font-semibold">
                                            Outcome: Instant product sharing
                                        </div>
                                    </div>
                                </div>
                            </GlowCard>
                        </div>
                    </div>
                </section>

                {/* 4. PRODUCT PREVIEW (CSS MOCKUP) - Force dark mode look for this mock to mimic SaaS UI */}
                <section className="py-24 bg-surface relative overflow-hidden transition-colors" id="demo">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-theme to-transparent"></div>
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="text-left mb-12">
                            <h2 className="text-3xl font-bold text-primary sm:text-4xl mb-4">Command your business from a single pane of glass.</h2>
                            <p className="text-muted text-lg">No more passing phones around. Your team, analytics, and chats live here.</p>
                        </div>
                        
                        <motion.div 
                            initial={{ y: 50, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8 }}
                            className="relative rounded-2xl border border-white/10 bg-black shadow-2xl overflow-hidden ring-1 ring-white/5"
                        >
                            {/* Dashboard Header Bar */}
                            <div className="h-12 bg-zinc-950 border-b border-white/5 flex items-center px-4 gap-4">
                                <div className="flex gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                                    <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                                    <div className="w-3 h-3 rounded-full bg-emerald-500/50"></div>
                                </div>
                                <div className="mx-auto bg-zinc-900 rounded bg-opacity-50 h-5 w-64 border border-white/5"></div>
                            </div>
                            
                            {/* Dashboard Application Shell */}
                            <div className="flex h-[500px]">
                                {/* Sidebar */}
                                <div className="w-16 md:w-48 border-r border-white/5 bg-zinc-950/80 p-3 md:p-4 flex flex-col gap-4">
                                    <div className="w-full h-8 bg-zinc-800/50 rounded flex items-center px-2 gap-2 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                        <MessageSquare className="h-4 w-4" /> <span className="hidden md:block text-xs font-semibold">Chats</span>
                                    </div>
                                    <div className="w-full h-8 hover:bg-zinc-800/30 text-zinc-500 rounded flex items-center px-2 gap-2 transition-colors">
                                        <Users className="h-4 w-4" /> <span className="hidden md:block text-xs font-semibold">Contacts</span>
                                    </div>
                                    <div className="w-full h-8 hover:bg-zinc-800/30 text-zinc-500 rounded flex items-center px-2 gap-2 transition-colors">
                                        <BarChart3 className="h-4 w-4" /> <span className="hidden md:block text-xs font-semibold">Campaigns</span>
                                    </div>
                                    <div className="w-full h-8 hover:bg-zinc-800/30 text-zinc-500 rounded flex items-center px-2 gap-2 transition-colors">
                                        <Database className="h-4 w-4" /> <span className="hidden md:block text-xs font-semibold">Media File</span>
                                    </div>
                                </div>

                                {/* Chat List (Incoming Leads) */}
                                <div className="w-64 border-r border-white/5 bg-black p-4 hidden lg:flex flex-col gap-3 overflow-hidden">
                                    <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Active Leads (4)</div>
                                    
                                    {/* Active Highlighted Chat */}
                                    <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-emerald-50 font-bold text-sm">Rahul Electronics</span>
                                            <span className="text-emerald-500 text-[10px]">Just Now</span>
                                        </div>
                                        <span className="text-zinc-400 text-xs">Interested in bulk order...</span>
                                    </div>

                                    {/* Generic Chats */}
                                    {[1,2,3].map(i => (
                                        <div key={i} className="hover:bg-zinc-900 border border-transparent rounded-lg p-3 cursor-pointer transition-colors">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-zinc-300 font-semibold text-sm">+91 98xxx xxxx{i}</span>
                                                <span className="text-zinc-600 text-[10px]">1h ago</span>
                                            </div>
                                            <span className="text-zinc-500 text-xs truncate block">What is the price of...</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Main Chat Area & Stats Content */}
                                <div className="flex-1 bg-gradient-to-br from-zinc-950 to-black p-6 flex flex-col relative overflow-hidden">
                                    {/* Top Stat row */}
                                    <div className="flex justify-between gap-4 mb-8">
                                        <div className="flex-1 bg-zinc-900/50 border border-white/5 rounded-xl p-4">
                                            <span className="text-zinc-500 text-xs font-semibold">Messages Sent Today</span>
                                            <div className="text-2xl font-bold text-white mt-1">2,408</div>
                                        </div>
                                        <div className="flex-1 bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-4">
                                            <span className="text-emerald-400/70 text-xs font-semibold">AI Conversion Rate</span>
                                            <div className="text-2xl font-bold text-emerald-400 mt-1">34.2% <TrendingUp className="inline h-4 w-4" /></div>
                                        </div>
                                    </div>

                                    {/* Active Chat Mock */}
                                    <div className="flex-1 rounded-xl bg-zinc-900/30 border border-white/5 flex flex-col p-4 relative backdrop-blur-sm">
                                        <div className="flex justify-start mb-4">
                                            <div className="bg-zinc-800 text-zinc-300 p-3 rounded-2xl rounded-tl-sm text-sm border border-white/5">
                                                Hi! I saw your ad on Instagram. Do you ship to Mumbai?
                                            </div>
                                        </div>
                                        <div className="flex justify-end mb-4">
                                            <div className="bg-emerald-600 text-black p-3 rounded-2xl rounded-br-sm text-sm font-medium">
                                                Yes Rahul! We ship to Mumbai. Our delivery takes 2-3 days. Would you like to see our catalog?
                                            </div>
                                        </div>
                                        
                                        {/* AI Suggested Replies Panel Overlay */}
                                        <div className="absolute bottom-6 right-6 w-72 bg-zinc-950 border border-emerald-500/30 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-hidden">
                                            <div className="bg-emerald-900/30 px-3 py-2 text-xs font-bold text-emerald-400 border-b border-emerald-500/20 flex items-center gap-2">
                                                <Bot className="h-3 w-3" /> AI SUGGESTIONS
                                            </div>
                                            <div className="p-2 space-y-2">
                                                <div className="bg-zinc-900 hover:bg-zinc-800 cursor-pointer p-2 rounded text-xs text-zinc-300 border border-white/5 transition-colors">
                                                    Sure! Sending our Mumbai wholesale catalog now.
                                                </div>
                                                <div className="bg-zinc-900 hover:bg-zinc-800 cursor-pointer p-2 rounded text-xs text-zinc-300 border border-white/5 transition-colors flex justify-between items-center">
                                                    <span>Offer 10% discount to close</span>
                                                    <span className="bg-emerald-500/20 text-emerald-400 px-1 rounded text-[10px]">High Conversion!</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                {/* Hardcoded product UI mocking dark mode SaaS */}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>

                {/* 5. TRUST & CONVERSION LAYER */}
                <section className="py-24 bg-base border-t border-theme transition-colors">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl font-bold text-primary mb-4">Built strictly for Indian Businesses</h2>
                            <p className="text-muted">Robust, reliable, and natively integrated with the Official Meta WhatsApp API.</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                            <div className="flex flex-col items-center text-center p-6 bg-surface rounded-2xl border border-theme shadow-sm shadow-theme/30">
                                <Store className="h-10 w-10 text-muted mb-4" />
                                <h3 className="text-primary font-bold mb-2">Retail & E-commerce</h3>
                                <p className="text-sm text-secondary">Automate catalog sharing and payment follow-ups instantly.</p>
                            </div>
                            <div className="flex flex-col items-center text-center p-6 bg-surface rounded-2xl border border-theme shadow-sm shadow-theme/30">
                                <Building2 className="h-10 w-10 text-muted mb-4" />
                                <h3 className="text-primary font-bold mb-2">Real Estate</h3>
                                <p className="text-sm text-secondary">Capture leads 24/7 and send property PDFs automatically.</p>
                            </div>
                            <div className="flex flex-col items-center text-center p-6 bg-surface rounded-2xl border border-theme shadow-sm shadow-theme/30">
                                <Briefcase className="h-10 w-10 text-muted mb-4" />
                                <h3 className="text-primary font-bold mb-2">Service Agencies</h3>
                                <p className="text-sm text-secondary">Screen leads, book appointments, and collect feedback on autopilot.</p>
                            </div>
                        </div>

                        {/* Testimonial & Credibility */}
                        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-8 bg-surface rounded-2xl border border-emerald-500/20 p-8 shadow-[0_0_40px_rgba(16,185,129,0.05)]">
                            <div className="flex-1 text-left">
                                <div className="flex items-center gap-1 mb-4 text-emerald-500">
                                    {[1,2,3,4,5].map(i => <Star key={i} className="h-5 w-5 fill-current" />)}
                                </div>
                                <p className="text-xl text-secondary font-medium italic leading-relaxed mb-6">
                                    &quot;Since switching to WhatsVue, our ad spend ROI doubled. We instantly reply to every Facebook lead with a catalog, and the team handles chats from a single dashboard instead of fighting over a phone.&quot;
                                </p>
                                <div>
                                    <p className="text-primary font-bold">Arun Sharma</p>
                                    <p className="text-muted text-sm">Owner, Prime Retails Mumbai</p>
                                </div>
                            </div>
                            <div className="w-px h-32 bg-theme hidden md:block"></div>
                            <div className="flex-shrink-0 text-center flex flex-col items-center justify-center p-4">
                                <ShieldCheck className="h-12 w-12 text-emerald-500 mb-2" />
                                <span className="text-primary font-semibold text-sm">Powered by</span>
                                <span className="text-muted text-xs">Official Cloud API</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 6. FINAL CTA (STRONG CLOSE) */}
                <section className="relative py-32 bg-surface overflow-hidden border-t border-theme transition-colors">
                    <div className="absolute inset-0 bg-emerald-500/10 dark:bg-emerald-900/20 blur-3xl rounded-full scale-150 transform translate-y-1/2"></div>
                    
                    <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
                        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-primary mb-6">
                            Stop losing leads. <br/>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-cyan-500">Automate your WhatsApp today.</span>
                        </h2>
                        <p className="mt-4 text-xl text-secondary mb-10">
                            Give your business the operational machine it deserves. Set up in 2 minutes.
                        </p>
                        
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                href="/register"
                                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-emerald-500 px-10 py-5 text-lg font-bold text-white dark:text-black shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:shadow-[0_0_40px_rgba(16,185,129,0.6)] hover:bg-emerald-400 focus-visible:outline transition-all scale-100 hover:scale-105"
                            >
                                Start Free Trial
                                <ArrowRight className="h-5 w-5" />
                            </Link>
                            <a
                                href="#demo"
                                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-transparent border border-strong px-10 py-5 text-lg font-semibold text-primary hover:bg-hover transition-colors"
                            >
                                Book Demo
                            </a>
                        </div>
                    </div>
                </section>

            </main>

            {/* Footer */}
            <footer className="bg-base py-12 border-t border-theme text-center text-muted transition-colors">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded bg-elevated text-emerald-500 border border-theme">
                            <MessageSquare className="h-4 w-4" />
                        </div>
                        <span className="font-semibold text-primary">WhatsVue</span>
                    </div>
                    <p className="text-sm" suppressHydrationWarning>© {new Date().getFullYear()} WhatsVue. All rights reserved.</p>
                    <div className="flex gap-6 text-sm">
                        <Link href="/terms" className="hover:text-secondary transition-colors">Terms</Link>
                        <Link href="/privacy" className="hover:text-secondary transition-colors">Privacy</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
