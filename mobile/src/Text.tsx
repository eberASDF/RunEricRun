import React, { forwardRef } from 'react';
import { Platform, Text as NativeText, TextProps } from 'react-native';
import { isLoaded } from 'expo-font';
import Animated from 'react-native-reanimated';

export const Text = forwardRef<React.ComponentRef<typeof NativeText>, TextProps>(function Text({ style, ...props }, ref) {
  return <NativeText {...props} ref={ref} style={[style, {
    fontFamily: isLoaded('Rye') ? 'Rye' : Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '400',
  }]}/>;
});
export const AnimatedText = Animated.createAnimatedComponent(Text);
