import React, { useEffect, useRef } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import Svg, { Path } from 'react-native-svg';
import { BlurTargetView, BlurView } from 'expo-blur';
import Animated, { cancelAnimation, Easing, FadeIn, FadeInDown, useAnimatedStyle,
  useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { GameButton } from './Button';
import { DesertScene } from './DesertScene';
import type { ScoreRecord } from './scores';
import { characterById, CharacterId } from './characters';

export function HomeScreen({ width, height, character, rows, syncing, onStart, onRefresh, onPair }: {
  width: number; height: number; rows: ScoreRecord[];
  character: CharacterId; syncing: boolean; onStart: () => void; onRefresh: () => void; onPair: () => void;
}) {
  const floating = useSharedValue(0);
  const backdrop = useRef<React.ComponentRef<typeof View> | null>(null);
  const time = useSharedValue(0);
  useEffect(() => {
    floating.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true);
    time.value = withRepeat(withTiming(1000, { duration: 1000000, easing: Easing.linear }), -1);
    return () => { cancelAnimation(floating); cancelAnimation(time); };
  }, [floating, time]);
  const heroMotion = useAnimatedStyle(() => ({ transform: [
    { translateY: -floating.value * 10 }, { rotate: `${-3 + floating.value * 6}deg` },
    { scale: .98 + floating.value * .04 },
  ] }));
  const shadowMotion = useAnimatedStyle(() => ({ opacity: .23 - floating.value * .08,
    transform: [{ scaleX: 1 - floating.value * .13 }] }));
  const tumble = useAnimatedStyle(() => ({ transform: [
    { translateX: Math.sin(time.value * .5) * 9 }, { rotate: `${time.value * 18}deg` },
  ] }));
  const boardHeight = height * .65;

  return <View style={StyleSheet.absoluteFill}>
    <BlurTargetView ref={backdrop} style={StyleSheet.absoluteFill}>
      <DesertScene width={width} height={height} time={time}/>
    </BlurTargetView>
    <BlurView blurTarget={backdrop} blurMethod="dimezisBlurView" intensity={8}
      tint="light" style={StyleSheet.absoluteFill}/>
    <Animated.View entering={FadeIn.duration(450)} style={{ position: 'absolute', left: width * .03,
      width: width * .46, top: height * .035, height: height * .90, alignItems: 'center', justifyContent: 'center' }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.brand, { fontSize: height * .085 }]}>RUN ERIC RUN</Text>
      <Animated.Image source={characterById(character).source} resizeMode="contain" accessibilityLabel={characterById(character).name}
        style={[{ width: height * .34, height: height * .44, marginTop: 14 }, heroMotion]}/>
      <Animated.View style={[{ width: height * .30, height: 7, backgroundColor: '#5e351f',
        borderRadius: 100, marginTop: 4, marginBottom: 14 }, shadowMotion]}/>
      <GameButton label="Empezar partida" onPress={onStart} large/>
    </Animated.View>

    <Animated.View entering={FadeInDown.duration(600).springify().damping(18)}
      style={{ position: 'absolute', top: 0, left: width * .515, width: width * .46, height }}>
      <View style={{ position: 'absolute', top: height * .791, left: '15%', width: '74%',
        height: height * .028, borderRadius: 100, backgroundColor: '#754326', opacity: .25 }}/>
      {[21, 73].map(left => <View key={left} style={{ position: 'absolute', left: `${left}%`,
        top: height * .40, width: '6%', height: height * .41, backgroundColor: '#754426',
        borderLeftWidth: 3, borderLeftColor: '#a87543', borderRightWidth: 3, borderRightColor: '#472b1d',
        transform: [{ rotate: left === 21 ? '-1.2deg' : '1deg' }] }}>
        <Svg width="100%" height="100%" viewBox="0 0 20 170" preserveAspectRatio="none">
          <Path d="M7 0L5 40l4 22-4 26 3 33-3 49M14 16l-2 42 3 17-2 31 2 32" stroke="#402b1d" strokeWidth="1" fill="none"/>
          <Path d="M3 94l2 36-2 37M15 0l2 34" stroke="#c58c4d" strokeWidth="1" fill="none"/>
        </Svg>
      </View>)}
      <View style={{ position: 'absolute', top: height * .055, width: '100%', height: boardHeight }}>
        <Image source={require('../assets/wood-sign.png')} resizeMode="stretch"
          style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}/>
        <View style={{ position: 'absolute', left: '12%', right: '12%', top: '9%', bottom: '9%' }}>
          <Text style={[styles.eyebrow, { fontSize: height * .023 }]}>MEJORES PUNTAJES DE</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.boardTitle, { fontSize: height * .062 }]}>{characterById(character).name.toUpperCase()}</Text>
          <View style={[styles.tableHead, { marginTop: height * .012 }]}>
            <Text style={[styles.heading, { width: '14%' }]}>Nº</Text>
            <Text style={[styles.heading, { flex: 1 }]}>PUNTOS</Text>
            <Text style={styles.heading}>FECHA</Text>
          </View>
          {rows.length === 0 ? <View style={{ height: boardHeight * .5, justifyContent: 'center' }}>
            <Text style={[styles.status, { fontSize: Math.max(12, height * .035), lineHeight: height * .05 }]}>Este personaje todavía no tiene puntuaciones</Text>
          </View> : Array.from({ length: 5 }, (_, index) => {
            const row = rows[index];
            return <Animated.View key={row?.id || index} entering={FadeIn.delay(100 + index * 55).duration(300)}
              style={[styles.scoreRow, { height: boardHeight * .10 }]}>
              <Text style={[styles.rank, { width: '14%', fontSize: height * .035 }]}>{index + 1}</Text>
              <Text style={[styles.value, { flex: 1, fontSize: height * .042 }]}>{row ? row.score : '—'}</Text>
              <Text style={[styles.date, { fontSize: Math.max(9, height * .027) }]}>
                {row ? new Date(row.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
              </Text>
            </Animated.View>;
          })}
          <Pressable onPress={onRefresh} accessibilityRole="button" accessibilityLabel="Actualizar puntajes"
            disabled={syncing} hitSlop={8} style={{ marginTop: height * .012 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.status, { fontSize: Math.max(9, height * .024) }]}>{syncing ? 'Actualizando…' : 'Actualizar puntajes'}</Text>
          </Pressable>
        </View>
      </View>
      <Svg width="100%" height={height * .05} viewBox="0 0 400 24"
        style={{ position: 'absolute', top: height * .785 }}>
        <Path d="M64 15q15-17 33-5l13 5zm198 0q15-17 34-4l14 4z" fill="#d79656"/>
        <Path d="M69 16h39m157 0h42" stroke="#edba73" strokeWidth="3" strokeLinecap="round"/>
      </Svg>
      <View style={{ position: 'absolute', top: height * .84, width: '100%', alignItems: 'center' }}>
        <GameButton label="Vincular reloj" onPress={onPair} compact={height < 360} wide/>
      </View>
    </Animated.View>
    <Animated.View style={[{ position: 'absolute', right: width * .035, bottom: height * .175,
      width: height * .11, height: height * .11 }, tumble]}>
      <Svg width="100%" height="100%" viewBox="0 0 60 60">
        <Path d="M9 26q-3-20 24-18 23 0 20 26-1 24-25 19C6 54 1 39 9 26zm0 0 36 18M14 13l28 37M7 36l42-19M18 49l12-42M7 22l46 15M26 54l23-37M16 12l-2 31 33-4-22-26-5 36" fill="none" stroke="#946235" strokeWidth="1.7"/>
      </Svg>
    </Animated.View>
  </View>;
}
const paint = { color: '#fff0ca', textShadowColor: '#341b0f', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 1 };
const styles = StyleSheet.create({
  brand: { color: '#54331c', letterSpacing: 1,
    textShadowColor: '#ffe8a8', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 1 },
  eyebrow: { ...paint, color: '#e6bc7c', letterSpacing: 2, fontWeight: '800', textAlign: 'center' },
  boardTitle: { ...paint, textAlign: 'center', marginTop: 2 },
  tableHead: { flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#e7bd7a99' },
  heading: { ...paint, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: .5, borderBottomColor: '#dfb77e55' },
  rank: { ...paint, color: '#e5bd7f', fontWeight: '900' },
  value: { ...paint, fontWeight: '900', fontVariant: ['tabular-nums'] },
  date: { ...paint, color: '#f0d7ae', fontWeight: '700', fontVariant: ['tabular-nums'] },
  status: { ...paint, color: '#e9ca98', textAlign: 'center', fontWeight: '700' },
});
