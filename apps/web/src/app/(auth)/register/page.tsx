'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@trade-z/validation';
import { Eye, EyeOff, Mail, Lock, User, Loader2, ArrowRight, Check } from 'lucide-react';

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });

  const password = watch('password');
  const hasLower = /[a-z]/.test(password || '');
  const hasUpper = /[A-Z]/.test(password || '');
  const hasNumber = /\d/.test(password || '');
  const hasLength = (password || '').length >= 8;

  const onSubmit = async (data: RegisterInput) => {
    setIsLoading(true);
    // TODO: Implement Supabase auth
    console.log('Register:', data);
    setTimeout(() => setIsLoading(false), 2000);
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Create your account</h2>
        <p className="text-[#94a3b8]">Start trading with AI discipline</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Full Name */}
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-[#94a3b8] mb-1.5">
            Full name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#475569]" />
            <input
              id="fullName"
              type="text"
              {...register('fullName')}
              className="input pl-10"
              placeholder="John Doe"
              autoComplete="name"
            />
          </div>
          {errors.fullName && (
            <p className="text-xs text-loss mt-1">{errors.fullName.message}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[#94a3b8] mb-1.5">
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#475569]" />
            <input
              id="email"
              type="email"
              {...register('email')}
              className="input pl-10"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          {errors.email && (
            <p className="text-xs text-loss mt-1">{errors.email.message}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[#94a3b8] mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#475569]" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              className="input pl-10 pr-10"
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#94a3b8] transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {/* Password strength */}
          {password && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {[
                { label: '8+ characters', met: hasLength },
                { label: 'Lowercase', met: hasLower },
                { label: 'Uppercase', met: hasUpper },
                { label: 'Number', met: hasNumber },
              ].map(({ label, met }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${met ? 'bg-profit/20' : 'bg-bg-secondary'}`}>
                    {met && <Check className="w-2.5 h-2.5 text-profit" />}
                  </div>
                  <span className={`text-xs ${met ? 'text-profit' : 'text-[#475569]'}`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}
          {errors.password && (
            <p className="text-xs text-loss mt-1">{errors.password.message}</p>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#94a3b8] mb-1.5">
            Confirm password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#475569]" />
            <input
              id="confirmPassword"
              type="password"
              {...register('confirmPassword')}
              className="input pl-10"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-loss mt-1">{errors.confirmPassword.message}</p>
          )}
        </div>

        {/* Terms */}
        <p className="text-xs text-[#475569]">
          By creating an account, you agree to our{' '}
          <a href="#" className="text-brand-400 hover:text-brand-300">Terms of Service</a>
          {' '}and{' '}
          <a href="#" className="text-brand-400 hover:text-brand-300">Privacy Policy</a>.
        </p>

        {/* Submit */}
        <button type="submit" disabled={isLoading} className="btn btn-primary w-full py-3">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Create Account
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Sign in link */}
      <p className="mt-6 text-center text-sm text-[#64748b]">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}
