// ============================================================================
// Theme Configuration — Dark Luxury
// ============================================================================

export const theme = {
  colors: {
    // Backgrounds
    bg: {
      primary: '#0a0a0f',
      secondary: '#12121a',
      tertiary: '#1a1a2e',
      card: '#16161f',
      elevated: '#1e1e2d',
      hover: '#252536',
      overlay: 'rgba(0, 0, 0, 0.6)',
    },
    // Brand — Royal Purple
    brand: {
      50: '#f3f0ff',
      100: '#e9e0ff',
      200: '#d4c4ff',
      300: '#b89aff',
      400: '#a78bfa',
      500: '#8b5cf6',
      600: '#7c3aed',
      700: '#6d28d9',
      800: '#5b21b6',
      900: '#4c1d95',
    },
    // Profit — Green
    profit: {
      light: '#34d399',
      DEFAULT: '#10b981',
      dark: '#059669',
      bg: 'rgba(16, 185, 129, 0.1)',
      border: 'rgba(16, 185, 129, 0.2)',
    },
    // Loss — Red
    loss: {
      light: '#f87171',
      DEFAULT: '#ef4444',
      dark: '#dc2626',
      bg: 'rgba(239, 68, 68, 0.1)',
      border: 'rgba(239, 68, 68, 0.2)',
    },
    // Warning — Amber
    warning: {
      light: '#fbbf24',
      DEFAULT: '#f59e0b',
      dark: '#d97706',
    },
    // Text
    text: {
      primary: '#f8fafc',
      secondary: '#94a3b8',
      tertiary: '#64748b',
      muted: '#475569',
    },
    // Border
    border: {
      DEFAULT: '#1e293b',
      light: '#334155',
      brand: 'rgba(139, 92, 246, 0.3)',
    },
  },
  // Typography
  fonts: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  // Spacing
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '20px',
    full: '9999px',
  },
  // Shadows
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.6)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.7)',
    glow: '0 0 20px rgba(139, 92, 246, 0.3)',
    'glow-sm': '0 0 10px rgba(139, 92, 246, 0.2)',
  },
  // Glass effect
  glass: {
    bg: 'rgba(22, 22, 31, 0.7)',
    border: 'rgba(255, 255, 255, 0.06)',
    blur: 'blur(20px)',
  },
} as const;

export type Theme = typeof theme;
