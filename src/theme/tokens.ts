export const lightColors = {
  // Canvas & Surfaces (Warm Cream Foundation)
  canvas: '#FBF9F5',          // Warm botanical cream canvas (airy, paper-like)
  canvasSubtle: '#F3EFEA',    // Secondary warm sand/cream background
  white: '#FFFCF6',           // Crisp pure tonal card surface
  surfaceElevated: '#FFFFFF', // Elevated card surface

  // Typography & Inks
  ink: '#1A2E26',             // Deep botanical slate/pine (high contrast, WCAG AAA)
  inkRaised: '#284238',       // Slightly softer deep pine
  inkLine: '#52665E',         // Medium pine for secondary iconography
  inkMuted: '#CBD8D2',        // Light pine wash
  muted: '#5E7067',           // Eucalyptus slate for timestamps, subtitles (WCAG AA 4.5:1+)

  // Primary Eucalyptus Green Accents
  success: '#3A6B54',         // Vibrant eucalyptus leaf
  successDark: '#2D5A46',     // Deep eucalyptus forest (companion card, primary CTAs)
  successTint: '#EAF2EC',     // Soft eucalyptus sage wash (pill badges, active states)
  successBorder: '#C2DEC9',   // Crisp eucalyptus outline

  // Warm Terracotta Accents
  primary: '#BC4F27',         // Warm botanical terracotta (WCAG AA compliant contrast on white & canvas >= 4.5:1)
  primaryDark: '#933A18',     // Deep terracotta for high contrast text & pressed states
  primaryTint: '#F9EDE6',     // Soft terracotta wash
  primaryBorder: '#F0D1C2',   // Terracotta border

  // Warm Ochre / Sun Highlights
  sun: '#DCA238',             // Warm honey ochre
  sunTint: '#FEF6E4',         // Soft honey tint

  // Neutral Lines & Borders
  line: '#EAE4DC',            // Crisp subtle divider line on warm cream
  controlBorder: '#C6C0B4',   // Form controls & button outlines
  mist: '#F3EFEA',            // Pill button & squircle tile background

  // System States
  warning: '#9E6700',         // Accessible warm amber warning
  warningTint: '#FEF6E4',
  error: '#BA3B34',           // Botanical crimson error
  errorTint: '#FDECEB',
  overlay: 'rgba(18, 30, 25, 0.56)', // Deep botanical backdrop scrim
} as const;

export const darkColors: AppColors = {
  // Canvas & Surfaces (Deep Botanical Night)
  canvas: '#121B18',          // Deep forest midnight
  canvasSubtle: '#182420',    // Subtle dark forest container
  white: '#1E2C28',           // Elevated botanical dark surface
  surfaceElevated: '#24342F', // Higher elevation card

  // Typography & Inks
  ink: '#F4EFEA',             // Warm cream text (high contrast)
  inkRaised: '#E3DCD3',       // Soft cream
  inkLine: '#7B8F86',
  inkMuted: '#3D524A',
  muted: '#9CAD9F',           // Muted sage text

  // Primary Eucalyptus Green Accents
  success: '#68A889',         // Glowing eucalyptus
  successDark: '#8DC2A7',     // Light eucalyptus for dark mode text/icons
  successTint: '#1D332A',     // Deep eucalyptus background
  successBorder: '#2B4A3D',

  // Warm Terracotta Accents
  primary: '#E07D5A',         // Glowing terracotta
  primaryDark: '#F3A98E',     // Light terracotta for contrast
  primaryTint: '#382119',     // Deep terracotta background
  primaryBorder: '#542E22',

  // Warm Ochre / Sun
  sun: '#E7B554',
  sunTint: '#382B14',

  // Neutral Lines & Borders
  line: '#283832',            // Crisp dark border
  controlBorder: '#43564F',
  mist: '#1B2824',

  // System States
  warning: '#F3C562',
  warningTint: '#3B2D12',
  error: '#F87C74',
  errorTint: '#3D1C1B',
  overlay: 'rgba(5, 10, 8, 0.78)',
};

export type AppColors = { [Key in keyof typeof lightColors]: string };
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  squircle: 18,
  lg: 20,
  xl: 28,
  full: 9999,
} as const;

export const typography = {
  hero: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800' as const,
    letterSpacing: -0.6,
  },
  title1: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800' as const,
    letterSpacing: -0.4,
  },
  title2: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  headline: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700' as const,
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500' as const,
  },
  bodyEmphasis: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700' as const,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  badge: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800' as const,
    letterSpacing: 0.4,
  },
} as const;
