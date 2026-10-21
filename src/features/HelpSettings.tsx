import { useState } from 'react';
import { useStore } from 'zustand';
import { gameStore } from '../store/gameStore';
import { Icon } from '../components/Icon';
import { money } from '../utils/format';
import { CONFIG } from '../data/catalog';

export function HelpPanel() {
  const items = [
    [
      'basket',
      'Buy what you need',
      'Buy ingredients from the supplier. Cash becomes stock; it is not an immediate loss.',
    ],
    [
      'calculator',
      'Know the cost of each cup',
      'In Menu & pricing, review the cost of each ingredient per serving, including packaging. Add them up, enter your COGS, then select Check COGS before setting a selling price.',
    ],
    [
      'coffee',
      'Set prices and open your cafe',
      'Lower prices can attract customers. Higher prices offer more profit per cup, but may be less affordable.',
    ],
    [
      'discount',
      'Consider a promotion',
      'Set discounts per menu item in Promotions & discounts during preparation. Lower prices can attract buyers, but COGS stays the same, reducing your margin. Discounts are locked while the cafe is open.',
    ],
    [
      'users',
      'Serve customers',
      'Listen to orders or help customers choose a drink. Once agreed, prepare the order and hand it over when ready.',
    ],
    [
      'report',
      'Calculate your results',
      `After closing, subtract discounts from gross sales. Then subtract COGS and operating costs of ${money(CONFIG.operatingCost)} to calculate your profit or loss.`,
    ],
  ] as const;
  return (
    <>
      <div className="help-banner">
        <Icon name="sprout" size={32} />
        <h3>Your first cafe starts here.</h3>
      </div>
      <div className="help-steps">
        {items.map(([icon, title, body], i) => (
          <div key={title}>
            <span className="step-number">0{i + 1}</span>
            <span>
              <h3>{title}</h3>
              <p>{body}</p>
            </span>
            <Icon name={icon} />
          </div>
        ))}
      </div>
    </>
  );
}

export function SettingsPanel() {
  const store = useStore(gameStore);
  const [confirm, setConfirm] = useState<'new' | 'retry' | null>(null);
  return (
    <>
      <div className="setting-row">
        <div>
          <strong>Reduce motion</strong>
          <p>Gentler transitions with all the same information.</p>
        </div>
        <label className="switch">
          <input
            aria-label="Reduce motion"
            type="checkbox"
            checked={store.reducedMotion}
            onChange={(e) => store.setReducedMotion(e.target.checked)}
          />
          <span />
        </label>
      </div>
      <div className="setting-row">
        <div>
          <strong>Background music</strong>
          <p>Loop the cafe soundtrack after you start playing.</p>
        </div>
        <label className="switch">
          <input
            aria-label="Background music"
            type="checkbox"
            checked={store.musicEnabled}
            onChange={(e) => store.setMusicEnabled(e.target.checked)}
          />
          <span />
        </label>
      </div>
      <div className="setting-row">
        <div>
          <strong>Local save</strong>
          <p>
            {store.saveStatus === 'saved'
              ? 'Progress is saved in this browser.'
              : store.warning || 'Saving is not available yet.'}
          </p>
        </div>
        <button
          className="button secondary"
          disabled={!store.session}
          onClick={() => {
            gameStore.setState({ saveStatus: 'saved' });
            store.save();
          }}
        >
          Save again
        </button>
      </div>
      {store.saveStatus === 'failed' && (
        <button className="button secondary full" onClick={store.continueInMemory}>
          Continue without saving this session
        </button>
      )}
      <div className="setting-row">
        <div>
          <strong>Retry today</strong>
          <p>Return to the start of preparation. Purchases and sales made today will be undone.</p>
        </div>
        <button
          className="button secondary"
          disabled={!store.session || store.readOnly}
          onClick={() => setConfirm('retry')}
        >
          <Icon name="reset" size={17} /> Retry
        </button>
      </div>
      <div className="setting-row">
        <div>
          <strong>Start a new cafe</strong>
          <p>Replace current progress with starting capital of {money(500_000)}.</p>
        </div>
        <button
          className="button danger"
          disabled={store.readOnly}
          onClick={() => setConfirm('new')}
        >
          Start over
        </button>
      </div>
      {confirm && (
        <div className="confirm-box" role="alert">
          <h3>
            {confirm === 'new'
              ? 'Replace your progress with a new cafe?'
              : 'Return to the start of today?'}
          </h3>
          <p>
            {confirm === 'new'
              ? 'Your current cash, stock, and business history will be replaced.'
              : 'All progress since the preparation checkpoint for today will be undone.'}
          </p>
          <div className="button-row">
            <button className="button secondary" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="button danger"
              onClick={() => {
                confirm === 'new' ? store.start(true) : store.retryDay();
                setConfirm(null);
              }}
            >
              {confirm === 'new' ? 'Yes, start a new cafe' : 'Yes, retry today'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
