import React, { useState } from 'react';
import style from './style.module.scss';
import WatchScreen from '../WatchScreen';

const screens = {
    MESSAGING: 1,
    MUSIC: 2,
    TIMER: 3,
    RUNERICRUN: 4
}

function Watch() {
    const [currentScreen, setCurrentScreen] = useState(screens.RUNERICRUN);

    return (
        <div className={style.watchContainer}>
            <div className={style.belt}></div>
            <div className={style.watchButton}></div>
            <div className={style.frame}>
                <WatchScreen screen={currentScreen}/>
            </div>
            <div className={style.buttonArea}>
                <i aria-label="RunEricRun" title="RunEricRun" className={`material-icons md-18 ${
                    currentScreen === screens.RUNERICRUN ? style.active : ''
                    }`} onClick={() => setCurrentScreen(screens.RUNERICRUN)}>directions_run</i>
                <i className={`material-icons md-18 ${
                    currentScreen === screens.MESSAGING ? style.active : ''
                    }`} onClick={() => setCurrentScreen(screens.MESSAGING)}>question_answer</i>
                
                <i className={`material-icons md-18 ${
                    currentScreen === screens.MUSIC ? style.active : ''
                    }`} onClick={() => setCurrentScreen(screens.MUSIC)}>music_note</i>
                
                <i className={`material-icons md-18 ${
                    currentScreen === screens.TIMER ? style.active : ''
                    }`} onClick={() => setCurrentScreen(screens.TIMER)}>timer</i>
                
            </div>
        </div>
    )
}

export default Watch
export {
    screens
}
