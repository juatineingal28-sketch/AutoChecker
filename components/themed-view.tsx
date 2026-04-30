// components/themed-view.tsx
// Full fixed version (removes missing import error)

import { View, type ViewProps, useColorScheme } from 'react-native';

type ThemeProps = {
  light?: string;
  dark?: string;
};

function useThemeColor(
  props: ThemeProps,
  colorName: 'background'
) {
  const theme = useColorScheme() ?? 'light';

  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  }

  const Colors = {
    light: {
      background: '#FFFFFF',
    },
    dark: {
      background: '#151718',
    },
  };

  return Colors[theme][colorName];
}

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  ...otherProps
}: ThemedViewProps) {
  const backgroundColor = useThemeColor(
    {
      light: lightColor,
      dark: darkColor,
    },
    'background'
  );

  return (
    <View
      style={[
        { backgroundColor },
        style,
      ]}
      {...otherProps}
    />
  );
}