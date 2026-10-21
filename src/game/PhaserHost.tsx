import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';

export function PhaserHost() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let game: import('phaser').Game | undefined;
    Promise.all([import('phaser'), import('./scenes/CafeScene')])
      .then(([{ default: Phaser }, { CafeScene }]) => {
        if (cancelled || !ref.current) return;
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: ref.current,
          width: 1280,
          height: 720,
          backgroundColor: '#e7d6b6',
          scene: [CafeScene],
          scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
          render: { antialias: true },
          audio: { noAudio: true },
          callbacks: {
            postBoot: () => {
              if (!cancelled) setReady(true);
            },
          },
        });
        game.canvas.setAttribute(
          'aria-label',
          'Cafe interior. All orders can also be served using the buttons beside the scene.',
        );
        game.canvas.setAttribute('role', 'img');
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);
  return (
    <div className="phaser-stage">
      <div className="canvas-container" ref={ref} />
      {!ready && (
        <div className="scene-loading">
          <Icon name="coffee" size={28} />
          <span>
            {failed
              ? 'The illustration could not load. Cafe controls are still available.'
              : 'Preparing your favorite corner…'}
          </span>
        </div>
      )}
    </div>
  );
}
