import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api";
import type { Analysis, ClimateEvent, Notification, Sources } from "./types";

interface Workspace {
  events: ClimateEvent[];
  event: ClimateEvent | null;
  analysis: Analysis | null;
  notifications: Notification[];
  sources: Sources | null;
  token: string;
  setToken: (v: string) => void;
  clientId: string;
  selectClient: (id: string) => void;
  selectEvent: (id: string) => void;
  openAnalysis: (id: string) => Promise<void>;
  busy: string;
  error: string;
  notice: string;
  gemini: boolean;
  refresh: () => Promise<void>;
  action: (
    name: string,
    fn: () => Promise<unknown>,
    notice?: string,
  ) => Promise<void>;
}
const EventContext = createContext<Workspace | null>(null);
export function EventProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<ClimateEvent[]>([]),
    [eventId, setEventId] = useState(""),
    [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]),
    [sources, setSources] = useState<Sources | null>(null),
    [token, setToken] = useState(""),
    [gemini, setGemini] = useState(false);
  const [busy, setBusy] = useState(""),
    [clientId, setClientId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const selected = useRef(""),
    pinned = useRef(""),
    generation = useRef(0),
    mounted = useRef(true),
    detailId = useRef(""),
    pending = useRef(false);
  useEffect(() => { setClientId(""); }, [analysis?.id]);
  const loadDetail = useCallback(async (id: string, followEvent = false) => {
    const seq = ++generation.current;
    const result = await api<Analysis>("/analyses/" + id);
    if (mounted.current && seq === generation.current) {
      if (followEvent) {
        selected.current = result.event_id;
        setEventId(result.event_id);
      }
      detailId.current = id;
      pending.current = ["QUEUED", "RUNNING"].includes(result.status);
      setAnalysis(result);
    }
  }, []);
  const refresh = useCallback(async () => {
    const [e, n] = await Promise.all([
      api<{ items: ClimateEvent[] }>("/events"),
      api<{ items: Notification[] }>("/notifications"),
    ]);
    if (!mounted.current) return;
    setEvents(e.items);
    setNotifications(n.items);
    const id = e.items.some((x) => x.id === selected.current)
      ? selected.current
      : (e.items[0]?.id ?? "");
    selected.current = id;
    setEventId(id);
    const run = pinned.current
      ? { id: pinned.current }
      : e.items.find((x) => x.id === id)?.analysis;
    if (run && (run.id !== detailId.current || pending.current))
      await loadDetail(run.id);
    if (!run) {
      generation.current++;
      detailId.current = "";
      pinned.current = "";
      pending.current = false;
      setAnalysis(null);
    }
  }, [loadDetail]);
  useEffect(() => {
    mounted.current = true;
    void Promise.all([
      refresh(),
      api<Sources>("/sources").then(setSources),
      api<{ gemini_configured: boolean }>("/health").then((h) =>
        setGemini(h.gemini_configured),
      ),
    ]).catch((e) => setError(e.message));
    const timer = setInterval(() => {
      void refresh().catch((e) => {
        if (mounted.current) setError(e.message);
      });
    }, 4000);
    return () => {
      mounted.current = false;
      generation.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  const selectEvent = useCallback(
    (id: string) => {
      generation.current++;
      detailId.current = "";
      pinned.current = "";
      pending.current = false;
      selected.current = id;
      setEventId(id);
      setAnalysis(null);
      setError("");
      const e = events.find((e) => e.id === id);
      if (e?.analysis)
        void loadDetail(e.analysis.id).catch((err) => setError(err.message));
    },
    [events, loadDetail],
  );
  async function action(
    name: string,
    fn: () => Promise<unknown>,
    message = "Operación registrada",
  ) {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await fn();
      if (detailId.current) await loadDetail(detailId.current);
      await refresh();
      setSources(await api<Sources>("/sources"));
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operación no disponible");
    } finally {
      setBusy("");
    }
  }
  return (
    <EventContext
      value={{
        events,
        event: events.find((e) => e.id === eventId) ?? null,
        analysis,
        notifications,
        sources,
        token,
        setToken,
        clientId,
        selectClient: setClientId,
        selectEvent,
        openAnalysis: async (id: string) => {
          pinned.current = id;
          await loadDetail(id, true);
        },
        busy,
        error,
        notice,
        gemini,
        refresh,
        action,
      }}
    >
      {children}
    </EventContext>
  );
}
export function useEvent() {
  const value = use(EventContext);
  if (!value) throw new Error("Falta contexto de evento");
  return value;
}
