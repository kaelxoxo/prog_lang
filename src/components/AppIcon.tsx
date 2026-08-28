import { Lucide, type LucideIconName } from '@react-native-vector-icons/lucide';
import { View } from 'react-native';

type Props = {
  color: string;
  name: LucideIconName;
  size?: number;
};

export function AppIcon({ color, name, size = 20 }: Props) {
  return (
    <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Lucide accessible={false} color={color} name={name} size={size} />
    </View>
  );
}
