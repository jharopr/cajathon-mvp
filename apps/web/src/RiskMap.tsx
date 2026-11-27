import { useEffect, useRef, useState } from "react";
import type { Map as MapType, GeoJSONSource } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Client } from "./app/types";
import { api } from "./api";

export default function RiskMap({
  eventId,
  mode,
  items,
  selected,
  onSelect,
}: {
  eventId: string;
  mode: string;
  items: Client[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<MapType | null>(null),
    data = useRef(items),
    selection = useRef(selected),
    choose = useRef(onSelect);
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  data.current = items;
  selection.current = selected;
  choose.current = onSelect;
  const points = () => ({
    type: "FeatureCollection" as const,
    features: data.current
      .filter((c) => c.location)
      .map((c) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: c.location! },
        properties: {
          id: c.business_id,
          priority: c.priority,
          selected: c.business_id === selection.current,
        },
      })),
  });
  useEffect(() => {
    let disposed = false;
    setReady(false);
    setError("");
    void Promise.all([
      import("maplibre-gl"),
      api<GeoJSON.FeatureCollection>("/events/" + eventId + "/geometry"),
    ])
      .then(([lib, geometry]) => {
        if (disposed || !container.current) return;
        try {
          lib.setWorkerUrl(workerUrl);
          const m = new lib.Map({
            container: container.current,
            center: [-79.035, -8.11],
            zoom: 11,
            attributionControl: false,
            style: {
              version: 8,
              sources: {
                base: {
                  type: "raster",
                  tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                  tileSize: 256,
                  attribution: "© OpenStreetMap contributors",
                },
              },
              layers: [
                {
                  id: "background",
                  type: "background",
                  paint: { "background-color": "#e4ecee" },
                },
                {
                  id: "base",
                  type: "raster",
                  source: "base",
                  paint: { "raster-saturation": -0.8, "raster-opacity": 0.65 },
                },
              ],
            },
          });
          map.current = m;
          m.addControl(
            new lib.NavigationControl({ showCompass: false }),
            "top-right",
          );
          m.addControl(
            new lib.AttributionControl({
              compact: true,
              customAttribution:
                mode === "SYNTHETIC"
                  ? "Evento ficticio"
                  : "Área SENAMHI; cartera ficticia",
            }),
            "bottom-right",
          );
          m.on("error", () =>
            setError(
              "Mapa base no disponible. La tabla y los vectores siguen disponibles.",
            ),
          );
          m.on("load", () => {
            if (disposed) return;
            m.addSource("event", { type: "geojson", data: geometry });
            m.addLayer({
              id: "event-fill",
              type: "fill",
              source: "event",
              paint: { "fill-color": "#d5b571", "fill-opacity": 0.18 },
            });
            m.addLayer({
              id: "event-boundary",
              type: "line",
              source: "event",
              paint: {
                "line-color": "#91632b",
                "line-width": 2,
                "line-dasharray": [4, 2],
              },
            });
            m.addSource("clients", { type: "geojson", data: points() });
            m.addLayer({
              id: "clients",
              type: "circle",
              source: "clients",
              paint: {
                "circle-radius": [
                  "case",
                  ["boolean", ["get", "selected"], false],
                  9,
                  4.5,
                ],
                "circle-color": [
                  "match",
                  ["get", "priority"],
                  "ALTA",
                  "#bc3d36",
                  "MEDIA",
                  "#9a5b08",
                  "BAJA",
                  "#147d64",
                  "#697c87",
                ],
                "circle-stroke-width": 1.4,
                "circle-stroke-color": "#fff",
              },
            });
            m.on("click", "clients", (e) => {
              const id = e.features?.[0]?.properties?.id;
              if (id) choose.current(id);
            });
            const locations = data.current
              .filter((c) => c.location)
              .map((c) => c.location!);
            if (locations.length > 1)
              m.fitBounds(
                [
                  [
                    Math.min(...locations.map((p) => p[0])),
                    Math.min(...locations.map((p) => p[1])),
                  ],
                  [
                    Math.max(...locations.map((p) => p[0])),
                    Math.max(...locations.map((p) => p[1])),
                  ],
                ],
                { padding: 50, animate: false, maxZoom: 13 },
              );
            setReady(true);
          });
        } catch {
          setError("WebGL no disponible. Utilice la tabla de clientes.");
        }
      })
      .catch(() => {
        if (!disposed)
          setError("No se pudo cargar el mapa. Utilice la tabla de clientes.");
      });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, [eventId, mode]);
  useEffect(() => {
    const source = map.current?.getSource("clients") as
      | GeoJSONSource
      | undefined;
    source?.setData(points());
  }, [items, selected]);
  return (
    <section className="map-frame">
      <div
        ref={container}
        className="map-canvas"
        data-map-ready={ready}
        role="region"
        aria-label="Mapa de clientes ficticios y alcance del evento"
      />
      <div className="map-title">
        Trujillo ·{" "}
        {mode === "REPLAY"
          ? "Aviso reproducido"
          : mode === "SYNTHETIC"
            ? "Evento ficticio"
            : "Aviso oficial"}
      </div>
      <div className="map-legend">
        Prioridad operativa: <span>Alta o crítica</span>
        <span>Media</span>
        <span>Baja</span>
        <span>Revisar</span>
      </div>
      {error && (
        <p role="status" className="map-warning">
          {error}
        </p>
      )}
    </section>
  );
}
