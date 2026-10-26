import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StatusBar, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useFonts } from 'expo-font';
import { GameScene } from './src/GameScene';
import { HomeScreen } from './src/HomeScreen';
import { PairingPanel } from './src/PairingPanel';
import { useCharacterSession } from './src/useCharacterSession';
import type { CharacterId } from './src/characters';
import { leaderboard, saveRun, ScoreRecord, setAuthActive } from './src/scores';

export default function App() {
  const [loaded, error] = useFonts({ Rye: require('./assets/fonts/Rye-Regular.ttf') });
  if (!loaded && !error) return <View style={styles.root}/>;
  return <RunEricRunApp/>;
}

function RunEricRunApp() {
  const [size, setSize] = useState({ width: 844, height: 390 });
  const { link, state, character, jumpControl } = useCharacterSession();
  const selected = useRef(character);
  selected.current = character;
  const [pairing, setPairing] = useState(false);
  const [run, setRun] = useState<{ id: string; best: number; character: CharacterId } | null>(null);
  const [rows, setRows] = useState<ScoreRecord[]>([]);
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const flights = useRef(new Map<CharacterId, Promise<boolean>>());
  const refresh = useCallback((target: CharacterId = selected.current): Promise<boolean> => {
    const existing = flights.current.get(target);
    if (existing) return existing;
    if (target === selected.current) setSyncing(true);
    const flight = leaderboard(target).then(result => {
      if (target === selected.current) {
        setRows(result.rows); setOnline(result.online); setPending(result.pending);
      }
      return result.online && result.pending === 0;
    }).catch(() => { if (target === selected.current) setOnline(false); return false; }).finally(() => {
      flights.current.delete(target);
      if (target === selected.current) setSyncing(false);
    });
    flights.current.set(target, flight);
    return flight;
  }, []);
  useEffect(() => { setRows([]); void refresh(character); }, [character, refresh]);
  useEffect(() => {
    setAuthActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', status => {
      setAuthActive(status === 'active');
      if (status === 'active') void refresh();
    });
    return () => { subscription.remove(); setAuthActive(false); };
  }, [refresh]);
  useEffect(() => {
    if (online && pending === 0) return;
    const retry = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 20000);
    return () => clearInterval(retry);
  }, [online, pending, refresh]);
  const start = useCallback(() => {
    setRun({ id: Crypto.randomUUID(), best: rows.find(row => row.character_id === character)?.score || 0, character });
  }, [rows, character]);
  const home = useCallback(() => { setRun(null); void refresh(); }, [refresh]);
  const finished = useCallback(async (score: number) => {
    if (!run) return false;
    await saveRun(score, run.id, run.character);
    await Promise.all([...flights.current.values()]);
    return refresh();
  }, [run, refresh]);
  return <View style={styles.root} onLayout={event => {
    const { width, height } = event.nativeEvent.layout;
    setSize(current => current.width === width && current.height === height ? current : { width, height });
  }}>
    <StatusBar hidden/>
    {run ? <GameScene key={run.id} runId={run.id} jumpControl={jumpControl} {...size} best={run.best} character={run.character}
      onHome={home} onRestart={start} onFinished={finished}/>
      : <HomeScreen {...size} character={character} rows={rows.filter(row => row.character_id === character)}
          syncing={syncing} onStart={start} onPair={() => setPairing(true)}
          onRefresh={() => { void refresh(); }}/>}
    <PairingPanel visible={pairing} onClose={() => setPairing(false)} link={link} state={state}/>
  </View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#f6d18b', overflow: 'hidden' } });
