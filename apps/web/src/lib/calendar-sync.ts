export type CalendarSyncProvider = "google" | "apple" | "caldav";

export type CalendarSyncEvent = {
  title: string;
  startIso: string;
  durationMinutes: number;
  recurrenceRule?: string | null;
  externalCalendarId?: string | null;
};

export interface CalendarSyncAdapter {
  provider: CalendarSyncProvider;
  syncEvent(event: CalendarSyncEvent): Promise<{ externalCalendarId: string }>;
  deleteEvent(externalCalendarId: string): Promise<void>;
}

/**
 * Google Calendar sync using OAuth2 access token from Supabase.
 *
 * To connect:
 *   1. Call supabase.auth.linkIdentity({ provider: 'google', options: { scopes: 'https://www.googleapis.com/auth/calendar.events' } })
 *   2. After linking, supabase.auth.getSession() will have provider_token for Google
 *
 * Alternatively, the access token can be refreshed via:
 *   supabase.auth.getSession() → session.provider_token
 */
export class GoogleCalendarSync implements CalendarSyncAdapter {
  provider: CalendarSyncProvider = "google";

  constructor(private accessToken: string) {}

  async syncEvent(event: CalendarSyncEvent): Promise<{ externalCalendarId: string }> {
    const startDate = new Date(event.startIso);
    const endDate = new Date(startDate.getTime() + event.durationMinutes * 60_000);

    const body: Record<string, unknown> = {
      summary: event.title,
      start: { dateTime: startDate.toISOString() },
      end: { dateTime: endDate.toISOString() },
    };

    if (event.recurrenceRule) {
      body.recurrence = [`RRULE:${event.recurrenceRule}`];
    }

    // Update existing event if externalCalendarId provided
    if (event.externalCalendarId) {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.externalCalendarId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Google Calendar update failed: ${res.status} ${errBody}`);
      }
      const data = (await res.json()) as { id: string };
      return { externalCalendarId: data.id };
    }

    // Create new event
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Google Calendar create failed: ${res.status} ${errBody}`);
    }
    const data = (await res.json()) as { id: string };
    return { externalCalendarId: data.id };
  }

  async deleteEvent(externalCalendarId: string): Promise<void> {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${externalCalendarId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.accessToken}` },
      },
    );
    // 410 Gone is OK (already deleted)
    if (!res.ok && res.status !== 410) {
      throw new Error(`Google Calendar delete failed: ${res.status}`);
    }
  }
}

export class AppleCalendarSync implements CalendarSyncAdapter {
  provider: CalendarSyncProvider = "apple";

  async syncEvent(_: CalendarSyncEvent): Promise<{ externalCalendarId: string }> {
    throw new Error("Apple Calendar sync not implemented yet — use iCal feed subscription instead");
  }

  async deleteEvent(_: string): Promise<void> {
    throw new Error("Apple Calendar sync not implemented yet — use iCal feed subscription instead");
  }
}

export class CalDavSync implements CalendarSyncAdapter {
  provider: CalendarSyncProvider = "caldav";

  async syncEvent(_: CalendarSyncEvent): Promise<{ externalCalendarId: string }> {
    throw new Error("CalDAV sync not implemented yet — use iCal feed subscription instead");
  }

  async deleteEvent(_: string): Promise<void> {
    throw new Error("CalDAV sync not implemented yet — use iCal feed subscription instead");
  }
}
