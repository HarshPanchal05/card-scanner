import { create } from 'zustand';
import type { EventRow } from '../types/models';
import { initializeApp } from './appInit';
import { listEvents, setDefaultEvent as persistDefaultEvent } from '../repositories/eventsRepo';

interface EventStoreState {
  ready: boolean;
  currentEvent: EventRow | null;
  events: EventRow[];
  error: string | null;
  bootstrap: () => Promise<void>;
  refreshEvents: () => Promise<void>;
  selectEvent: (event: EventRow) => Promise<void>;
}

export const useEventStore = create<EventStoreState>((set, get) => ({
  ready: false,
  currentEvent: null,
  events: [],
  error: null,

  bootstrap: async () => {
    try {
      const defaultEvent = await initializeApp();
      const events = await listEvents();
      set({ currentEvent: defaultEvent, events, ready: true, error: null });
    } catch (err: any) {
      set({ ready: true, error: err?.message ?? 'Failed to initialize the app.' });
    }
  },

  refreshEvents: async () => {
    const events = await listEvents();
    set({ events });
  },

  selectEvent: async (event: EventRow) => {
    await persistDefaultEvent(event.id);
    set({ currentEvent: event });
    await get().refreshEvents();
  },
}));
