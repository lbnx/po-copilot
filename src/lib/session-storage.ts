import type { UiMessage } from "@/components/ChatPanel";
import {
  createEmptyDocuments,
  type TechDocument,
} from "@/lib/documents";

export const SESSION_STORAGE_KEY = "po-copilot-session-v1";

export type PersistedSession = {
  version: 1;
  messages: UiMessage[];
  documents: TechDocument[];
  savedAt: string;
};

export function loadSession(): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.messages)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: {
  messages: UiMessage[];
  documents: TechDocument[];
}): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedSession = {
      version: 1,
      messages: session.messages,
      documents: session.documents,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota or private mode — ignore
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function createFreshDocuments(): TechDocument[] {
  return createEmptyDocuments();
}
