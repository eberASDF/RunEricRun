import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSessionLink } from '../../shared/sessionClient.js';
import { client } from './scores';
import * as Crypto from 'expo-crypto';
import { createJumpControl } from '../../shared/jumpControl.js';

export function useCharacterSession() {
  const link = useMemo(() => createSessionLink({ client, role: 'phone', storage: AsyncStorage }), []);
  const jumpControl = useMemo(() => createJumpControl({ client, role: 'phone', uuid: Crypto.randomUUID }), []);
  const [state, setState] = useState(link.snapshot());
  useEffect(() => {
    const unsubscribe = link.subscribe(next => {
      setState(next);
      void jumpControl.setSession(next.session, next.status === 'online');
    });
    const foreground = () => AppState.currentState === 'active';
    if (foreground()) void link.connect();
    const app = AppState.addEventListener('change', status => {
      if (status === 'active') void link.connect(); else void link.disconnect();
    });
    const retry = setInterval(() => { if (foreground()) void link.connect(); }, 20000);
    return () => { clearInterval(retry); app.remove(); unsubscribe(); void jumpControl.disconnect(); void link.disconnect(); };
  }, [link, jumpControl]);
  return { link, state, jumpControl, character: state.session?.selected_character ?? 'eric' };
}
