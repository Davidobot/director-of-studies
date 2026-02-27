export type CalendarSyncProvider = "google" | "apple" | "caldav";

export type CalendarSyncEvent = {
  title: string;
  startIso: string;
  durationMinutes: number;
  recurrenceRule?: string | null;
};

export interface CalendarSyncAdapter {
  provider: CalendarSyncProvider;
  syncEvent(event: CalendarSyncEvent): Promise<{ externalCalendarId: string }>;
}

export class GoogleCalendarSync implements CalendarSyncAdapter {
  provider: CalendarSyncProvider = "google";

  async syncEvent(_: CalendarSyncEvent): Promise<{ externalCalendarId: string }> {
    throw new Error("Google Calendar sync not implemented yet");
  }
}

export class AppleCalendarSync implements CalendarSyncAdapter {
  provider: CalendarSyncProvider = "apple";

  async syncEvent(_: CalendarSyncEvent): Promise<{ externalCalendarId: string }> {
    throw new Error("Apple Calendar sync not implemented yet");
  }
}

export class CalDavSync implements CalendarSyncAdapter {
  provider: CalendarSyncProvider = "caldav";

  async syncEvent(_: CalendarSyncEvent): Promise<{ externalCalendarId: string }> {
    throw new Error("CalDAV sync not implemented yet");
  }
}
