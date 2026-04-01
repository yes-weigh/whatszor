import Link from 'next/link';
import { ArrowRight, MessageSquare, Zap, Users, Inbox, CheckCircle2, BarChart } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-green-200">
            {/* Navbar */}
            <header className="fixed inset-x-0 top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600 text-white">
                                <MessageSquare className="h-5 w-5" />
                            </div>
                            <span className="text-xl font-bold tracking-tight">WhatsVue</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 hidden sm:block">
                                Sign In
                            </Link>
                            <Link
                                href="/register"
                                className="inline-flex items-center justify-center rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 transition-colors"
                            >
                                Start Free
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            <main className="pt-16">
                {/* Hero Section */}
                <section className="relative overflow-hidden bg-white px-4 pt-20 pb-24 sm:px-6 lg:px-8 lg:pt-32 lg:pb-36">
                    <div className="mx-auto max-w-4xl text-center">
                        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                            Never Miss a <span className="text-green-600">WhatsApp Customer</span> Again
                        </h1>
                        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
                            Automate replies, send product details instantly, and convert chats into sales. The all-in-one WhatsApp tool built for growing Indian businesses.
                        </p>
                        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                href="/register"
                                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-green-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 transition-colors"
                            >
                                Start Free
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <a
                                href="#demo"
                                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-slate-100 px-8 py-3.5 text-base font-semibold text-slate-900 hover:bg-slate-200 transition-colors"
                            >
                                View Demo
                            </a>
                        </div>
                        <p className="mt-4 text-sm text-slate-500">No credit card required • Setup in 2 minutes</p>
                    </div>
                </section>

                {/* Problem -> Solution Section */}
                <section className="bg-slate-50 py-20 sm:py-28">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="grid grid-cols-1 gap-y-16 lg:grid-cols-2 lg:gap-x-16 lg:items-center">
                            <div>
                                <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                                    Running a business on WhatsApp is hard.
                                </h2>
                                <ul className="mt-8 space-y-6">
                                    {[
                                        'Too many WhatsApp messages to handle alone',
                                        'Missed replies costing you real sales',
                                        'Typing the same price and product details all day',
                                        'No proper follow-up for leads from Facebook/Insta ads',
                                    ].map((painPoint, i) => (
                                        <li key={i} className="flex gap-4">
                                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 mt-1">
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </div>
                                            <span className="text-lg text-slate-700">{painPoint}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200 sm:p-10 text-center lg:text-left">
                                <h3 className="text-2xl font-bold text-green-600 mb-4">
                                    WhatsVue makes it effortless.
                                </h3>
                                <p className="text-slate-600 text-lg mb-8 leading-relaxed">
                                    Transform your personal WhatsApp into a powerful team inbox with smart automation. Automatically greet customers, answer FAQs, and blast offers—while you focus on growing the business.
                                </p>
                                <div className="space-y-4">
                                    <div className="bg-green-50 rounded-2xl p-4 flex items-start gap-4 border border-green-100">
                                        <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5 shrink-0" />
                                        <div className="text-left">
                                            <p className="font-semibold text-slate-900">24/7 Auto Replies</p>
                                            <p className="text-sm text-slate-600 mt-1">Never make a customer wait again.</p>
                                        </div>
                                    </div>
                                    <div className="bg-green-50 rounded-2xl p-4 flex items-start gap-4 border border-green-100">
                                        <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5 shrink-0" />
                                        <div className="text-left">
                                            <p className="font-semibold text-slate-900">Team Access</p>
                                            <p className="text-sm text-slate-600 mt-1">Let your staff reply from the same number.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Key Features Section */}
                <section className="bg-white py-20 sm:py-28">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl mb-4">
                            Everything you need to sell more on WhatsApp
                        </h2>
                        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-16">
                            Powerful tools designed specifically for Indian SMBs to drive operational efficiency and increase conversion rates.
                        </p>
                        
                        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 text-left">
                            <FeatureCard 
                                icon={<Zap />}
                                title="Bulk WhatsApp Campaigns"
                                desc="Send personalized offers, festival greetings, and updates to 1000+ customers instantly with zero effort."
                            />
                            <FeatureCard 
                                icon={<MessageSquare />}
                                title="Always-On Auto Replies"
                                desc="Reply to common customer queries instantly, even when you're offline or asleep."
                            />
                            <FeatureCard 
                                icon={<BarChart />}
                                title="Keyword Automation"
                                desc="Customer types 'price' or 'menu' → your product catalog or PDF is sent automatically."
                            />
                            <FeatureCard 
                                icon={<Users />}
                                title="AI Reply Suggestions"
                                desc="Help your staff reply faster, with better tone, closing more deals without typing slowly."
                            />
                            <FeatureCard 
                                icon={<Inbox />}
                                title="Shared Team Inbox"
                                desc="Manage all customer chats in one single dashboard. No more passing phones around."
                            />
                        </div>
                    </div>
                </section>

                {/* Product Preview Section */}
                <section id="demo" className="bg-slate-900 py-20 sm:py-28 overflow-hidden relative">
                    <div className="absolute inset-0 bg-green-900/10 blur-3xl rounded-full translate-y-24 scale-150"></div>
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-4">
                                Simple enough for anyone to use
                            </h2>
                            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                                See how easy it is to automate your sales workflow and manage customer conversations.
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                            {/* Mockup 1: Chat Automation */}
                            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-2 shadow-2xl overflow-hidden">
                                <div className="bg-slate-900 rounded-xl p-4 sm:p-6 h-[400px] flex flex-col justify-end">
                                    <div className="flex gap-4 mb-4 items-end">
                                        <div className="bg-green-700 text-white rounded-2xl rounded-bl-sm p-4 max-w-[80%] text-sm">
                                            Hi! Welcome to our store. How can we help you today? Please reply with 1 for Catalog, 2 for Support.
                                        </div>
                                    </div>
                                    <div className="flex gap-4 mb-4 justify-end items-end">
                                        <div className="bg-slate-700 text-white rounded-2xl rounded-br-sm p-4 max-w-[80%] text-sm">
                                            1
                                        </div>
                                    </div>
                                    <div className="flex gap-4 mb-2 items-end">
                                        <div className="bg-green-700 text-white rounded-2xl rounded-bl-sm p-4 max-w-[80%] text-sm">
                                            Here is our latest electronics catalog! Check it out below 👇
                                        </div>
                                    </div>
                                    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 mt-2 max-w-[80%] flex items-center gap-3">
                                        <div className="bg-red-500/20 text-red-400 p-2 rounded-lg"><Zap className="h-5 w-5" /></div>
                                        <div>
                                            <p className="text-white text-sm font-medium">Summer_Catalog.pdf</p>
                                            <p className="text-slate-400 text-xs">2.4 MB</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 text-center">
                                    <p className="text-white font-medium">Instant Keyword Automation</p>
                                </div>
                            </div>

                            {/* Mockup 2: Dashboard */}
                            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-2 shadow-2xl overflow-hidden">
                                <div className="bg-slate-900 rounded-xl overflow-hidden h-[400px] flex flex-col">
                                    {/* Fake Header */}
                                    <div className="border-b border-slate-800 p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 bg-green-600 rounded-full flex items-center justify-center"><Inbox className="h-4 w-4 text-white" /></div>
                                            <div className="h-4 w-24 bg-slate-700 rounded animate-pulse"></div>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="h-8 w-8 rounded-full bg-slate-800"></div>
                                            <div className="h-8 w-8 rounded-full bg-slate-800"></div>
                                        </div>
                                    </div>
                                    {/* Fake Body */}
                                    <div className="flex flex-1">
                                        <div className="w-1/3 border-r border-slate-800 p-2 space-y-2">
                                            {[1,2,3,4].map(i => (
                                                <div key={i} className={`p-3 rounded-lg ${i === 1 ? 'bg-slate-800' : 'hover:bg-slate-800/50'}`}>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <div className="h-3 w-16 bg-slate-700 rounded"></div>
                                                        <div className="h-2 w-8 bg-green-500/20 rounded"></div>
                                                    </div>
                                                    <div className="h-2 w-full bg-slate-800 rounded mt-2"></div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="w-2/3 p-6 flex flex-col items-center justify-center text-slate-500 opacity-50">
                                            <MessageSquare className="h-12 w-12 mb-4 text-slate-700" />
                                            <p>Select a chat to view</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 text-center">
                                    <p className="text-white font-medium">Shared Team CRM Dashboard</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Final CTA Section */}
                <section className="bg-green-600 py-20 text-center relative overflow-hidden">
                    {/* Decorative pattern */}
                    <svg className="absolute inset-0 h-full w-full opacity-10" fill="none" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                            <path d="M 10 0 L 0 0 0 10" stroke="white" strokeWidth="0.5" />
                        </pattern>
                        <rect width="100" height="100" fill="url(#grid)" />
                    </svg>
                    
                    <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
                        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl mb-6">
                            Start converting your WhatsApp into a sales machine
                        </h2>
                        <p className="text-green-100 text-lg sm:text-xl mb-10 max-w-2xl mx-auto">
                            Join hundreds of Indian businesses automating their WhatsApp customer service and skyrocketing their sales.
                        </p>
                        <Link
                            href="/register"
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-10 py-4 text-lg font-bold text-green-700 shadow-lg hover:bg-slate-50 hover:scale-105 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                            Start Free Trial
                            <ArrowRight className="h-5 w-5" />
                        </Link>
                        <p className="mt-6 text-sm text-green-200">Set up in 2 minutes. Cancel anytime.</p>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-white py-12 border-t border-slate-200 text-center text-slate-500">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded bg-green-600 text-white">
                            <MessageSquare className="h-4 w-4" />
                        </div>
                        <span className="font-semibold text-slate-900">WhatsVue</span>
                    </div>
                    <p className="text-sm">© {new Date().getFullYear()} WhatsVue. All rights reserved.</p>
                    <div className="flex gap-6 text-sm">
                        <Link href="/terms" className="hover:text-slate-900">Terms</Link>
                        <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 hover:border-green-200 hover:shadow-lg transition-all group">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-600 mb-6 group-hover:scale-110 group-hover:bg-green-600 group-hover:text-white transition-all">
                {icon}
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
            <p className="text-slate-600 leading-relaxed">{desc}</p>
        </div>
    );
}
