'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  Brain,
  Shield,
  TrendingUp,
  BarChart3,
  Zap,
  Lock,
  Eye,
  Target,
  Activity,
  ChevronRight,
  ArrowRight,
  Check,
  X,
  Sparkles,
  Bot,
  LineChart,
  Globe,
  Menu,
  XIcon,
} from 'lucide-react';

// ============================================================================
// Animation Variants
// ============================================================================

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
};

const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } },
};

// ============================================================================
// AI Status Ticker
// ============================================================================

const AI_STATUSES = [
  { text: 'Scanning EURUSD on H4...', icon: '🔍', color: '#8b5cf6' },
  { text: 'Analyzing Gold liquidity pools...', icon: '🧠', color: '#f59e0b' },
  { text: 'GBPJPY rejected — weak momentum', icon: '🚫', color: '#ef4444' },
  { text: 'USDJPY: 94% confidence — awaiting confirmation', icon: '✅', color: '#10b981' },
  { text: 'No trade on AUDUSD — news in 12 min', icon: '⏸️', color: '#64748b' },
  { text: 'Managing EURUSD — SL moved to BE', icon: '📊', color: '#6366f1' },
];

function AIStatusTicker() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % AI_STATUSES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-bg-card border border-[#1e293b] overflow-hidden">
      <div
        className="w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: AI_STATUSES[index].color }}
      />
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="text-sm font-mono text-[#94a3b8]"
        >
          {AI_STATUSES[index].icon} {AI_STATUSES[index].text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Confidence Meter
// ============================================================================

function ConfidenceMeter({ value, required }: { value: number; required: number }) {
  const passed = value >= required;
  const color = passed ? '#10b981' : '#ef4444';

  return (
    <div className="p-4 rounded-xl bg-bg-card border border-[#1e293b]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-[#64748b]">
          AI Confidence
        </span>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-full"
          style={{
            color,
            backgroundColor: passed
              ? 'rgba(16, 185, 129, 0.1)'
              : 'rgba(239, 68, 68, 0.1)',
          }}
        >
          {passed ? 'PASS' : 'REJECT'}
        </span>
      </div>
      <div className="flex items-end gap-2 mb-2">
        <span className="text-3xl font-bold font-mono" style={{ color }}>
          {value}%
        </span>
        <span className="text-sm text-[#64748b] mb-1">/ {required}% required</span>
      </div>
      <div className="w-full h-2 bg-bg-secondary rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Feature Card
// ============================================================================

function FeatureCard({
  icon: Icon,
  title,
  description,
  delay = 0,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <motion.div
      variants={fadeInUp}
      className="group relative p-6 rounded-xl bg-bg-card border border-[#1e293b] hover:border-brand-500/30 transition-all duration-300 hover:shadow-glow-sm"
    >
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-brand-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative">
        <div className="w-12 h-12 rounded-lg bg-brand-600/10 flex items-center justify-center mb-4 group-hover:bg-brand-600/20 transition-colors">
          <Icon className="w-6 h-6 text-brand-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-[#94a3b8] leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Pricing Card
// ============================================================================

function PricingCard({
  name,
  price,
  description,
  features,
  isPopular,
  cta,
}: {
  name: string;
  price: number;
  description: string;
  features: { name: string; included: boolean }[];
  isPopular: boolean;
  cta: string;
}) {
  return (
    <motion.div
      variants={scaleIn}
      className={`relative p-8 rounded-2xl border transition-all duration-300 ${
        isPopular
          ? 'bg-gradient-to-b from-brand-600/10 to-bg-card border-brand-500/30 shadow-glow'
          : 'bg-bg-card border-[#1e293b] hover:border-[#334155]'
      }`}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 text-white text-xs font-semibold uppercase tracking-wider">
            Most Popular
          </span>
        </div>
      )}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-white mb-1">{name}</h3>
        <p className="text-sm text-[#94a3b8]">{description}</p>
      </div>
      <div className="flex items-baseline gap-1 mb-6">
        <span className="text-4xl font-bold text-white">${price}</span>
        {price > 0 && <span className="text-[#64748b]">/month</span>}
        {price === 0 && <span className="text-[#64748b]">forever</span>}
      </div>
      <Link
        href="/register"
        className={`block w-full text-center py-3 rounded-lg font-medium transition-all duration-200 mb-6 ${
          isPopular
            ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white hover:shadow-glow hover:-translate-y-0.5'
            : 'bg-bg-elevated text-white border border-[#1e293b] hover:border-[#334155] hover:bg-bg-hover'
        }`}
      >
        {cta}
      </Link>
      <ul className="space-y-3">
        {features.map((feature) => (
          <li key={feature.name} className="flex items-center gap-3">
            {feature.included ? (
              <Check className="w-4 h-4 text-brand-400 shrink-0" />
            ) : (
              <X className="w-4 h-4 text-[#475569] shrink-0" />
            )}
            <span
              className={`text-sm ${
                feature.included ? 'text-[#94a3b8]' : 'text-[#475569]'
              }`}
            >
              {feature.name}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

// ============================================================================
// Navigation
// ============================================================================

function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-bg-primary/80 backdrop-blur-xl border-b border-[#1e293b]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">
              Trade<span className="text-brand-400">-Z</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
              Features
            </a>
            <a href="#ai" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
              AI Engine
            </a>
            <a href="#pricing" className="text-sm text-[#94a3b8] hover:text-white transition-colors">
              Pricing
            </a>
          </div>

          {/* Auth buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm text-[#94a3b8] hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="btn btn-primary text-sm"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-[#94a3b8] hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <XIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-bg-primary/95 backdrop-blur-xl border-b border-[#1e293b]"
          >
            <div className="px-4 py-4 space-y-3">
              <a href="#features" className="block text-sm text-[#94a3b8] hover:text-white py-2">
                Features
              </a>
              <a href="#ai" className="block text-sm text-[#94a3b8] hover:text-white py-2">
                AI Engine
              </a>
              <a href="#pricing" className="block text-sm text-[#94a3b8] hover:text-white py-2">
                Pricing
              </a>
              <hr className="border-[#1e293b]" />
              <Link href="/login" className="block text-sm text-[#94a3b8] hover:text-white py-2">
                Sign In
              </Link>
              <Link href="/register" className="btn btn-primary w-full text-sm">
                Get Started
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

// ============================================================================
// Landing Page
// ============================================================================

export default function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      <Navbar />

      {/* ================================================================
          HERO SECTION
          ================================================================ */}
      <section className="relative min-h-screen flex items-center justify-center pt-16">
        {/* Animated gradient background */}
        <div className="absolute inset-0 animated-bg" />

        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-gradient-radial from-brand-600/10 via-transparent to-transparent" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Floating orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/10 rounded-full blur-[100px] animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-brand-400/10 rounded-full blur-[80px] animate-float" style={{ animationDelay: '3s' }} />

        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center">
          {/* AI Status Ticker */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex justify-center mb-8"
          >
            <AIStatusTicker />
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-4xl sm:text-5xl md:text-7xl font-bold leading-tight mb-6"
          >
            <span className="text-white">Your AI</span>{' '}
            <span className="text-gradient">Trading</span>
            <br />
            <span className="text-white">Operating System</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-lg sm:text-xl text-[#94a3b8] max-w-2xl mx-auto mb-8 leading-relaxed"
          >
            Trade-Z continuously scans markets, evaluates opportunities with institutional
            discipline, explains every decision, and only trades when{' '}
            <span className="text-brand-400 font-medium">every condition is met</span>.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
          >
            <Link
              href="/register"
              className="btn btn-primary px-8 py-3.5 text-base group"
            >
              Start Trading Smarter
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#features"
              className="btn btn-secondary px-8 py-3.5 text-base"
            >
              See How It Works
            </a>
          </motion.div>

          {/* Confidence Meter Demo */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.8 }}
            className="max-w-sm mx-auto"
          >
            <ConfidenceMeter value={82} required={95} />
            <p className="text-xs text-[#64748b] mt-2 font-mono">
              Decision: NO TRADE — Weak momentum, upcoming USD news
            </p>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          FEATURES SECTION
          ================================================================ */}
      <section id="features" className="py-24 px-4 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
            className="text-center mb-16"
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-600/10 border border-brand-600/20 mb-6">
              <Sparkles className="w-4 h-4 text-brand-400" />
              <span className="text-sm text-brand-300 font-medium">Institutional-Grade Intelligence</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Not a signal website.{' '}
              <span className="text-gradient">An operating system.</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-lg text-[#94a3b8] max-w-2xl mx-auto">
              Trade-Z doesn't just tell you what to trade. It thinks, analyzes, decides,
              manages, and explains — like a disciplined institutional trader.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <FeatureCard
              icon={Brain}
              title="AI Decision Engine"
              description="25+ weighted factors analyzed across multiple timeframes. Every trade must pass a confidence threshold before execution."
            />
            <FeatureCard
              icon={Shield}
              title="Risk Management"
              description="Automated position sizing, daily loss limits, drawdown protection, and risk-per-trade controls built into every decision."
            />
            <FeatureCard
              icon={Eye}
              title="Market Structure Analysis"
              description="Break of Structure, Change of Character, Order Blocks, Fair Value Gaps — analyzed in real-time across all timeframes."
            />
            <FeatureCard
              icon={Target}
              title="Multi-Timeframe Confluence"
              description="Monthly to 5-minute analysis. Higher timeframes set direction, lower timeframes find entries. Disagreement = no trade."
            />
            <FeatureCard
              icon={Activity}
              title="Live Trade Management"
              description="Auto break-even, trailing stops, partial profits, news protection, and drawdown management on every open position."
            />
            <FeatureCard
              icon={Lock}
              title="No Trade = Best Trade"
              description="The AI confidently rejects poor setups. Low liquidity, upcoming news, excessive spread — the AI says no and explains why."
            />
            <FeatureCard
              icon={Bot}
              title="AI Chat Assistant"
              description="Ask 'Analyze Gold' or 'Why was my trade rejected?' and get clear, contextual explanations about any market or decision."
            />
            <FeatureCard
              icon={LineChart}
              title="TradingView Charts"
              description="Professional-grade interactive charts with real-time data, technical indicators, and AI markup directly in the platform."
            />
            <FeatureCard
              icon={Globe}
              title="Multiple Asset Classes"
              description="Forex, crypto, commodities, indices — all analyzed by the same disciplined AI engine across the same confidence framework."
            />
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          AI PHILOSOPHY SECTION
          ================================================================ */}
      <section id="ai" className="py-24 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-900/5 to-transparent" />
        <div className="max-w-7xl mx-auto relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
            className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
          >
            {/* Left side — Text */}
            <div>
              <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-600/10 border border-brand-600/20 mb-6">
                <Brain className="w-4 h-4 text-brand-400" />
                <span className="text-sm text-brand-300 font-medium">AI Philosophy</span>
              </motion.div>
              <motion.h2 variants={fadeInUp} className="text-3xl sm:text-4xl font-bold text-white mb-6">
                The AI thinks before it acts.{' '}
                <span className="text-gradient">Every single time.</span>
              </motion.h2>
              <motion.div variants={fadeInUp} className="space-y-4">
                {[
                  { condition: 'Confidence too low', action: 'Reject' },
                  { condition: 'Liquidity is poor', action: 'Reject' },
                  { condition: 'Risk is too high', action: 'Reject' },
                  { condition: 'News approaching', action: 'Reject' },
                  { condition: 'Spread is excessive', action: 'Reject' },
                  { condition: 'Timeframes disagree', action: 'Reject' },
                  { condition: 'Daily loss limit hit', action: 'Reject' },
                ].map(({ condition, action }) => (
                  <div
                    key={condition}
                    className="flex items-center gap-3 p-3 rounded-lg bg-bg-card border border-[#1e293b] group hover:border-loss/30 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-loss/10 flex items-center justify-center shrink-0">
                      <X className="w-4 h-4 text-loss" />
                    </div>
                    <span className="text-sm text-[#94a3b8] flex-1">{condition}</span>
                    <span className="text-xs font-mono text-loss uppercase tracking-wider">
                      {action}
                    </span>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right side — Demo card */}
            <motion.div variants={scaleIn} className="space-y-4">
              <div className="p-6 rounded-2xl bg-bg-card border border-[#1e293b]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-brand-600/20 flex items-center justify-center">
                    <Brain className="w-5 h-5 text-brand-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">AI Analysis — EURUSD</h4>
                    <p className="text-xs text-[#64748b]">4H Timeframe • Just now</p>
                  </div>
                </div>

                {/* Analysis Bars */}
                <div className="space-y-3 mb-6">
                  {[
                    { label: 'Market Structure', value: 88, color: '#10b981' },
                    { label: 'Trend Alignment', value: 92, color: '#10b981' },
                    { label: 'Momentum', value: 45, color: '#ef4444' },
                    { label: 'Liquidity', value: 72, color: '#f59e0b' },
                    { label: 'Volume', value: 68, color: '#f59e0b' },
                    { label: 'News Impact', value: 30, color: '#ef4444' },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#94a3b8]">{label}</span>
                        <span className="text-xs font-mono" style={{ color }}>
                          {value}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: color }}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${value}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1, delay: 0.2 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Decision */}
                <div className="p-4 rounded-xl bg-loss/5 border border-loss/20">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-loss/20 flex items-center justify-center">
                      <X className="w-3 h-3 text-loss" />
                    </div>
                    <span className="text-sm font-bold text-loss uppercase tracking-wider">
                      No Trade
                    </span>
                  </div>
                  <p className="text-xs text-[#94a3b8] leading-relaxed">
                    Momentum is weak at 45% (required: 60%). USD CPI release in 47 minutes.
                    Liquidity below threshold for current session. Recommend waiting for
                    London session open or post-news price action.
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          TRADING MODES SECTION
          ================================================================ */}
      <section className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
            className="text-center mb-16"
          >
            <motion.h2 variants={fadeInUp} className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Three ways to trade.{' '}
              <span className="text-gradient">Your rules.</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-lg text-[#94a3b8] max-w-2xl mx-auto">
              Whether you want full control, AI assistance, or complete automation.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {[
              {
                title: 'Manual Mode',
                icon: BarChart3,
                description: 'AI generates signals with full analysis. You review and place trades yourself.',
                features: ['Full analysis & reasoning', 'Entry, SL, TP provided', 'Confidence scoring', 'You execute trades'],
                color: '#94a3b8',
              },
              {
                title: 'Semi-Automatic',
                icon: TrendingUp,
                description: 'AI notifies you of opportunities. Approve with one tap and the AI executes.',
                features: ['Push notifications', 'One-tap approval', 'AI handles execution', 'Review before action'],
                color: '#8b5cf6',
              },
              {
                title: 'Fully Automatic',
                icon: Zap,
                description: 'AI opens, manages, and closes trades based on your rules — 24/5 operation.',
                features: ['Autonomous execution', 'Auto risk management', 'Trailing & partial TP', 'Daily loss protection'],
                color: '#10b981',
              },
            ].map(({ title, icon: Icon, description, features, color }) => (
              <motion.div
                key={title}
                variants={fadeInUp}
                className="p-6 rounded-2xl bg-bg-card border border-[#1e293b] hover:border-[#334155] transition-all duration-300"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${color}15` }}
                >
                  <Icon className="w-6 h-6" style={{ color }} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-sm text-[#94a3b8] mb-4 leading-relaxed">{description}</p>
                <ul className="space-y-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-[#94a3b8]">
                      <Check className="w-4 h-4 text-brand-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          PRICING SECTION
          ================================================================ */}
      <section id="pricing" className="py-24 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-900/5 to-transparent" />
        <div className="max-w-7xl mx-auto relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-16"
          >
            <motion.h2 variants={fadeInUp} className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Simple, transparent pricing
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-lg text-[#94a3b8] max-w-2xl mx-auto">
              Start for free. Upgrade when you're ready for more power.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto"
          >
            <PricingCard
              name="Free"
              price={0}
              description="Get started with basic AI signals"
              cta="Start Free"
              isPopular={false}
              features={[
                { name: 'AI Market Analysis', included: true },
                { name: 'Up to 5 signals/day', included: true },
                { name: 'Manual mode only', included: true },
                { name: '1 paper trading account', included: true },
                { name: 'Trade journal', included: true },
                { name: 'AI Chat', included: false },
                { name: 'Automation', included: false },
                { name: 'Live broker connections', included: false },
              ]}
            />
            <PricingCard
              name="Pro"
              price={49}
              description="Full AI power for serious traders"
              cta="Get Pro"
              isPopular={true}
              features={[
                { name: 'Unlimited signals', included: true },
                { name: 'All trading modes', included: true },
                { name: '5 broker connections', included: true },
                { name: 'AI Chat (500 msgs/mo)', included: true },
                { name: 'Advanced analytics', included: true },
                { name: 'Semi & auto modes', included: true },
                { name: 'News protection', included: true },
                { name: 'Priority support', included: false },
              ]}
            />
            <PricingCard
              name="Enterprise"
              price={199}
              description="Maximum power for professionals"
              cta="Contact Sales"
              isPopular={false}
              features={[
                { name: 'Everything in Pro', included: true },
                { name: 'Unlimited AI Chat', included: true },
                { name: 'Unlimited brokers', included: true },
                { name: 'API access', included: true },
                { name: 'Custom AI strategies', included: true },
                { name: 'White-label options', included: true },
                { name: 'Dedicated manager', included: true },
                { name: 'Priority support', included: true },
              ]}
            />
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          CTA SECTION
          ================================================================ */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="relative p-12 rounded-3xl bg-gradient-to-br from-brand-600/20 to-bg-card border border-brand-500/20 text-center overflow-hidden"
          >
            {/* Glow effects */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-600/20 rounded-full blur-[80px]" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-brand-400/15 rounded-full blur-[60px]" />

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Ready to trade with{' '}
                <span className="text-gradient">institutional discipline?</span>
              </h2>
              <p className="text-lg text-[#94a3b8] mb-8 max-w-xl mx-auto">
                Join traders who trust AI that knows when <em>not</em> to trade.
              </p>
              <Link
                href="/register"
                className="btn btn-primary px-10 py-4 text-base group inline-flex"
              >
                Get Started — It's Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          FOOTER
          ================================================================ */}
      <footer className="border-t border-[#1e293b] py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div>
              <Link href="/" className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white">
                  Trade<span className="text-brand-400">-Z</span>
                </span>
              </Link>
              <p className="text-sm text-[#64748b] leading-relaxed">
                AI Trading Operating System. Trade with institutional discipline.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2">
                {['Features', 'AI Engine', 'Pricing', 'Changelog', 'Documentation'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-[#64748b] hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2">
                {['About', 'Blog', 'Careers', 'Contact', 'Partners'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-[#64748b] hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2">
                {['Terms of Service', 'Privacy Policy', 'Risk Disclaimer', 'Cookie Policy'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-[#64748b] hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-[#1e293b] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-[#475569]">
              © {new Date().getFullYear()} Trade-Z. All rights reserved.
            </p>
            <p className="text-xs text-[#475569]">
              Trading involves risk. Past performance does not guarantee future results.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
