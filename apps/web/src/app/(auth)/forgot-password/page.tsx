'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@trade-z/validation';
import { Mail, Loader2, ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    setIsLoading(true);
    // TODO: Implement password reset
    console.log('Forgot password:', data);
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 2000);
  };

  if (isSubmitted) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-profit/10 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-profit" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
        <p className="text-[#94a3b8] mb-6">
          We've sent a password reset link to your email address. Please check your inbox.
        </p>
        <Link href="/login" className="btn btn-secondary inline-flex">
          <ArrowLeft className="w-4 h-4" />
          Back to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Reset your password</h2>
        <p className="text-[#94a3b8]">
          Enter your email and we'll send you a reset link
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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

        <button type="submit" disabled={isLoading} className="btn btn-primary w-full py-3">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Send Reset Link
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[#64748b]">
        <Link href="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" />
          Back to Sign In
        </Link>
      </p>
    </div>
  );
}
