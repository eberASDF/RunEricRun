import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

export function GameButton({ label, onPress, secondary = false, compact = false, wide = false, large = false }: {
  label: string; onPress: () => void; secondary?: boolean; compact?: boolean; wide?: boolean; large?: boolean;
}) {
  const scale = useSharedValue(1);
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={motion}>
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.94, { damping: 15 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 10, stiffness: 280 });
      }}
      style={[styles.button, compact && styles.compact, wide && { minWidth: 225 }, large && styles.large, secondary && styles.secondary]}>
      <Text style={[styles.text, compact && { fontSize: 15 }, large && { fontSize: 21 }, secondary && { color: '#513421' }]}>{label}</Text>
    </Pressable>
  </Animated.View>;
}
const styles = StyleSheet.create({
  button: { backgroundColor: '#1476eb', borderColor: '#87c4ff', borderWidth: 2,
    borderBottomColor: '#08468d', borderBottomWidth: 5, borderRadius: 17,
    paddingVertical: 11, paddingHorizontal: 26, minWidth: 148, alignItems: 'center', elevation: 5 },
  secondary: { backgroundColor: '#fff0cf', borderColor: '#d9aa72', borderBottomColor: '#986c49' },
  compact: { paddingVertical: 8, paddingHorizontal: 20 },
  large: { minWidth: 260, paddingVertical: 15, paddingHorizontal: 28 },
  text: { color: '#fff', fontSize: 17 },
});
