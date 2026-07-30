'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative animated-bg">
        {/* Decorative elements */}
        <div className="absolute inset-0 bg-gradient-radial from-brand-600/15 via-transparent to-transparent" />
        <div className="absolute top-1/3 left-1/4 w-72 h-72 bg-brand-600/15 rounded-full blur-[80px] animate-float" />
        <div className="absolute bottom-1/3 right-1/4 w-56 h-56 bg-brand-400/10 rounded-full blur-[60px] animate-float" style={{ animationDelay: '2s' }} />

        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }}
        />

        <div className="relative z-10 flex flex-col justify-center px-16 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Link href="/" className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-white">
                Trade<span className="text-brand-400">-Z</span>
              </span>
            </Link>

            <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
              Trade with{' '}
              <span className="text-gradient">institutional discipline</span>
            </h1>
            <p className="text-lg text-[#94a3b8] leading-relaxed mb-8">
              AI-powered market analysis, risk management, and trade execution.
              The AI that knows when not to trade.
            </p>

            {/* Trust indicators */}
            <div className="space-y-3">
              {[
                '25+ analysis factors per trade',
                'Automatic risk management',
                'No trade is always an option',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-brand-600/20 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-brand-400" />
                  </div>
                  <span className="text-sm text-[#94a3b8]">{item}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-bg-primary">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">
                Trade<span className="text-brand-400">-Z</span>
              </span>
            </Link>
          </div>

          {children}
        </motion.div>
      </div>
    </div>
  );
}
