import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type AppColors } from './tokens';

export function useAppColors() {
  return lightColors;
}

export function useThemedStyles<T>(factory: (colors: AppColors) => T) {
  const colors = useAppColors();
  const styles = useMemo(() => factory(colors), [colors, factory]);
  return { colors, styles };
}
