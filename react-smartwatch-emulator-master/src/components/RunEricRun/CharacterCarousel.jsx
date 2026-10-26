import React, { useEffect, useRef, useState } from 'react';
import characters from '../../../../shared/characters.json';
import style from './style.module.scss';

const wrap = index => (index + characters.length) % characters.length;
export default function CharacterCarousel({ link, state, onPair }) {
  const confirmed = state.session?.selected_character;
  const [index, setIndex] = useState(Math.max(0, characters.findIndex(c => c.id === confirmed)));
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const pointer = useRef(null);
  const suppressClick = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (confirmed) setIndex(characters.findIndex(c => c.id === confirmed));
  }, [confirmed]);
  const move = delta => { setIndex(i => wrap(i + delta)); setMessage(''); };
  const start = event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    pointer.current = { id: event.pointerId, x: event.clientX, moved: false };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const slide = event => {
    if (pointer.current?.id !== event.pointerId) return;
    const dx = event.clientX - pointer.current.x;
    if (Math.abs(dx) > 8) { pointer.current.moved = true; setDragging(true); }
    if (pointer.current.moved) setDrag(Math.max(-100, Math.min(100, dx)));
  };
  const end = event => {
    if (pointer.current?.id !== event.pointerId) return;
    const dx = event.clientX - pointer.current.x;
    suppressClick.current = pointer.current.moved;
    if (event.type !== 'pointercancel' && pointer.current.moved && Math.abs(dx) > 32) move(dx < 0 ? 1 : -1);
    pointer.current = null; setDrag(0); setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const choose = async () => {
    if (!state.session) { onPair(); return; }
    setBusy(true); setMessage(''); setFailed(false);
    try { await link.selectCharacter(characters[index].id); setMessage(`${characters[index].name} seleccionado`); }
    catch { setFailed(true); setMessage('No pudimos cambiarlo. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  };
  return <section className={style.selector} aria-label="Selector de personajes">
    <div className={`${style.carousel} ${dragging ? style.dragging : ''}`} tabIndex={0}
      aria-label="Desliza para ver personajes" onKeyDown={e => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); move(e.key === 'ArrowLeft' ? -1 : 1); }
      }} onPointerDown={start} onPointerMove={slide} onPointerUp={end} onPointerCancel={end}>
      {characters.map((character, i) => {
        const offset = wrap(i - index + 1) - 1;
        return <div key={character.id} className={style.portrait} aria-hidden={i !== index}
          style={{ transform: `translateX(${offset * 105 + drag}px) scale(${Math.max(.52, 1 - Math.abs(offset + drag / 105) * .4)})`, opacity: offset === 0 ? 1 : .62, zIndex: offset === 0 ? 2 : 1 }}
          onClick={() => { if (!suppressClick.current && offset) move(offset); }}>
          <img className={style.floating} src={`/assets/characters/${character.image}`} alt={character.name} draggable="false"/>
        </div>;
      })}
      <button type="button" className={`${style.arrow} ${style.previous}`} aria-label="Personaje anterior" onClick={() => move(-1)}>‹</button>
      <button type="button" className={`${style.arrow} ${style.next}`} aria-label="Personaje siguiente" onClick={() => move(1)}>›</button>
    </div>
    <h2 className={style.name}>{characters[index].name}</h2>
    <span className={style.confirmed}>{characters[index].id === confirmed ? '✓ Confirmado' : 'Vista previa'}</span>
    <button type="button" className={style.select} onClick={choose} disabled={busy}>{busy ? 'Enviando…' : 'Seleccionar'}</button>
    <div className={`${style.feedback} ${failed ? style.error : ''}`} role={failed ? 'alert' : 'status'}>{message}</div>
  </section>;
}
