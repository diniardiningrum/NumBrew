import { createStore } from 'zustand/vanilla';
import { createSession, dispatchCommand, type Command } from '../application/commands';
import { readSave, writeSave, type SaveEnvelope } from '../infrastructure/persistence/save';
import type { Receipt, ServiceReaction, Session } from '../domain/types';

export type Panel =
  'supplier' | 'inventory' | 'pricing' | 'promotion' | 'report' | 'help' | 'settings' | null;
interface Store {
  session: Session | null;
  checkpoint: Session | null;
  panel: Panel;
  paused: boolean;
  started: boolean;
  hydrated: boolean;
  readOnly: boolean;
  reducedMotion: boolean;
  musicEnabled: boolean;
  saveStatus: 'saved' | 'failed' | 'memory';
  savedAt: string | null;
  warning: string;
  toast: { text: string; error: boolean; id: number } | null;
  lastReceipt: Receipt | null;
  selectedCustomerId: string | null;
  lastReaction: ServiceReaction | null;
  selectCustomer: (id: string) => void;
  dispatch: (command: Command) => boolean;
  start: (reset?: boolean) => void;
  openPanel: (panel: Panel) => void;
  togglePause: () => void;
  save: () => void;
  retryDay: () => void;
  setReducedMotion: (value: boolean) => void;
  setMusicEnabled: (value: boolean) => void;
  continueInMemory: () => void;
}

export const gameStore = createStore<Store>((set, get) => ({
  session: null,
  checkpoint: null,
  panel: null,
  paused: true,
  started: false,
  hydrated: false,
  readOnly: false,
  reducedMotion: false,
  musicEnabled: true,
  saveStatus: 'saved',
  savedAt: null,
  warning: '',
  toast: null,
  lastReceipt: null,
  selectedCustomerId: null,
  lastReaction: null,
  selectCustomer: (id) => {
    if (get().session?.day.customers.some((c) => c.id === id)) set({ selectedCustomerId: id });
  },
  dispatch: (command) => {
    const current = get();
    if (
      !current.session ||
      current.readOnly ||
      (current.saveStatus === 'failed' && command.type !== 'tutorial')
    )
      return false;
    if (
      command.type === 'tick' &&
      (!current.started || current.paused || current.panel || document.hidden)
    )
      return false;
    if (
      ['ask', 'offer', 'change_order', 'brew', 'serve'].includes(command.type) &&
      (current.paused || current.panel || !current.started)
    )
      return false;
    const result = dispatchCommand(current.session, command);
    if (result.error) {
      set({ toast: { text: result.message, error: true, id: Date.now() } });
      return false;
    }
    if (result.state === current.session) return true;
    const ended = result.state.day.phase === 'report' && current.session.day.phase !== 'report';
    set({
      session: result.state,
      selectedCustomerId: result.state.day.customers.some(
        (c) => c.id === current.selectedCustomerId,
      )
        ? current.selectedCustomerId
        : (result.state.day.customers[0]?.id ?? null),
      ...(result.reaction ? { lastReaction: result.reaction } : {}),
      ...(command.type === 'next'
        ? { checkpoint: structuredClone(result.state), panel: null }
        : {}),
      ...(command.type === 'open' ? { paused: false, panel: null } : {}),
      ...(ended ? { paused: true, panel: 'report' as Panel } : {}),
      ...(result.receipt ? { lastReceipt: result.receipt } : {}),
      ...(result.message ? { toast: { text: result.message, error: false, id: Date.now() } } : {}),
    });
    if (command.type !== 'tick' || result.state.day.elapsed % 5 === 0 || ended) get().save();
    return true;
  },
  start: (reset = false) => {
    if (get().readOnly) return;
    const current = get();
    const session = reset || !current.session ? createSession(Date.now() >>> 0) : current.session;
    const checkpoint = reset || !current.checkpoint ? structuredClone(session) : current.checkpoint;
    set({
      session,
      checkpoint,
      started: true,
      paused: true,
      panel: null,
      warning: '',
      lastReceipt: session.day.receipts.at(-1) ?? null,
      selectedCustomerId: session.day.customers[0]?.id ?? null,
      lastReaction: null,
    });
    get().save();
  },
  openPanel: (panel) => set({ panel }),
  togglePause: () => {
    const state = get();
    if (state.started && !state.readOnly && state.saveStatus !== 'failed')
      set({ paused: !state.paused });
  },
  save: () => {
    const s = get();
    if (!s.session || !s.checkpoint || s.readOnly || s.saveStatus === 'memory') return;
    try {
      const envelope: SaveEnvelope = {
        version: 1,
        savedAt: new Date().toISOString(),
        session: s.session,
        checkpoint: s.checkpoint,
        reducedMotion: s.reducedMotion,
        musicEnabled: s.musicEnabled,
      };
      writeSave(localStorage, envelope);
      set({ saveStatus: 'saved', savedAt: envelope.savedAt, warning: '' });
    } catch {
      set({
        saveStatus: 'failed',
        paused: true,
        warning:
          'Progress has not been saved. Try saving again or choose to continue without saving in Settings.',
      });
    }
  },
  retryDay: () => {
    if (!get().checkpoint || get().readOnly) return;
    const session = structuredClone(get().checkpoint!);
    set({
      session,
      paused: true,
      panel: null,
      lastReceipt: null,
      selectedCustomerId: null,
      lastReaction: null,
      toast: {
        text: 'Returned to the start of preparation. Transactions made today have been undone.',
        error: false,
        id: Date.now(),
      },
    });
    get().save();
  },
  setReducedMotion: (reducedMotion) => {
    set({ reducedMotion });
    get().save();
  },
  setMusicEnabled: (musicEnabled) => {
    set({ musicEnabled });
    get().save();
  },
  continueInMemory: () =>
    set({
      saveStatus: 'memory',
      warning: 'This session is not being saved. Progress will be lost when the page closes.',
    }),
}));

export function hydrateGame(): void {
  try {
    const { data, warning } = readSave(localStorage);
    gameStore.setState({
      session: data?.session ?? null,
      checkpoint: data?.checkpoint ?? null,
      reducedMotion:
        data?.reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      musicEnabled: data?.musicEnabled ?? true,
      warning,
      savedAt: data?.savedAt ?? null,
      hydrated: true,
      lastReceipt: data?.session.day.receipts.at(-1) ?? null,
    });
  } catch {
    gameStore.setState({
      hydrated: true,
      saveStatus: 'failed',
      warning: 'Browser storage is unavailable. You can play without saving.',
    });
  }
}

export function startRuntime(): () => void {
  let release: (() => void) | undefined;
  let stopped = false;
  if (navigator.locks) {
    // A second tab can inspect the game but cannot overwrite another tab's progress.
    gameStore.setState({ readOnly: true });
    void navigator.locks.request('numbrew-writer', { ifAvailable: true }, async (lock) => {
      if (!lock || stopped) return;
      gameStore.setState({ readOnly: false });
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
  }
  const timer = window.setInterval(() => gameStore.getState().dispatch({ type: 'tick' }), 1000);
  const visibility = () => {
    if (document.hidden) {
      gameStore.setState({ paused: true });
      gameStore.getState().save();
    }
  };
  document.addEventListener('visibilitychange', visibility);
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', visibility);
    release?.();
  };
}
