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
  ArrowRight,
  Check,
  X,
  Sparkles,
  Bot,
  LineChart,
  Globe,
  Menu,
  XIcon,
  HelpCircle,
  TrendingDown
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
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } },
};

// ============================================================================
// AI Status Ticker
// ============================================================================

const AI_STATUSES = [
  { text: 'Scanning EURUSD charts...', icon: '🔍', color: '#0055ff' },
  { text: 'Checking Gold support levels...', icon: '📈', color: '#f59e0b' },
  { text: 'GBPJPY setup skipped — weak volume', icon: '⏸️', color: '#ef4444' },
  { text: 'USDJPY target matched — executing trade', icon: '✅', color: '#10b981' },
  { text: 'Waiting on AUDUSD — economic news in 12 min', icon: '⏱️', color: '#64748b' },
  { text: 'EURUSD updated — shifted stop loss to entry', icon: '🛡️', color: '#2563eb' },
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
          className="text-xs font-mono text-[#94a3b8]"
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
  return (
    <div className="p-4 rounded-xl bg-bg-card border border-[#1e293b] text-left">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] text-[#64748b] uppercase tracking-wider font-mono font-semibold">
          AI Setup Match
        </span>
        <span className="text-xs font-mono font-semibold text-white">
          {value}% / {required}% required
        </span>
      </div>
      <div className="w-full h-2 bg-bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 rounded-full transition-all duration-500"
          style={{ width: `${value}%` }}
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
}: {
  icon: React.ElementType;
  title: string;
  description: string;
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
        <h3 className="text-base font-bold text-white mb-2">{title}</h3>
        <p className="text-xs text-[#94a3b8] leading-relaxed">{description}</p>
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
      className={`relative p-8 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${
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
      <div>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-white mb-1">{name}</h3>
          <p className="text-xs text-[#94a3b8]">{description}</p>
        </div>
        <div className="flex items-baseline gap-1 mb-6">
          <span className="text-4xl font-bold text-white font-mono">${price}</span>
          {price > 0 && <span className="text-xs text-[#64748b] font-mono">/month</span>}
          {price === 0 && <span className="text-xs text-[#64748b] font-mono">forever</span>}
        </div>
        <ul className="space-y-3 mb-8">
          {features.map((feature) => (
            <li key={feature.name} className="flex items-center gap-3">
              {feature.included ? (
                <Check className="w-4 h-4 text-brand-400 shrink-0" />
              ) : (
                <X className="w-4 h-4 text-[#475569] shrink-0" />
              )}
              <span
                className={`text-xs ${
                  feature.included ? 'text-[#94a3b8]' : 'text-[#475569]'
                }`}
              >
                {feature.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Link
        href="/register"
        className={`block w-full text-center py-2.5 rounded-lg text-xs font-bold transition-all duration-200 ${
          isPopular
            ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white hover:shadow-glow hover:-translate-y-0.5'
            : 'bg-bg-elevated text-white border border-[#1e293b] hover:border-[#334155] hover:bg-bg-hover'
        }`}
      >
        {cta}
      </Link>
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-brand-450 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              Trade<span className="text-brand-400">Z</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-xs text-[#94a3b8] hover:text-white transition-colors">
              Features
            </a>
            <a href="#rules" className="text-xs text-[#94a3b8] hover:text-white transition-colors">
              Trading Rules
            </a>
            <a href="#pricing" className="text-xs text-[#94a3b8] hover:text-white transition-colors">
              Plans
            </a>
          </div>

          {/* Auth buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-xs text-[#94a3b8] hover:text-white transition-colors font-medium"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="btn btn-primary text-xs py-2 px-4"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-[#94a3b8] hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <XIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
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
              <a href="#features" className="block text-xs text-[#94a3b8] hover:text-white py-2">
                Features
              </a>
              <a href="#rules" className="block text-xs text-[#94a3b8] hover:text-white py-2">
                Trading Rules
              </a>
              <a href="#pricing" className="block text-xs text-[#94a3b8] hover:text-white py-2">
                Plans
              </a>
              <hr className="border-[#1e293b]" />
              <Link href="/login" className="block text-xs text-[#94a3b8] hover:text-white py-2">
                Sign In
              </Link>
              <Link href="/register" className="btn btn-primary w-full text-xs py-2 text-center">
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
      <section className="relative min-h-screen flex items-center justify-center pt-20">
        <div className="absolute inset-0 animated-bg" />
        <div className="absolute inset-0 bg-gradient-radial from-brand-600/10 via-transparent to-transparent" />
        
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center space-y-8">
          {/* AI Status Ticker */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex justify-center"
          >
            <AIStatusTicker />
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.7 }}
            className="text-4xl sm:text-5xl md:text-7xl font-bold leading-tight tracking-tight"
          >
            <span className="text-white">Trade Forex with</span>{' '}
            <br className="hidden sm:block" />
            <span className="text-gradient">AI discipline.</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-base sm:text-lg text-[#94a3b8] max-w-2xl mx-auto leading-relaxed"
          >
            No emotions. No manual mistakes. Trade-Z is your automated co-pilot. 
            It scans markets, tracks risk, and triggers trades only when conditions are 100% right.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="flex flex-col sm:flex-row gap-3 justify-center items-center"
          >
            <Link
              href="/register"
              className="btn btn-primary px-8 py-3.5 text-xs font-bold group w-full sm:w-auto text-center"
            >
              Start Trading Smarter
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform inline ml-1" />
            </Link>
            <a
              href="#features"
              className="btn btn-secondary px-8 py-3.5 text-xs font-bold w-full sm:w-auto text-center"
            >
              See How It Works
            </a>
          </motion.div>

          {/* Confidence Meter Demo */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.7 }}
            className="max-w-sm mx-auto"
          >
            <ConfidenceMeter value={76} required={85} />
            <p className="text-[10px] text-red-400 mt-2 font-mono uppercase tracking-wider">
              AI Decision: PASS (Market volume low, high impact news approaching)
            </p>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          FEATURES SECTION
          ================================================================ */}
      <section id="features" className="py-24 px-4 relative border-t border-[#12121a]">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
            className="text-center mb-16 space-y-4"
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-600/10 border border-brand-600/20">
              <Sparkles className="w-3.5 h-3.5 text-brand-400" />
              <span className="text-xs text-brand-300 font-medium font-mono uppercase">Designed to Protect Capital</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-2xl sm:text-4xl font-bold text-white">
              Not a signal website.{' '}
              <span className="text-gradient">A risk-first system.</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-sm text-[#94a3b8] max-w-2xl mx-auto leading-relaxed">
              Most traders lose because of bad emotions and lack of discipline. Trade-Z solves this. 
              The system calculates correct sizes, moves stops, and checks news blocks automatically.
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
              title="Smart Scanner"
              description="Scans 40+ currency pairs across multiple timeframes. No setup goes unchecked, and false breakouts are filtered."
            />
            <FeatureCard
              icon={Shield}
              title="Capital Shield"
              description="Automatic lot-size calculation, strict daily loss caps, and drawdown protect systems built directly into the core."
            />
            <FeatureCard
              icon={Eye}
              title="Technical Checks"
              description="Reads market structures, identifies high-probability order blocks, and tracks fair value gaps in real-time."
            />
            <FeatureCard
              icon={Target}
              title="Confluence Matching"
              description="Ensures higher timeframe trends align with short-term entries. If timeframes disagree, the system passes on the trade."
            />
            <FeatureCard
              icon={Activity}
              title="Dynamic Position Control"
              description="Locks in profit automatically. Automatically shifts stops to entry (break-even) and clips partial wins."
            />
            <FeatureCard
              icon={Lock}
              title="Knows When to Pass"
              description="Skipping bad setups is a skill. The AI exits or passes during low volume, high news events, or wide spreads."
            />
            <FeatureCard
              icon={Bot}
              title="AI Conversational Chat"
              description="Ask questions like 'What is my current margin?' or 'Why was Gold skipped?' in simple English and get instant answers."
            />
            <FeatureCard
              icon={LineChart}
              title="TradingView Chart Engine"
              description="Professional live charts with active markups, support lines, and target boundaries visible instantly."
            />
            <FeatureCard
              icon={Globe}
              title="Multi-Broker Integrations"
              description="Connect to your favorite brokerage accounts. Run simulation paper accounts or live execution slots."
            />
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          AI RULES PHILOSOPHY SECTION
          ================================================================ */}
      <section id="rules" className="py-24 px-4 relative bg-bg-secondary/20 border-t border-[#12121a]">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
            className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
          >
            {/* Left side — Text */}
            <div className="space-y-6">
              <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-600/10 border border-brand-600/20">
                <Brain className="w-3.5 h-3.5 text-brand-400" />
                <span className="text-xs text-brand-300 font-medium font-mono uppercase">Trade Filtering Rules</span>
              </motion.div>
              <motion.h2 variants={fadeInUp} className="text-2xl sm:text-4xl font-bold text-white">
                The AI filters trade noise.{' '}
                <span className="text-gradient">Safety first.</span>
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-xs text-[#94a3b8] leading-relaxed">
                If even a single check fails, the AI cancels execution and explains the reason. 
                This prevents unnecessary loss of capital on low-probability setups.
              </motion.p>
              <motion.div variants={fadeInUp} className="space-y-2">
                {[
                  { condition: 'Market trend direction disagrees', action: 'Pass setup' },
                  { condition: 'Liquidity is thin or session is closed', action: 'Pass setup' },
                  { condition: 'Stop loss is too wide for target ratio', action: 'Pass setup' },
                  { condition: 'High-impact economic news within 1 hour', action: 'Pass setup' },
                  { condition: 'Broker spreads are abnormally wide', action: 'Pass setup' },
                  { condition: 'Daily account loss limit is reached', action: 'Lock trading' },
                ].map(({ condition, action }) => (
                  <div
                    key={condition}
                    className="flex items-center justify-between p-3 rounded-lg bg-bg-card border border-[#1e293b] hover:border-red-500/25 transition-all text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center">
                        <X className="w-3 h-3 text-red-400" />
                      </div>
                      <span className="text-[#94a3b8]">{condition}</span>
                    </div>
                    <span className="font-mono text-[10px] text-red-400 font-bold uppercase tracking-wider">
                      {action}
                    </span>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right side — Live Demo Block */}
            <motion.div variants={scaleIn} className="space-y-4">
              <div className="p-6 rounded-2xl bg-bg-card border border-[#1e293b]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-brand-600/25 flex items-center justify-center">
                    <Brain className="w-5 h-5 text-brand-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Rule Evaluation — EURUSD</h4>
                    <p className="text-[10px] text-[#64748b] font-mono">H4 Interval • Live Check</p>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  {[
                    { label: 'Market Structure Alignment', value: 90, ok: true },
                    { label: 'Trend Direction Match', value: 85, ok: true },
                    { label: 'Momentum Alignment', value: 45, ok: false },
                    { label: 'Liquidity Availability', value: 70, ok: true },
                    { label: 'News Spread Danger', value: 20, ok: false },
                  ].map(({ label, value, ok }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1 text-xs">
                        <span className="text-[#94a3b8]">{label}</span>
                        <span className={`font-mono font-bold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
                          {ok ? 'PASS' : 'FAIL'} ({value}%)
                        </span>
                      </div>
                      <div className="w-full h-1 bg-bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
                          style={{ width: `${value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Final Decision */}
                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center">
                      <X className="w-3 h-3 text-red-400" />
                    </div>
                    <span className="text-xs font-bold text-red-400 uppercase tracking-wider font-mono">
                      AI DECISION: PASS
                    </span>
                  </div>
                  <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                    Momentum check failed (45% vs 65% required). High-impact CPI inflation index reports 
                    scheduled in 45 minutes. Execution halted to protect account safety.
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
      <section className="py-24 px-4 border-t border-[#12121a]">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
            className="text-center mb-16 space-y-3"
          >
            <h2 className="text-2xl sm:text-4xl font-bold text-white">
              Three ways to trade.{' '}
              <span className="text-gradient">Your choice.</span>
            </h2>
            <p className="text-sm text-[#94a3b8] max-w-2xl mx-auto">
              Decide how much control you want to retain or hand over to the AI co-pilot.
            </p>
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
                title: 'Co-Pilot Mode',
                icon: BarChart3,
                description: 'AI does all the hard research. You get detailed alerts and place trades manually.',
                features: ['Full research & rationale', 'Calculated SL/TP parameters', 'Confidence matches', 'You place trades'],
                color: '#94a3b8',
              },
              {
                title: 'One-Tap Mode',
                icon: TrendingUp,
                description: 'AI alerts you when a trade setup forms. Tap once to approve, and the AI handles the rest.',
                features: ['Instant push alerts', 'One-tap execution', 'Automated management', 'Review before entry'],
                color: '#0055ff',
              },
              {
                title: 'Auto-Pilot Mode',
                icon: Zap,
                description: 'The AI executes trades, manages sizes, and closes positions automatically 24/5.',
                features: ['Fully automated setup', 'Automatic stop loss moves', 'Daily loss protection caps', 'Hands-free execution'],
                color: '#10b981',
              },
            ].map(({ title, icon: Icon, description, features, color }) => (
              <motion.div
                key={title}
                variants={fadeInUp}
                className="p-6 rounded-2xl bg-bg-card border border-[#1e293b] hover:border-[#334155] transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    <Icon className="w-6 h-6" style={{ color }} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                  <p className="text-xs text-[#94a3b8] mb-6 leading-relaxed">{description}</p>
                </div>
                <ul className="space-y-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-[#94a3b8]">
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
      <section id="pricing" className="py-24 px-4 relative border-t border-[#12121a]">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-900/5 to-transparent" />
        <div className="max-w-7xl mx-auto relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-16 space-y-3"
          >
            <h2 className="text-2xl sm:text-4xl font-bold text-white">
              Simple, transparent pricing
            </h2>
            <p className="text-sm text-[#94a3b8] max-w-2xl mx-auto">
              Start for free. No credit card required. Upgrade as you scale.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto"
          >
            <PricingCard
              name="Free Plan"
              price={0}
              description="Basic AI signal setups for beginners"
              cta="Start Free"
              isPopular={false}
              features={[
                { name: 'AI Market Scan parameters', included: true },
                { name: 'Up to 5 trade alerts daily', included: true },
                { name: 'Manual trading support', included: true },
                { name: '1 simulation demo account', included: true },
                { name: 'Digital trade journal', included: true },
                { name: 'AI Chat integration', included: false },
                { name: 'Auto-pilot execution', included: false },
                { name: 'Live broker slots', included: false },
              ]}
            />
            <PricingCard
              name="Pro Plan"
              price={49}
              description="Complete co-pilot utilities for regular traders"
              cta="Get Pro"
              isPopular={true}
              features={[
                { name: 'Unlimited trade alerts', included: true },
                { name: 'All 3 execution modes', included: true },
                { name: 'Up to 5 live broker slots', included: true },
                { name: 'Interactive AI Chat helper', included: true },
                { name: 'Detailed execution logs', included: true },
                { name: 'Drawdown safety modifiers', included: true },
                { name: 'News filter protection', included: true },
                { name: 'Priority alert routing', included: false },
              ]}
            />
            <PricingCard
              name="Expert Plan"
              price={199}
              description="Full scale power for high volume operators"
              cta="Contact Sales"
              isPopular={false}
              features={[
                { name: 'Everything inside Pro Plan', included: true },
                { name: 'Unlimited AI Chat messages', included: true },
                { name: 'Unlimited live broker connections', included: true },
                { name: 'Direct strategy API access', included: true },
                { name: 'Custom AI strategy scripting', included: true },
                { name: 'White-label layout adjustments', included: true },
                { name: 'Dedicated system manager', included: true },
                { name: 'Priority developer assistance', included: true },
              ]}
            />
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          CTA SECTION
          ================================================================ */}
      <section className="py-24 px-4 border-t border-[#12121a]">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="relative p-12 rounded-3xl bg-gradient-to-br from-brand-600/20 to-bg-card border border-brand-500/20 text-center overflow-hidden"
          >
            {/* Soft backdrop glows */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full blur-[80px]" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-brand-600/10 rounded-full blur-[60px]" />

            <div className="relative space-y-6">
              <h2 className="text-2xl sm:text-4xl font-bold text-white">
                Start trading with{' '}
                <span className="text-gradient">AI discipline today.</span>
              </h2>
              <p className="text-sm text-[#94a3b8] max-w-xl mx-auto leading-relaxed">
                Connect your account and join traders who let data, risk rules, and statistics handle the execution.
              </p>
              <Link
                href="/register"
                className="btn btn-primary px-10 py-3.5 text-xs font-bold inline-flex items-center gap-2 group"
              >
                Create Free Account
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          FOOTER
          ================================================================ */}
      <footer className="border-t border-[#1e293b] py-12 px-4 bg-bg-primary">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 text-xs">
            {/* Brand */}
            <div className="space-y-4">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-brand-450 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="text-base font-bold text-white">
                  Trade<span className="text-brand-400">Z</span>
                </span>
              </Link>
              <p className="text-[#64748b] leading-relaxed">
                AI Forex trading assistant. Built for risk protection and disciplined execution.
              </p>
            </div>

            {/* Product Links */}
            <div>
              <h4 className="font-bold text-white mb-4 uppercase tracking-wider">Product</h4>
              <ul className="space-y-2 font-mono text-[11px]">
                {['Features', 'Trading Rules', 'Pricing Plans', 'Changelog'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-[#64748b] hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources Links */}
            <div>
              <h4 className="font-bold text-white mb-4 uppercase tracking-wider">Company</h4>
              <ul className="space-y-2 font-mono text-[11px]">
                {['About Us', 'Contact', 'FAQ'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-[#64748b] hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-bold text-white mb-4 uppercase tracking-wider">Legal</h4>
              <ul className="space-y-2 font-mono text-[11px]">
                {['Terms of Service', 'Privacy Policy', 'Risk Disclaimer'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-[#64748b] hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-[#1e293b] flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] text-[#475569] font-mono">
            <p>© {new Date().getFullYear()} Trade-Z. All rights reserved.</p>
            <p className="text-center sm:text-right max-w-md">
              Trading Forex and leveraged instruments involves high risk. Only trade with money you can afford to lose.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
