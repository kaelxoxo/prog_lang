// Alaga "care notebook" brand: paper, ink, and narra (Philippine hardwood) as the one signature colour.
// Green is reserved for Bantay's cap; recorded doses read as ink, Not Recorded as ochre.
export const lightColors = {
  // Paper
  canvas: '#F6F1E7',          // Notebook paper
  canvasSubtle: '#EFE8DA',    // Shaded paper (pressed rows, inset areas)
  white: '#FFFDF8',           // Text on filled buttons; brightest paper
  surface: '#FBF8F1',         // Raised paper for the few boxed items
  card: '#FBF8F1',
  surfaceElevated: '#FFFDF8', // Sheets and modals

  // Ink
  ink: '#1F1B16',             // Primary text
  inkRaised: '#3A332B',
  inkLine: '#5A5046',         // Secondary iconography
  inkMuted: '#D9D0C1',        // Disabled fills
  muted: '#675D52',           // Secondary text

  // Narra (signature)
  primary: '#8A3B22',
  primaryDark: '#6E2E1A',     // Pressed state, narra text on tints
  primaryLight: '#C0714F',
  primaryTint: '#F1E1D6',
  primaryBorder: '#E2C3B1',
  mintTint: '#F1E9DC',        // Legacy key: neutral paper wash

  secondary: '#3A332B',
  accent: '#8A3B22',

  // Warmth (streak flame, celebration)
  accentWarm: '#B5541C',
  flame: '#B5541C',
  flameLight: '#D98A3D',
  sun: '#C99A3B',
  sunTint: '#F4E8CF',

  // Rules and borders
  line: '#E3DACB',            // Ruled line
  border: '#E3DACB',
  controlBorder: '#CDBFAA',
  mist: '#EFE8DA',

  // States
  success: '#2E2924',         // Recorded: ink, not green
  successDark: '#1F1B16',
  successTint: '#ECE5D8',
  successBorder: '#D9CFBE',
  warning: '#8A5E0F',         // Not Recorded: ochre
  warningTint: '#F5E9CC',
  danger: '#A63A2A',
  dangerTint: '#F6E0DA',
  error: '#A63A2A',
  errorTint: '#F6E0DA',
  overlay: 'rgba(31, 27, 22, 0.5)',
} as const;

// "Night ink": dark paper with warm off-white ink.
export const darkColors: AppColors = {
  canvas: '#17140F',
  canvasSubtle: '#1E1A14',
  white: '#211D17',           // Surface in dark mode; text on light buttons
  surface: '#211D17',
  card: '#211D17',
  surfaceElevated: '#2A251E',

  ink: '#F3EDE2',
  inkRaised: '#E4DCCD',
  inkLine: '#B9AE9E',
  inkMuted: '#3A342B',
  muted: '#B3A898',

  primary: '#E39A78',
  primaryDark: '#F0B497',
  primaryLight: '#C0714F',
  primaryTint: '#3A2419',
  primaryBorder: '#5A3424',
  mintTint: '#26211A',

  secondary: '#E4DCCD',
  accent: '#E39A78',

  accentWarm: '#E39A5B',
  flame: '#E39A5B',
  flameLight: '#F0B77F',
  sun: '#E0BC6E',
  sunTint: '#33291A',

  line: '#332D24',
  border: '#332D24',
  controlBorder: '#4A4236',
  mist: '#26211A',

  success: '#E4DCCD',
  successDark: '#F3EDE2',
  successTint: '#2A251E',
  successBorder: '#3A342B',
  warning: '#E2B65A',
  warningTint: '#33291A',
  danger: '#EE8B78',
  dangerTint: '#3A1F19',
  error: '#EE8B78',
  errorTint: '#3A1F19',
  overlay: 'rgba(8, 7, 5, 0.72)',
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
  lg: 22,
  xl: 30,
  full: 9999,
} as const;

// Source Serif 4 (loaded in App.tsx) for titles; the platform font for everything else,
// so large system text keeps working. Never set fontWeight on a serif style: the weight is in the family.
export const fonts = {
  serif: 'SourceSerif4_600SemiBold',
  serifBold: 'SourceSerif4_700Bold',
} as const;

// A section or card has exactly one title, in this style.
export const sectionTitle = {
  fontFamily: fonts.serif,
  fontSize: 20,
  lineHeight: 26,
  letterSpacing: -0.2,
} as const;

// Motion: quiet and crisp. No bounce.
// Springs are critically damped so they settle without overshoot.
export const springs = {
  tightSpring: { tension: 300, friction: 35 },
  gentleSpring: { tension: 220, friction: 30 },
  snappySpring: { tension: 380, friction: 40 },
} as const;

export const tightSpring = springs.tightSpring;
export const gentleSpring = springs.gentleSpring;
export const snappySpring = springs.snappySpring;

export const pressScales = {
  cardPress: 0.98,
  buttonPress: 0.97,
  iconPress: 0.94,
} as const;

export const cardPress = pressScales.cardPress;
export const buttonPress = pressScales.buttonPress;
export const iconPress = pressScales.iconPress;

export const durations = {
  instant: 100,
  feedback: 140,   // Press feedback (mobile: 100–150 ms)
  stateChange: 200, // Reveals, checkmark draw
  drawer: 280,
} as const;

export const instant = durations.instant;
export const feedback = durations.feedback;
export const stateChange = durations.stateChange;
export const drawer = durations.drawer;

// Cubic-bezier control points; use with Easing.bezier(...easing.out).
// Kept as numbers so this file stays importable outside React Native.
export const easing = {
  out: [0.23, 1, 0.32, 1],       // Entering, reveals, press feedback
  inOut: [0.77, 0, 0.175, 1],    // On-screen movement
  drawer: [0.32, 0.72, 0, 1],    // Sheets
} as const;

export const motion = {
  springs,
  pressScales,
  durations,
  easing,
} as const;

export const typography = {
  hero: {
    fontFamily: fonts.serifBold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.4,
  },
  title1: {
    fontFamily: fonts.serif,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  title2: sectionTitle,
  headline: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700' as const,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  bodyEmphasis: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
    letterSpacing: 0.2,
  },
  badge: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700' as const,
  },
} as const;
