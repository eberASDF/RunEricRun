import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { Text, AnimatedText } from './Text';
import { BlurTargetView, BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeIn, FadeInDown, SharedValue, useAnimatedStyle, useDerivedValue,
  useFrameCallback, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { GameButton } from './Button';
import { DesertScene } from './DesertScene';
import { Game, initialGame, jump, scoreOf, step } from './game';
import { characterById, CharacterId } from './characters';
import type { JumpControl } from '../../shared/jumpControl.js';

const SLOTS = 12;

const ObstacleSprite = memo(function ObstacleSprite({ slot, world, floor }: { slot: number; world: SharedValue<Game>; floor: number }) {
  const motion = useAnimatedStyle(() => {
    const obstacle = world.value.obstacles.find(o => o.id % SLOTS === slot);
    return { opacity: obstacle ? 1 : 0, width: obstacle?.width || 1, height: obstacle?.height || 1,
      transform: [{ translateX: obstacle?.x || -100 }] };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, bottom: floor }, motion]}>
    <View style={{ position: 'absolute', bottom: -4, width: '100%', height: 5, backgroundColor: '#66422a', opacity: .2, borderRadius: 30 }}/>
    <Svg width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="none">
      <Path d="M40 200V22Q40 0 56 0T72 22v62h9V52q0-12 10-12t9 12v40q0 12-11 12H72v96zM40 143H13Q0 143 0 128V89Q0 77 10 77t10 12v31h20z" fill="#277b60"/>
      <Path d="M47 193V24Q47 10 55 9M7 92v34q0 8 8 8h22M87 54v32" stroke="#67ac79" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <Path d="M62 29v35m0 54v30m-10 16v17" stroke="#1b5d4b" strokeWidth="3" strokeLinecap="round"/>
    </Svg>
  </Animated.View>;
});

const Dust = memo(function Dust({ index, time, world, width, height }: {
  index: number; time: SharedValue<number>; world: SharedValue<Game>; width: number; height: number;
}) {
  const motion = useAnimatedStyle(() => {
    const progress = (time.value * 1.8 + index * .137) % 1;
    const running = world.value.status === 'playing' && world.value.lift < 4;
    return { opacity: running ? (1 - progress) * .42 : 0,
      transform: [{ translateX: -progress * height * .14 },
        { translateY: -Math.sin(progress * Math.PI) * height * .045 }, { scale: .5 + progress * 1.7 }] };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: width * .14,
    bottom: height * .21, width: 4 + index % 3 * 2, height: 4 + index % 3 * 2,
    borderRadius: 20, backgroundColor: '#f9d59a' }, motion]}/>;
});

export function GameScene({ width, height, best, character, runId, jumpControl, onHome, onRestart, onFinished }: {
  width: number; height: number; best: number; character: CharacterId; onHome: () => void; onRestart: () => void;
  runId: string; jumpControl: JumpControl;
  onFinished: (score: number) => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<Game['status']>('playing');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [score, setScore] = useState(0);
  const [saveMessage, setSaveMessage] = useState('Guardando partida…');
  const [saveError, setSaveError] = useState(false);
  const background = useRef<React.ComponentRef<typeof View> | null>(null);
  const world = useSharedValue(initialGame());
  const time = useSharedValue(0);
  const active = useSharedValue(AppState.currentState === 'active');
  const postedScore = useSharedValue(0);
  const landedAt = useSharedValue(-10);
  const jumpedAt = useSharedValue(-10);
  const shake = useSharedValue(0);
  const scoreScale = useSharedValue(1);
  const hintOpacity = useSharedValue(1);
  const travel = useDerivedValue(() => world.value.distance);
  useEffect(() => { hintOpacity.value = withDelay(2300, withTiming(0, { duration: 600 })); }, [hintOpacity]);

  const persist = useCallback(async (points: number) => {
    setSaveError(false);
    setSaveMessage('Guardando partida…');
    try {
      await onFinished(points);
      setSaveMessage('¡Marca guardada!');
    } catch {
      setSaveError(true);
      setSaveMessage('No se pudo guardar · Toca para reintentar');
    }
  }, [onFinished]);
  const finish = useCallback((points: number) => {
    setScore(points);
    setPhase('over');
    void persist(points);
  }, [persist]);

  useFrameCallback(frame => {
    if (!active.value) return;
    const delta = Math.min((frame.timeSincePreviousFrame || 0) / 1000, .1);
    time.value += delta;
    const previous = world.value;
    if (previous.status !== 'playing') return;
    const next = step(previous, delta, width, height);
    if (previous.lift > 0 && next.lift === 0) landedAt.value = time.value;
    world.value = next;
    const points = scoreOf(next);
    if (points !== postedScore.value) {
      postedScore.value = points;
      scheduleOnRN(setScore, points);
      if (points > 0 && points % 100 === 0) {
        scoreScale.value = withSequence(withTiming(1.22, { duration: 100 }), withSpring(1));
      }
    }
    if (next.status === 'over') {
      shake.value = withSequence(withTiming(-7, { duration: 35 }), withTiming(6, { duration: 45 }),
        withTiming(-4, { duration: 45 }), withTiming(0, { duration: 80 }));
      scheduleOnRN(finish, points);
    }
  });

  const pause = useCallback(() => {
    scheduleOnUI(() => { 'worklet'; if (world.value.status === 'playing') world.value = { ...world.value, status: 'paused' }; });
    setPhase(current => current === 'playing' ? 'paused' : current);
  }, [world]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const foreground = state === 'active';
      active.value = foreground;
      setForeground(foreground);
      if (!foreground) pause();
    });
    return () => subscription.remove();
  }, [active, pause]);
  const resume = () => {
    scheduleOnUI(() => { 'worklet'; if (world.value.status === 'paused') world.value = { ...world.value, status: 'playing' }; });
    setPhase('playing');
  };
  const requestJump = useCallback((expiresAt = Date.now() + 700) => {
    scheduleOnUI(() => {
      'worklet';
      if (!active.value || Date.now() > expiresAt) return;
      const previous = world.value;
      const next = jump(previous, height);
      if (next !== previous) { jumpedAt.value = time.value; world.value = next; }
    });
  }, [height, world, jumpedAt, time, active]);
  useEffect(() => {
    jumpControl.setGame({ runId, active: foreground && phase === 'playing' }, requestJump);
    return () => jumpControl.setGame(null);
  }, [jumpControl, runId, foreground, phase, requestJump]);

  const playerMotion = useAnimatedStyle(() => {
    const current = world.value;
    const landing = Math.max(0, 1 - (time.value - landedAt.value) / .22);
    const takeoff = Math.max(0, 1 - (time.value - jumpedAt.value) / .17);
    const running = current.lift === 0 && current.status === 'playing';
    const bob = running ? Math.sin(current.elapsed * 22) * 1.7 : 0;
    const angle = current.lift > 0 ? Math.max(-9, Math.min(9, -current.velocity * .015)) :
      running ? Math.sin(current.elapsed * 13) * 2.2 : 0;
    return { transform: [{ translateY: -current.lift + bob }, { rotate: `${angle}deg` },
      { scaleX: 1 + landing * .15 - takeoff * .07 }, { scaleY: 1 - landing * .14 + takeoff * .1 }] };
  });
  const shadowMotion = useAnimatedStyle(() => ({ opacity: .24 - Math.min(world.value.lift / height, .4) * .35,
    transform: [{ scaleX: Math.max(.45, 1 - world.value.lift / height) }] }));
  const landingMotion = useAnimatedStyle(() => {
    const age = Math.min(1, (time.value - landedAt.value) / .33);
    return { opacity: (1 - age) * .5, transform: [{ scaleX: 1 + age * 2.8 }, { scaleY: 1 - age * .5 }] };
  });
  const shakeMotion = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const scoreMotion = useAnimatedStyle(() => ({ transform: [{ scale: scoreScale.value }] }));
  const hintMotion = useAnimatedStyle(() => ({ opacity: hintOpacity.value }));

  return <View style={StyleSheet.absoluteFill}>
    <Animated.View style={[StyleSheet.absoluteFill, shakeMotion]}>
      <BlurTargetView ref={background} style={StyleSheet.absoluteFill}>
        <DesertScene width={width} height={height} travel={travel} time={time}/>
        <Animated.View style={[{ position: 'absolute', left: width * .135, bottom: height * .21 - 4,
          width: height * .17, height: 7, borderRadius: 100, backgroundColor: '#4d3020' }, shadowMotion]}/>
        {Array.from({ length: 8 }, (_, i) => <Dust key={i} index={i} world={world} time={time} width={width} height={height}/>)}
        <Animated.View style={[{ position: 'absolute', left: width * .15, bottom: height * .21,
          width: height * .12, height: 6, borderRadius: 99, backgroundColor: '#ffe2ab' }, landingMotion]}/>
        <Animated.Image source={characterById(character).source} resizeMode="contain"
          accessibilityLabel={`Personaje en partida: ${characterById(character).name}`}
          style={[{ position: 'absolute', left: width * .14, bottom: height * .21,
            width: height * .159, height: height * .21 }, playerMotion]}/>
        {Array.from({ length: SLOTS }, (_, slot) => <ObstacleSprite key={slot} slot={slot} world={world} floor={height * .21}/>)}
      </BlurTargetView>
    </Animated.View>
    <View style={styles.hud}>
      <View><Text style={styles.brand}>RUN ERIC RUN</Text><Text style={styles.best}>{characterById(character).name.toUpperCase()} · RÉCORD {Math.max(best, score)}</Text></View>
      <AnimatedText style={[styles.score, scoreMotion]}>{String(score).padStart(4, '0')}</AnimatedText>
      {phase === 'playing' && <Pressable onPress={pause} hitSlop={12} accessibilityRole="button" accessibilityLabel="Pausar partida"><Text style={styles.pause}>Ⅱ</Text></Pressable>}
    </View>
    {phase === 'playing' &&
      <AnimatedText style={[styles.hint, { top: height * .19 }, hintMotion]}>¡SALTA LOS CACTUS!</AnimatedText>
    }
    {phase === 'paused' && <View style={[styles.overlay, { backgroundColor: '#422b2188' }]}>
      <Text style={styles.kicker}>TÓMATE UN RESPIRO</Text><Text style={styles.overTitle}>PAUSA</Text>
      <GameButton label="Continuar" onPress={resume}/><GameButton label="Volver al inicio" onPress={onHome} secondary/>
    </View>}
    {phase === 'over' && <>
      <BlurView blurTarget={background} blurMethod="dimezisBlurView" intensity={38} tint="dark" style={StyleSheet.absoluteFill}/>
      <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: '#a621225e' }]}/>
      <Animated.View entering={FadeInDown.delay(100).duration(350).springify()} style={styles.overlay}>
        <Text style={styles.kicker}>FIN DE PARTIDA</Text>
        <Text style={[styles.overTitle, { fontSize: Math.min(58, height * .145) }]}>{score} PUNTOS</Text>
        {score > best && <Text style={styles.record}>★ NUEVO RÉCORD ★</Text>}
        <View style={styles.actions}><GameButton label="Nueva partida" onPress={onRestart}/><GameButton label="Volver al inicio" onPress={onHome} secondary/></View>
        <Pressable disabled={!saveError} onPress={() => { void persist(score); }} accessibilityRole={saveError ? 'button' : undefined}>
          <Text style={styles.saved}>{saveMessage}</Text>
        </Pressable>
      </Animated.View>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  hud: { position: 'absolute', top: 17, left: 25, right: 25, flexDirection: 'row', alignItems: 'center', gap: 23 },
  brand: { color: '#593720', fontWeight: '900', fontSize: 14, letterSpacing: 2 },
  best: { color: '#835538', fontWeight: '800', fontSize: 10, letterSpacing: 2, marginTop: 4 },
  score: { color: '#50311c', fontWeight: '900', fontSize: 31, letterSpacing: 3, flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  pause: { color: '#674126', fontWeight: '900', fontSize: 25 },
  hint: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: '#79502e', fontSize: 12, fontWeight: '900', letterSpacing: 3 },
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 10 },
  kicker: { color: '#ffe0b8', fontWeight: '900', fontSize: 13, letterSpacing: 4 },
  overTitle: { color: '#fff0cf', fontWeight: '900', fontSize: 48, textShadowColor: '#5b1e16', textShadowRadius: 7 },
  record: { color: '#ffdd81', fontWeight: '900', fontSize: 13, letterSpacing: 2 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  saved: { color: '#ffe0bc', fontSize: 11, fontWeight: '700', marginTop: 8 },
});
