import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { createSession } from '../application/commands';
import { PRODUCTS, productIds } from '../data/catalog';
import { capacity, inventoryValue } from '../domain/inventory/inventory';
import { buildReport } from '../domain/reports/report';
import { gameStore, type Panel } from '../store/gameStore';
import { Icon, type IconName } from '../components/Icon';
import { Modal } from '../components/Modal';
import { PhaserHost } from '../game/PhaserHost';
import { InventoryPanel, PricingPanel, ProductArt, SupplierPanel } from '../features/Management';
import { ReportPanel } from '../features/Reports';
import { HelpPanel, SettingsPanel } from '../features/HelpSettings';
import { CounterMenu, CustomerBubbles, ServiceCounter } from '../features/CustomerService';
import { gameTime, money } from '../utils/format';
import { quotePrice } from '../domain/promotion/promotion';
import { PromotionPanel } from '../features/Promotion';

const preview = createSession(20261016, 'preview');
const panels: Record<NonNullable<Panel>, { title: string; eyebrow?: string }> = {
  supplier: { title: 'Buy ingredients' },
  inventory: { title: 'Inventory' },
  pricing: { title: 'Menu & pricing' },
  promotion: { title: 'Promotions & discounts' },
  report: { title: 'Business report' },
  help: { title: 'Get to know your cafe.', eyebrow: 'GAME GUIDE' },
  settings: { title: 'Make yourself comfortable.', eyebrow: 'SETTINGS' },
};
const nav: { label: string; icon: IconName; panel: Panel }[] = [
  { label: 'My cafe', icon: 'store', panel: null },
  { label: 'Buy ingredients', icon: 'basket', panel: 'supplier' },
  { label: 'Inventory', icon: 'package', panel: 'inventory' },
  { label: 'Menu & pricing', icon: 'coffee', panel: 'pricing' },
  { label: 'Promotions & discounts', icon: 'discount', panel: 'promotion' },
  { label: 'Business report', icon: 'report', panel: 'report' },
];

export default function App() {
  const store = useStore(gameStore);
  const { started, panel, toast } = store;
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const session = store.session ?? preview;
  const day = session.day;
  const report = buildReport(session);
  const profitVerified = session.reports.some(
    (r) => r.day === day.number && r.calculatedProfit === r.profit,
  );
  const active = day.phase === 'open' || day.phase === 'closing';
  const ready = productIds.some(
    (id) => session.menu[id].active && capacity(session.inventory, id) > 0,
  );
  const canOpen = ready && session.cash >= day.operatingCost;
  const activeMenu = productIds.filter((id) => session.menu[id].active).length;
  const status = !started
    ? 'A new story awaits'
    : {
        preparation: 'Time to prepare',
        open: store.paused ? 'Cafe paused' : 'Cafe is open',
        closing: 'Last orders',
        report: 'Cafe closed for the day',
      }[day.phase];
  const openPanel = (target: Panel) => {
    if (!store.started && target && target !== 'help' && target !== 'settings') store.start();
    if (target && target !== 'help' && target !== 'settings' && !gameStore.getState().session)
      return;
    store.openPanel(target);
  };
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => gameStore.setState({ toast: null }), 4800);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (!musicRef.current) {
      musicRef.current = new Audio('/assets/backsound/backsound.mpeg');
      musicRef.current.loop = true;
      musicRef.current.volume = 0.25;
      musicRef.current.preload = 'none';
    }
    const music = musicRef.current;
    if (started && store.musicEnabled) {
      void music.play().catch(() => {
        if (gameStore.getState().started && gameStore.getState().musicEnabled)
          gameStore.setState({
            toast: {
              text: 'Background music could not be played. Check your browser audio settings.',
              error: true,
              id: Date.now(),
            },
          });
      });
    } else {
      music.pause();
    }
  }, [started, store.musicEnabled]);
  useEffect(
    () => () => {
      musicRef.current?.pause();
      musicRef.current = null;
    },
    [],
  );
  return (
    <div className={`app-shell ${store.reducedMotion ? 'reduced-motion' : ''}`}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            store.openPanel(null);
          }}
          aria-label="NumBrew, home"
        >
          <span className="brand-icon">
            <img src="/icon.png" alt="" />
          </span>
          <span>
            Num<span className="brand-accent">Brew</span>
            <small>BREW IDEAS, BLEND NUMBERS!</small>
          </span>
        </a>
        <div className="sidebar-section">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <button
              className={`nav-item ${panel === item.panel ? 'selected' : ''}`}
              key={item.label}
              onClick={() => openPanel(item.panel)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.panel === null && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-section second">LEARNING CORNER</div>
        <button className="nav-item" onClick={() => openPanel('help')}>
          <Icon name="book" />
          <span>How to play</span>
          <Icon name="chevron" size={15} />
        </button>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => openPanel('settings')}>
            <Icon name="settings" />
            <span>Settings</span>
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="page-header">
          <div>
            <div className="greeting">
              <Icon name="sun" size={16} /> {active ? 'READY TO SERVE' : 'WELCOME TO YOUR CAFE'}
            </div>
            <h1>
              {!started
                ? 'Good stories start here.'
                : day.phase === 'report'
                  ? 'One day, many lessons.'
                  : active
                    ? 'A warm cup, a new smile.'
                    : 'A new day, a fresh brew.'}
            </h1>
            <p>
              {!started
                ? 'Build your dream cafe. Discover math in every decision.'
                : status + '. Growing together, one cup at a time.'}
            </p>
          </div>
          <div className="header-actions">
            <div className="institution-logos" aria-label="Project institutions">
              <img src="/assets/icon/Logo%20DMGC.png" alt="DMGC" loading="lazy" />
              <img
                src="/assets/icon/Universitas-Siliwangi.png"
                alt="Universitas Siliwangi"
                loading="lazy"
              />
            </div>
            <div className="header-controls">
              <span className="day-pill">
                <Icon name="sun" size={18} /> Day {day.number}
              </span>
              <button
                className="icon-button help-button"
                aria-label="Open guide"
                onClick={() => openPanel('help')}
              >
                <Icon name="help" size={22} />
              </button>
            </div>
          </div>
        </header>
        {(store.warning || store.readOnly) && (
          <div className="notice status-warning" role="status">
            <span>
              {store.readOnly
                ? 'Your cafe is open in another tab. Close that tab and reload to play here.'
                : store.warning}
            </span>
            <button className="text-button" onClick={() => openPanel('settings')}>
              Settings
            </button>
          </div>
        )}
        <section className="stats-grid" aria-label="Cafe overview">
          <Stat
            icon="wallet"
            label="Cafe cash"
            value={money(session.cash)}
            note={
              started && active
                ? `${money(day.operatingCost)} reserved for operating costs`
                : 'Funds for your next chapter'
            }
            color="green"
          />
          <Stat
            icon="package"
            label="Inventory value"
            value={money(inventoryValue(session.inventory))}
            note="Ingredients in stock, opportunities ahead"
            color="gold"
          />
          <Stat
            icon="users"
            label="Customers today"
            value={`${day.receipts.length}`}
            note="Happy customers served"
            color="rose"
          />
          <Stat
            icon="star"
            label="Cafe reputation"
            value={`${session.reputation} / 100`}
            note={
              session.reputation >= 75
                ? 'Becoming a favorite'
                : session.reputation >= 60
                  ? 'Getting noticed'
                  : 'A welcoming newcomer'
            }
            color="sage"
          />
        </section>
        <div className={`workspace-grid ${started && active ? 'serving-workspace' : ''}`}>
          <div className="cafe-column">
            <section className="cafe-card" aria-label="Interactive cafe">
              <div className="cafe-topline">
                <div>
                  <span className={`status-dot ${active && !store.paused ? 'live' : ''}`} />
                  {(active || day.phase === 'report') && (
                    <strong>{active ? 'Open doors, shared stories' : 'See you tomorrow'}</strong>
                  )}
                </div>
                <span>
                  <Icon name="clock" size={14} /> {gameTime(day.elapsed, day.duration)}
                </span>
              </div>
              <div className="scene-wrap">
                <PhaserHost />
                <div className={`scene-badge ${active ? 'open' : ''}`}>
                  <Icon name={active ? 'coffee' : 'leaf'} size={14} />
                  {active
                    ? day.phase === 'closing'
                      ? 'LAST ORDERS'
                      : 'CAFE OPEN'
                    : day.phase === 'report'
                      ? 'SEE YOU TOMORROW'
                      : 'BEFORE THE STORY BEGINS'}
                </div>
                {started && active && <CustomerBubbles />}
                {started && active && store.paused && (
                  <div className="paused-overlay">
                    <span>
                      <Icon name="pause" /> Time is paused
                    </span>
                    <button
                      className="button primary"
                      disabled={store.saveStatus === 'failed' || store.readOnly}
                      onClick={store.togglePause}
                    >
                      <Icon name="play" size={17} /> Resume
                    </button>
                  </div>
                )}
              </div>
              <div className="cafe-control">
                <div className="cafe-status-icon">
                  <Icon
                    name={active ? 'coffee' : day.phase === 'report' ? 'check' : 'sun'}
                    size={24}
                  />
                </div>
                <div className="cafe-control-copy">
                  <strong>{status}</strong>
                  <span>
                    {active
                      ? `${day.customers.length} orders waiting · ${Math.max(0, (day.phase === 'closing' ? day.closeAt : day.duration) - day.elapsed)} seconds remaining`
                      : day.phase === 'report'
                        ? profitVerified
                          ? `Business result today: ${money(report.profit)}`
                          : 'View your report to see how your cafe performed.'
                        : 'Prepare ingredients and prices, then welcome your first customer.'}
                  </span>
                </div>
                {started && day.phase === 'preparation' && (
                  <button
                    className="button primary"
                    disabled={!canOpen || store.readOnly || store.saveStatus === 'failed'}
                    onClick={() => store.dispatch({ type: 'open' })}
                  >
                    <Icon name="play" size={17} /> Open cafe
                  </button>
                )}
                {started && active && (
                  <div className="button-row">
                    <button
                      className="icon-button pause-control"
                      aria-label={store.paused ? 'Resume cafe' : 'Pause cafe'}
                      disabled={store.readOnly || store.saveStatus === 'failed'}
                      onClick={store.togglePause}
                    >
                      <Icon name={store.paused ? 'play' : 'pause'} size={18} />
                    </button>
                    <button
                      className="button secondary"
                      disabled={store.readOnly}
                      onClick={() =>
                        store.dispatch({ type: day.phase === 'open' ? 'close' : 'finish' })
                      }
                    >
                      {day.phase === 'open' ? 'Close cafe' : 'Finish day'}
                    </button>
                  </div>
                )}
                {started && day.phase === 'report' && (
                  <button className="button primary" onClick={() => openPanel('report')}>
                    View report
                    <Icon name="arrowRight" size={17} />
                  </button>
                )}
                {!started && (
                  <span className="small-decor">
                    <Icon name="sparkles" size={22} />
                  </span>
                )}
              </div>
              <div className="day-progress">
                <span style={{ width: `${Math.min(100, (day.elapsed / day.duration) * 100)}%` }} />
              </div>
            </section>
            {started && active && <CounterMenu />}
          </div>
          <aside className={`day-panel ${started && active ? 'serving-panel' : ''}`}>
            {!started ? (
              <>
                <span className="eyebrow">{store.session ? 'SAVED PROGRESS' : 'CHAPTER ONE'}</span>
                <h2>
                  {store.session ? (
                    'Continue your cafe'
                  ) : (
                    <>
                      Small cafe, <br />
                      big dreams.
                    </>
                  )}
                </h2>
                <p>
                  {store.session
                    ? `Your cafe is saved for day ${day.number}.`
                    : 'Your starting funds are ready. Now brew a business with a story of its own.'}
                </p>
                <div className="starting-capital">
                  <span>{store.session ? 'Saved cash' : 'Your starting capital'}</span>
                  <strong>{money(session.cash)}</strong>
                  <Icon name="coins" size={32} />
                </div>
                {!store.session && (
                  <ul className="welcome-list">
                    <li>
                      <Icon name="check" size={16} /> Buy and manage ingredients
                    </li>
                    <li>
                      <Icon name="check" size={16} /> Set your prices
                    </li>
                    <li>
                      <Icon name="check" size={16} /> Learn from your results
                    </li>
                  </ul>
                )}
                <button
                  className="button primary full"
                  disabled={store.readOnly}
                  onClick={() => store.start()}
                >
                  {store.session ? 'Continue your cafe' : 'Start your cafe'}
                  <Icon name="arrowRight" size={18} />
                </button>
                <small className="welcome-footnote">
                  Take your time. Learn through the choices you make.
                </small>
              </>
            ) : active ? (
              <ServiceCounter />
            ) : day.phase === 'report' ? (
              <>
                <h2>Daily summary</h2>
                <div
                  className={`day-result ${profitVerified && report.profit < 0 ? 'negative' : ''}`}
                >
                  {profitVerified && (
                    <>
                      <span>{report.profit < 0 ? 'Net loss' : 'Net profit'}</span>
                      <strong>{money(report.profit)}</strong>
                    </>
                  )}
                  <small>Customers served: {report.customers}</small>
                </div>
                <button className="button primary full" onClick={() => openPanel('report')}>
                  Open report
                  <Icon name="arrowRight" size={18} />
                </button>
              </>
            ) : (
              <>
                <h2>Prepare for today</h2>
                <p>
                  Stock your shelves, set prices &amp; menu items, read the guide, then open your
                  cafe!
                </p>
                <div className="checklist">
                  <Checklist
                    done={ready}
                    title="Stock your shelves"
                    description={
                      ready
                        ? 'Ingredients are ready for your drinks'
                        : 'Buy ingredients from the supplier'
                    }
                    onClick={() => openPanel('supplier')}
                  />
                  <Checklist
                    done={activeMenu > 0}
                    title="Prepare menu & prices"
                    description={`${activeMenu} active menu items · review their COGS`}
                    onClick={() => openPanel('pricing')}
                  />
                  <Checklist
                    done={session.cash >= day.operatingCost}
                    title="Guide"
                    description="Learn how to manage your cafe."
                    onClick={() => openPanel('help')}
                  />
                </div>
                <button
                  className="button primary full"
                  onClick={() => openPanel(ready ? 'pricing' : 'supplier')}
                >
                  <Icon name={ready ? 'coffee' : 'basket'} size={17} />
                  {ready ? 'Review menu & prices' : 'Shop for ingredients'}
                </button>
                <small className="welcome-footnote">
                  No time limit during preparation. Think it through.
                </small>
              </>
            )}
          </aside>
        </div>
        <section className={`menu-section ${started && active ? 'menu-after-service' : ''}`}>
          <div className="section-heading">
            <div>
              <h2>
                Today on the menu<span className="count-badge">3 drinks</span>
              </h2>
              <p>Turn simple ingredients into something special.</p>
            </div>
            <button className="text-button" onClick={() => openPanel('pricing')}>
              Manage menu & prices <Icon name="arrowRight" size={17} />
            </button>
          </div>
          <div className="product-grid">
            {productIds.map((id) => {
              const item = PRODUCTS[id];
              const portions = capacity(session.inventory, id);
              return (
                <article className="product-card" key={id}>
                  <div className="product-visual" style={{ background: `${item.color}17` }}>
                    <ProductArt id={id} />
                    <span className={`product-stock ${portions ? 'available' : ''}`}>
                      {!session.menu[id].active
                        ? 'Item disabled'
                        : portions
                          ? `${portions} servings available`
                          : 'Needs ingredients'}
                    </span>
                  </div>
                  <div className="product-info">
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <div className="product-price">
                      <strong>{money(quotePrice(session.menu[id]).net)}</strong>
                    </div>
                    {!!session.menu[id].discountPercent && (
                      <small className="promo-label">
                        Discount {session.menu[id].discountPercent}% · from{' '}
                        {money(session.menu[id].price)}
                      </small>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        {!store.lastReceipt && (
          <div className="bottom-note">
            <span className="round-icon">
              <Icon name="book" size={19} />
            </span>
            <div>
              <strong>Did you know?</strong>
              <p>
                Money spent on ingredients is not necessarily an expense today. Unsold stock still
                has value.
              </p>
            </div>
            <button className="text-button" onClick={() => openPanel('help')}>
              Learn more
              <Icon name="arrowRight" size={16} />
            </button>
          </div>
        )}
        <footer className="page-footer">
          <div className="mobile-tools">
            <button
              className="icon-button"
              aria-label="Open settings"
              onClick={() => openPanel('settings')}
            >
              <Icon name="settings" size={19} />
            </button>
            <button
              className="icon-button"
              aria-label="Game help"
              onClick={() => openPanel('help')}
            >
              <Icon name="book" size={19} />
            </button>
          </div>
        </footer>
      </main>
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          <Icon name={toast.error ? 'help' : 'check'} size={20} />
          <span>{toast.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => gameStore.setState({ toast: null })}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
      {panel && (
        <Modal
          title={panels[panel].title}
          eyebrow={panels[panel].eyebrow}
          onClose={() => store.openPanel(null)}
          wide={panel === 'pricing' || panel === 'supplier' || panel === 'promotion'}
        >
          {panel === 'supplier' && store.session && <SupplierPanel />}
          {panel === 'inventory' && store.session && <InventoryPanel />}
          {panel === 'pricing' && store.session && <PricingPanel />}
          {panel === 'promotion' && store.session && <PromotionPanel />}
          {panel === 'report' && store.session && <ReportPanel />}
          {panel === 'help' && <HelpPanel />}
          {panel === 'settings' && <SettingsPanel />}
        </Modal>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
  color,
}: {
  icon: IconName;
  label: string;
  value: string;
  note: string;
  color: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>
          <Icon name={icon} size={19} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function Checklist({
  done,
  title,
  description,
  onClick,
}: {
  done: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button className="checklist-item" onClick={onClick}>
      <span className={`check-circle ${done ? 'done' : ''}`}>
        {done ? <Icon name="check" size={15} /> : <span />}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <Icon name="chevron" size={14} />
    </button>
  );
}
