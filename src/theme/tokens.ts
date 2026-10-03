export const lightColors = {
  // Canvas & Surfaces (Airy Mint Foundation & Crisp Elevation)
  canvas: '#F4F8F5',          // Airy mint canvas
  canvasSubtle: '#EAF2ED',    // Subtle secondary mint canvas
  white: '#FFFFFF',           // Crisp white elevation
  surface: '#FFFFFF',         // Card / surface
  card: '#FFFFFF',            // Card elevation
  surfaceElevated: '#FFFFFF', // Elevated card surface

  // Typography & Inks (WCAG AA / AAA High Contrast >= 4.5:1)
  ink: '#122620',             // Deep forest ink (contrast >= 4.5:1 WCAG AA)
  inkRaised: '#1B4D3E',       // Slightly softer deep forest evergreen
  inkLine: '#3D5A4F',         // Medium pine for secondary iconography
  inkMuted: '#CBD8D2',        // Light pine wash
  muted: '#5C7168',           // Muted forest slate (WCAG AA 4.5:1+)

  // Primary Deep Forest Evergreen
  primary: '#1B4D3E',         // Deep Forest Evergreen
  primaryDark: '#12352B',     // Deepest forest for pressed states & high contrast
  primaryLight: '#52B788',    // Mint accent
  primaryTint: '#D8F3DC',     // Mint tint wash
  primaryBorder: '#B7E4C7',   // Mint border
  mintTint: '#E8F5E9',        // Soft mint wash

  // Secondary & Accent Emerald
  secondary: '#2D6A4F',       // Emerald secondary / accent
  accent: '#2D6A4F',          // Emerald accent

  // Accent Warm & Flame (Streak flame / Attention / Highlights)
  accentWarm: '#FF7A00',      // Streak flame
  flame: '#FF7A00',           // Streak flame
  flameLight: '#FF9E00',      // Warm flame highlight
  sun: '#FF9E00',             // Warm sunlight ochre
  sunTint: '#FEF3C7',         // Warm sun tint wash

  // Neutral Lines & Borders (Subtle Mint-tinted lines)
  line: '#E2ECE5',            // Subtle mint-tinted line
  border: '#E2ECE5',          // Subtle mint-tinted line
  controlBorder: '#C4D7CB',   // Form controls & button outlines
  mist: '#EAF2ED',            // Pill button & squircle tile background

  // System States (Success, Warning, Danger / Error)
  success: '#2D6A4F',         // Emerald success
  successDark: '#1B4D3E',     // Deep Forest Evergreen
  successTint: '#D8F3DC',     // Mint tint
  successBorder: '#B7E4C7',   // Mint border
  warning: '#D97706',         // Accessible warm amber warning
  warningTint: '#FEF3C7',     // Soft warning tint
  danger: '#DC2626',          // Crisp crimson danger
  dangerTint: '#FEE2E2',      // Soft danger tint
  error: '#DC2626',           // Crimson error (alias for danger)
  errorTint: '#FEE2E2',       // Soft error tint (alias for dangerTint)
  overlay: 'rgba(18, 38, 32, 0.56)', // Deep forest backdrop scrim
} as const;

export const darkColors: AppColors = {
  // Canvas & Surfaces (Deep Pine / Forest Dark Tones)
  canvas: '#0D1F18',          // Deep pine night canvas
  canvasSubtle: '#11261E',    // Subtle dark pine container
  white: '#142E24',           // Deep forest surface
  surface: '#142E24',         // Card / surface
  card: '#142E24',            // Card elevation
  surfaceElevated: '#1B3B2F', // Elevated dark surface

  // Typography & Inks
  ink: '#E8F5E9',             // Deep pine/forest ink (high contrast >= 4.5:1 WCAG AA)
  inkRaised: '#D8F3DC',       // Soft mint cream
  inkLine: '#7DA895',         // Light mint pine for secondary iconography
  inkMuted: '#2D5243',        // Dark pine wash
  muted: '#8EAA9D',           // Muted sage text

  // Primary Deep Forest Evergreen & Mint
  primary: '#52B788',         // Glowing mint for dark mode readability
  primaryDark: '#74C69D',     // Light mint for contrast
  primaryLight: '#95D5B2',    // Pale mint highlight
  primaryTint: '#16382C',     // Deep forest wash
  primaryBorder: '#235341',   // Deep pine border
  mintTint: '#1A3D30',        // Deep mint wash

  // Secondary & Accent Emerald
  secondary: '#52B788',       // Glowing emerald
  accent: '#52B788',          // Glowing emerald

  // Accent Warm & Flame
  accentWarm: '#FF9E00',      // Warm flame
  flame: '#FF9E00',           // Warm flame
  flameLight: '#FFB74D',      // Light flame
  sun: '#FFB74D',             // Warm glowing sun
  sunTint: '#382B14',         // Deep sun tint

  // Neutral Lines & Borders
  line: '#1E4234',            // Subtle deep pine border
  border: '#1E4234',          // Subtle deep pine border
  controlBorder: '#2E5E4B',   // Form controls & button outlines
  mist: '#162E25',            // Pill button & squircle tile background

  // System States
  success: '#52B788',         // Emerald success
  successDark: '#74C69D',     // Light emerald
  successTint: '#16382C',     // Deep pine success wash
  successBorder: '#235341',   // Pine border
  warning: '#F59E0B',         // Glowing amber warning
  warningTint: '#3B2D12',     // Deep amber wash
  danger: '#EF4444',          // Vibrant red danger
  dangerTint: '#3D1C1B',      // Deep red danger wash
  error: '#EF4444',           // Vibrant red error (alias for danger)
  errorTint: '#3D1C1B',       // Deep red error wash (alias for dangerTint)
  overlay: 'rgba(6, 15, 12, 0.78)', // Deep pine scrim
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

// Emil Kowalski Motion & Interaction Tokens
export const springs = {
  tightSpring: { tension: 180, friction: 12 },
  gentleSpring: { tension: 140, friction: 7 },
  snappySpring: { tension: 220, friction: 14 },
} as const;

export const tightSpring = springs.tightSpring;
export const gentleSpring = springs.gentleSpring;
export const snappySpring = springs.snappySpring;

export const pressScales = {
  cardPress: 0.98,
  buttonPress: 0.96,
  iconPress: 0.92,
} as const;

export const cardPress = pressScales.cardPress;
export const buttonPress = pressScales.buttonPress;
export const iconPress = pressScales.iconPress;

export const durations = {
  instant: 100,
  feedback: 150,
  stateChange: 260,
  drawer: 320,
} as const;

export const instant = durations.instant;
export const feedback = durations.feedback;
export const stateChange = durations.stateChange;
export const drawer = durations.drawer;

export const motion = {
  springs,
  pressScales,
  durations,
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
