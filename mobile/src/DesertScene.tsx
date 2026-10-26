import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';

const DuneTile = memo(function DuneTile({ width, height, near = false }: { width: number; height: number; near?: boolean }) {
  return <Svg width={width} height={height} viewBox="0 0 1000 500" preserveAspectRatio="none">
    {near ? <>
      <Path d="M0 344 Q175 284 315 339 Q453 292 587 345 Q748 282 1000 344 V500 H0Z" fill="#d98b53"/>
      <Path d="M0 367 Q201 334 430 365 Q703 326 1000 367 V500 H0Z" fill="#e7a365"/>
      <G stroke="#ac784c" strokeWidth="8" strokeLinecap="round" fill="none" opacity=".55">
        <Path d="M736 395v-71m0 34h-18v-22m18 37h20v-30"/>
        <Path d="M292 395v-42m0 25h15v-14"/>
      </G>
    </> : <>
      <Path d="M0 291L86 280 108 238 149 234 179 270 219 281 266 257 310 203 356 203 389 263 451 284 537 264 587 239 642 240 695 289 811 260 845 220 888 220 930 271 1000 291V500H0Z" fill="#d7a179"/>
      <Path d="M0 300Q130 252 247 291Q377 253 489 291Q650 265 789 299Q899 258 1000 300V500H0Z" fill="#e8b277"/>
      <Path d="M316 215h30l20 55h-79zM851 231h24l34 40h-70z" fill="#edbd89" opacity=".7"/>
    </>}
  </Svg>;
});

export const DesertScene = memo(function DesertScene({ width, height, travel, time }: {
  width: number; height: number; travel?: SharedValue<number>; time?: SharedValue<number>;
}) {
  const far = useAnimatedStyle(() => ({ transform: [{ translateX: -((travel?.value || 0) * 0.12 % width) }] }));
  const near = useAnimatedStyle(() => ({ transform: [{ translateX: -((travel?.value || 0) * 0.34 % width) }] }));
  const ground = useAnimatedStyle(() => ({ transform: [{ translateX: -((travel?.value || 0) % width) }] }));
  const clouds = useAnimatedStyle(() => ({ transform: [{ translateX: Math.sin((time?.value || 0) * .09) * 18 }] }));
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width={width} height={height} viewBox="0 0 1000 500" preserveAspectRatio="none">
      <Defs><LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#8fc9dc"/><Stop offset=".57" stopColor="#fce0a1"/>
        <Stop offset="1" stopColor="#f6bf72"/>
      </LinearGradient></Defs>
      <Rect width="1000" height="500" fill="url(#sky)"/>
      <Circle cx="801" cy="106" r="76" fill="#fff1c0" opacity=".15"/>
      <Circle cx="801" cy="106" r="57" fill="#fff1c0" opacity=".23"/>
      <Circle cx="801" cy="106" r="43" fill="#ffe9a9"/>
    </Svg>
    <Animated.View style={[StyleSheet.absoluteFill, clouds]}>
      <Svg width={width} height={height} viewBox="0 0 1000 500" preserveAspectRatio="none">
        <G fill="#fff7db" opacity=".65">
          <Path d="M83 100c14-21 44-18 54 0 24-9 43 2 45 19H48c4-15 17-22 35-19z"/>
          <Path d="M450 67c12-13 29-12 40 0 25-6 41 5 43 19H414c4-12 15-19 36-19z"/>
        </G>
      </Svg>
    </Animated.View>
    <Animated.View style={[styles.strip, { width: width * 2 }, far]}>
      <DuneTile width={width} height={height}/><DuneTile width={width} height={height}/>
    </Animated.View>
    <Animated.View style={[styles.strip, { width: width * 2 }, near]}>
      <DuneTile width={width} height={height} near/><DuneTile width={width} height={height} near/>
    </Animated.View>
    <View style={{ position: 'absolute', top: height * .79, left: 0, right: 0, bottom: 0,
      backgroundColor: '#bd7845', borderTopWidth: 4, borderTopColor: '#ffe0a0' }}/>
    <Animated.View style={[styles.strip, { width: width * 2 }, ground]}>
      {[0, 1].map(tile => <Svg key={tile} width={width} height={height} viewBox="0 0 1000 500" preserveAspectRatio="none">
        <G opacity=".32" stroke="#714329" strokeWidth="2" strokeLinecap="round">
          {Array.from({ length: 13 }, (_, i) => <Path key={i}
            d={`M${i * 83 + 17} ${411 + (i % 3) * 26}h${8 + i % 4 * 3}`}/>)}
        </G>
        <Path d="M42 398l3-9 4 9m461 0 4-7 3 7m377 0 4-11 4 11" stroke="#9e653c" strokeWidth="2" fill="none"/>
      </Svg>)}
    </Animated.View>
  </View>;
});
const styles = StyleSheet.create({ strip: { position: 'absolute', top: 0, left: 0, flexDirection: 'row' } });
