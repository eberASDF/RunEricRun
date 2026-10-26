import React, { useEffect, useMemo, useRef, useState } from 'react';
import style from './style.module.scss';
import { createJumpControl } from '../../../../shared/jumpControl.js';
import { client, watchLink } from './session';
import CharacterCarousel from './CharacterCarousel';

export default function RunEricRun({ show }) {
  const jumpControl = useMemo(() => createJumpControl({ client, role: 'watch' }), []);
  const [control, setControl] = useState(jumpControl.snapshot());
  const [pressed, setPressed] = useState(false);
  const timer = useRef(null);
  const link = useMemo(watchLink, []);
  const [state, setState] = useState(link.snapshot());
  const [screen, setScreen] = useState('control');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!show) {
      client?.auth.stopAutoRefresh(); void jumpControl.disconnect(); void link.disconnect();
      return;
    }
    const unsubscribeControl = jumpControl.subscribe(setControl);
    const unsubscribe = link.subscribe(next => {
      setState(next);
      void jumpControl.setSession(next.session, next.status === 'online' && show);
    });
    const resume = () => {
      if (show && document.visibilityState !== 'hidden') { client?.auth.startAutoRefresh(); void link.connect(); }
      else { client?.auth.stopAutoRefresh(); void link.disconnect(); }
    };
    resume();
    document.addEventListener('visibilitychange', resume);
    const retry = setInterval(() => { if (show && document.visibilityState !== 'hidden') void link.connect(); }, 20000);
    return () => { clearInterval(retry); clearTimeout(timer.current); document.removeEventListener('visibilitychange', resume);
      unsubscribe(); unsubscribeControl(); client?.auth.stopAutoRefresh(); void jumpControl.disconnect(); void link.disconnect(); };
  }, [link, jumpControl, show]);
  const onJump = async () => {
    if (!control.ready) return;
    setPressed(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPressed(false), 180);
    await jumpControl.sendJump();
  };
  const pair = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await link.pair(code); setCode(''); setScreen('characters'); }
    catch (e) {
      const message = String(e.message || '');
      setError(message.includes('Código inválido') ? 'Ese código no es válido o ya venció.'
        : message.includes('Espera 5 minutos') ? 'Prueba de nuevo en 5 minutos.'
        : 'No pudimos vincular el reloj. Inténtalo de nuevo.');
    }
    finally { setBusy(false); }
  };
  return <div className={`${style.screen} ${show ? '' : style.hidden}`}>
    <div className={style.desert} />
    {screen === 'control' ? <div className={style.content}>
      <span className={style.brand}>RUN ERIC RUN</span>
      <button type="button" onClick={onJump} disabled={!control.ready} className={`${style.jump} ${pressed ? style.pressed : ''}`}>
        <span aria-hidden="true">↑</span>
        Saltar
      </button>
      <span role="status" className={style.controlStatus}>
        <b className={control.connected ? style.connected : ''}/>
        {{ unpaired: 'Vincula tu reloj', connecting: 'Conectando…', waiting: 'Esperando teléfono',
          idle: 'Conectado · En espera', connected: 'Conectado' }[control.status]}
      </span>
      <div className={style.navigation}>
        <button onClick={() => setScreen('characters')}>Personajes</button>
        <button onClick={() => { setError(''); setScreen('pair'); }}>{state.session ? 'Mi reloj' : 'Vincular'}</button>
      </div>
    </div> : <div className={style.page}>
      <header className={style.header}><button aria-label="Volver al salto" onClick={() => setScreen('control')}>‹</button>
        <span>{screen === 'characters' ? 'Personajes' : 'Vincular reloj'}</span>
        <span aria-hidden="true" style={{ width: 27 }}/></header>
      {screen === 'characters' ? <CharacterCarousel link={link} state={state} onPair={() => setScreen('pair')}/>
        : <form className={style.pairForm} onSubmit={pair}>
          <p>En el teléfono, abre<br/><strong>Vincular reloj → Generar código</strong></p>
          <label htmlFor="pair-code">Código del teléfono</label>
          <input id="pair-code" aria-label="Código del teléfono" placeholder="ABCD-EF12" value={code} maxLength={9}
            autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={e => setCode(e.target.value.toUpperCase())}/>
          <button className={style.select} disabled={busy || code.replace(/[- ]/g, '').length !== 8}>{busy ? 'Vinculando…' : 'Vincular'}</button>
          <div className={`${style.feedback} ${style.error}`} role="alert">{error || (state.session ? 'Un nuevo código cambia el teléfono vinculado.' : '')}</div>
        </form>}
    </div>}
  </div>;
}
