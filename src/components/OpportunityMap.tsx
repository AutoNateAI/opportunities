'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LAYER_META, Opportunity, OpportunityLayer, Region } from '@/lib/opportunities';

type Props = {
  region: Region;
  opportunities: Opportunity[];
  selectedId?: string;
  onSelect: (opportunity: Opportunity) => void;
};

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

function featureCollection(opportunities: Opportunity[]) {
  return {
    type: 'FeatureCollection' as const,
    features: opportunities.map((opportunity) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [opportunity.lng, opportunity.lat] },
      properties: {
        id: opportunity.id,
        title: opportunity.title,
        target: opportunity.target,
        layer: opportunity.layer,
        score: opportunity.score,
        value: opportunity.value,
        probability: opportunity.probability,
        color: LAYER_META[opportunity.layer].color,
      },
    })),
  };
}

export default function OpportunityMap({ region, opportunities, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const markerRefs = useRef<maplibregl.Marker[]>([]);
  const dataRef = useRef(opportunities);
  const onSelectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);
  const [mapReady, setMapReady] = useState(false);

  const selected = useMemo(() => opportunities.find((item) => item.id === selectedId), [opportunities, selectedId]);

  useEffect(() => {
    dataRef.current = opportunities;
  }, [opportunities]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    setMapReady(false);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [region.lng, region.lat],
      zoom: 7.4,
      minZoom: 1.5,
      maxZoom: 18,
      pitch: 38,
      bearing: -10,
      attributionControl: false,
      dragPan: true,
      dragRotate: true,
      touchZoomRotate: true,
      pitchWithRotate: true,
      keyboard: true,
    });

    map.on('load', () => {
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true, visualizePitch: true }), 'top-right');
      try {
        (map as any).setProjection({ type: 'globe' });
      } catch {}
      map.addSource('opportunities', { type: 'geojson', data: EMPTY_FC });
      map.addSource('region-radius', { type: 'geojson', data: EMPTY_FC });

      map.addLayer({
        id: 'region-radius-fill',
        type: 'fill',
        source: 'region-radius',
        paint: {
          'fill-color': '#0ea5e9',
          'fill-opacity': 0.08,
        },
      });
      map.addLayer({
        id: 'region-radius-line',
        type: 'line',
        source: 'region-radius',
        paint: {
          'line-color': '#38bdf8',
          'line-opacity': 0.55,
          'line-width': 1.4,
        },
      });
      map.addLayer({
        id: 'opportunity-glow',
        type: 'circle',
        source: 'opportunities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'score'], 40, 10, 100, 30],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.16,
          'circle-blur': 0.7,
        },
      });
      map.addLayer({
        id: 'opportunity-points',
        type: 'circle',
        source: 'opportunities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'score'], 40, 10, 100, 18],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#f8fafc',
          'circle-stroke-width': ['case', ['==', ['get', 'id'], selectedIdRef.current || ''], 2.5, 0.8],
          'circle-opacity': 0.12,
        },
      });
      map.addLayer({
        id: 'opportunity-labels',
        type: 'symbol',
        source: 'opportunities',
        minzoom: 9,
        layout: {
          'text-field': ['get', 'target'],
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-max-width': 14,
        },
        paint: {
          'text-color': '#e5e7eb',
          'text-halo-color': '#020617',
          'text-halo-width': 1.2,
        },
      });

      map.on('click', 'opportunity-points', (event) => {
        const id = event.features?.[0]?.properties?.id;
        const opportunity = dataRef.current.find((item) => item.id === id);
        if (opportunity) onSelectRef.current(opportunity);
      });
      map.on('mouseenter', 'opportunity-points', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'opportunity-points', () => {
        map.getCanvas().style.cursor = '';
      });

      (map.getSource('opportunities') as maplibregl.GeoJSONSource | undefined)?.setData(featureCollection(dataRef.current));
      (map.getSource('region-radius') as maplibregl.GeoJSONSource | undefined)?.setData(radiusPolygon(region.lat, region.lng, region.radiusMiles));
      map.flyTo({ center: [region.lng, region.lat], zoom: region.zoom, pitch: 48, bearing: -18, duration: 900 });
      setMapReady(true);
    });

    return () => {
      setMapReady(false);
      popupRef.current?.remove();
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [region.lat, region.lng, region.radiusMiles, region.zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [region.lng, region.lat], zoom: region.zoom, pitch: 48, bearing: -18, duration: 1200 });
  }, [region]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;
    const source = map.getSource('opportunities') as maplibregl.GeoJSONSource | undefined;
    source?.setData(featureCollection(opportunities));
    const radius = radiusPolygon(region.lat, region.lng, region.radiusMiles);
    (map.getSource('region-radius') as maplibregl.GeoJSONSource | undefined)?.setData(radius);
    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = opportunities.slice(0, 620).map((opportunity) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `opportunity-marker ${opportunity.id === selectedId ? 'opportunity-marker--selected' : ''}`;
      element.style.setProperty('--marker-color', LAYER_META[opportunity.layer].color);
      element.innerHTML = markerSvg(opportunity.layer);
      element.title = opportunity.title;
      element.addEventListener('click', () => onSelectRef.current(opportunity));
      return new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat([opportunity.lng, opportunity.lat])
        .addTo(map);
    });
  }, [mapReady, opportunities, region, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selected) return;
    if (map.getLayer('opportunity-points')) {
      map.setPaintProperty('opportunity-points', 'circle-stroke-width', ['case', ['==', ['get', 'id'], selected.id], 2.5, 0.8]);
    }
    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ className: 'opportunity-popup', closeButton: true, closeOnClick: false, maxWidth: '360px', offset: 16 })
      .setLngLat([selected.lng, selected.lat])
      .setHTML(`<div class="map-popup"><div class="map-popup-kicker">${LAYER_META[selected.layer].label} · Score ${selected.score}</div><strong>${escapeHtml(selected.title)}</strong><p>${escapeHtml(selected.nextStep)}</p></div>`)
      .addTo(map);
  }, [mapReady, selected]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function markerSvg(layer: OpportunityLayer) {
  const paths: Record<OpportunityLayer, string> = {
    chamber: '<path d="M5 9h14v10H5z"/><path d="M9 9V6h6v3"/><path d="M5 13h14"/><path d="M12 12v2"/>',
    events: '<rect x="5" y="6" width="14" height="13" rx="2"/><path d="M8 4v4M16 4v4M5 10h14"/><path d="M8 14h2M12 14h2M16 14h1M8 17h2M12 17h2"/>',
    grants: '<path d="M12 3l2.1 5.6L20 9l-4.5 3.7L17 19l-5-3.4L7 19l1.5-6.3L4 9l5.9-.4z"/>',
    housing: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
    workforce: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3.5 19c.8-3.2 3-5 6-5M20.5 19c-.8-3.2-3-5-6-5"/><path d="M9 19h6"/>',
    education: '<path d="M3 8l9-4 9 4-9 4z"/><path d="M7 10v5c2.5 2 7.5 2 10 0v-5"/><path d="M21 8v6"/>',
    university: '<path d="M4 10h16"/><path d="M5 10l7-5 7 5"/><path d="M7 10v8M11 10v8M15 10v8M19 10v8"/><path d="M4 20h16"/>',
    health: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.7A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/><path d="M12 8v7M8.5 11.5h7"/>',
    faith: '<path d="M12 3v18"/><path d="M8 7h8"/><path d="M6 21c1.5-4 10.5-4 12 0"/>',
    power: '<path d="M12 3l8 4v4c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V7z"/><path d="M9 12h6M12 9v6"/>',
    airport: '<path d="M12 3l2 7 6 3v2l-5-1-1 6h-4l-1-6-5 1v-2l6-3z"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[layer]}</svg>`;
}

function radiusPolygon(lat: number, lng: number, miles: number) {
  const coordinates: [number, number][] = [];
  const earthMiles = 3958.8;
  const latRad = lat * Math.PI / 180;
  for (let i = 0; i <= 96; i++) {
    const bearing = (i / 96) * Math.PI * 2;
    const d = miles / earthMiles;
    const pointLat = Math.asin(Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(bearing));
    const pointLng = lng * Math.PI / 180 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(latRad), Math.cos(d) - Math.sin(latRad) * Math.sin(pointLat));
    coordinates.push([pointLng * 180 / Math.PI, pointLat * 180 / Math.PI]);
  }
  return { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [coordinates] } }] };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}
