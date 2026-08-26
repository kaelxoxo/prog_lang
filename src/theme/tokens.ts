export const lightColors = {
  canvas: '#F6F1E7',
  white: '#FFFCF6',
  ink: '#233A35',
  inkRaised: '#304B44',
  inkLine: '#567169',
  inkMuted: '#D4E0DB',
  primary: '#9C4F35',
  primaryDark: '#753724',
  primaryTint: '#F4E4DA',
  success: '#477064',
  successDark: '#2F554A',
  successTint: '#E4EFEA',
  sun: '#E8B85D',
  muted: '#626E69',
  line: '#DED8CC',
  controlBorder: '#858E89',
  mist: '#ECE7DD',
  warning: '#785710',
  warningTint: '#FFF1CC',
  overlay: 'rgba(25, 42, 38, 0.52)',
  error: '#9A352F',
  errorTint: '#F8E3DE',
} as const;

export const darkColors: AppColors = {
  canvas: '#17211F',
  white: '#202C29',
  ink: '#F6F1E7',
  inkRaised: '#E4ECE8',
  inkLine: '#81968F',
  inkMuted: '#D4E0DB',
  primary: '#D98B6C',
  primaryDark: '#F0B49A',
  primaryTint: '#45291F',
  success: '#8FB8AA',
  successDark: '#C6E1D8',
  successTint: '#203B34',
  sun: '#E8B85D',
  muted: '#BCC8C3',
  line: '#44534F',
  controlBorder: '#87948F',
  mist: '#2A3733',
  warning: '#F2CB70',
  warningTint: '#3D321C',
  overlay: 'rgba(4, 9, 8, 0.76)',
  error: '#FFB4AB',
  errorTint: '#442321',
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
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
} as const;
