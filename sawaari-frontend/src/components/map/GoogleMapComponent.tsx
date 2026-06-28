'use client';

import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Import CSS inside dynamic loader context or layouts
const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '22px',
  border: 'none',
  background: '#090909',
};

const defaultCenter: [number, number] = [12.9716, 77.5946];

// Custom Leaflet Icons builder using inline SVGs to match Sawaari premium style
const getCustomIcon = (type: 'passenger' | 'driver' | 'destination') => {
  let color = '#2563EB'; // Passenger: Royal Blue
  if (type === 'driver') color = '#FACC15'; // Driver: Warm Yellow
  if (type === 'destination') color = '#EF4444'; // Destination: Danger/Red

  const svgHtml = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="${color}" stroke="#090909" stroke-width="1.5">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-leaflet-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  });
};

interface MapMarker {
  id: string;
  position: { lat: number; lng: number };
  title?: string;
  iconType?: 'passenger' | 'driver' | 'destination';
}

interface GoogleMapComponentProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  pickupCoords?: { lat: number; lng: number } | null;
  dropoffCoords?: { lat: number; lng: number } | null;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  hasActiveRide?: boolean;
}

// MapView management component to update view when center or zoom changes
function ChangeMapView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

// MapView management component to auto-fit bounds containing pickup & dropoff coordinates
function FitBoundsView({ pickup, dropoff }: { pickup: [number, number] | null; dropoff: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pickup && dropoff) {
      map.fitBounds([pickup, dropoff], { padding: [50, 50] });
    }
  }, [pickup, dropoff, map]);
  return null;
}

// Map events handler to propagate clicks back to parent dashboard
function MapClickHandler({ onClick }: { onClick?: (coords: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      if (onClick) {
        onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return null;
}

export default function GoogleMapComponent({
  center = { lat: 12.9716, lng: 77.5946 },
  zoom = 13,
  markers = [],
  pickupCoords = null,
  dropoffCoords = null,
  onMapClick,
  hasActiveRide = true,
}: GoogleMapComponentProps) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);

  const centerTuple: [number, number] = [center.lat, center.lng];
  const pickupTuple: [number, number] | null = pickupCoords ? [pickupCoords.lat, pickupCoords.lng] : null;
  const dropoffTuple: [number, number] | null = dropoffCoords ? [dropoffCoords.lat, dropoffCoords.lng] : null;

  console.log(`[GoogleMapComponent] Render: center=${JSON.stringify(center)}, markers=${JSON.stringify(markers)}, pickupCoords=${JSON.stringify(pickupCoords)}, dropoffCoords=${JSON.stringify(dropoffCoords)}`);

  // Fetch routing directions between pickup and dropoff coordinates using OSRM
  useEffect(() => {
    console.log(`[GoogleMapComponent] Route calculation triggered: pickupCoords=${JSON.stringify(pickupCoords)}, dropoffCoords=${JSON.stringify(dropoffCoords)}, hasActiveRide=${hasActiveRide}`);
    if (!pickupCoords || !dropoffCoords || hasActiveRide === false) {
      setRouteCoords([]);
      return;
    }

    const fetchOSRMRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${pickupCoords.lng},${pickupCoords.lat};${dropoffCoords.lng},${dropoffCoords.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('OSRM route query failed');
        const data = await res.json();
        
        if (data.routes && data.routes.length > 0) {
          // OSRM lists coords in [lng, lat]; Leaflet expects [lat, lng]
          const points = data.routes[0].geometry.coordinates.map(
            (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
          );
          setRouteCoords(points);
        }
      } catch (err) {
        console.error('Failed to resolve OSRM route:', err);
      }
    };

    fetchOSRMRoute();
  }, [pickupCoords, dropoffCoords, hasActiveRide]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapContainer
        center={centerTuple}
        zoom={zoom}
        style={mapContainerStyle}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />

        <ChangeMapView center={centerTuple} zoom={zoom} />
        <FitBoundsView pickup={pickupTuple} dropoff={dropoffTuple} />
        <MapClickHandler onClick={onMapClick} />

        {/* Draw Route Polyline */}
        {routeCoords.length > 0 && (
          <Polyline
            positions={routeCoords}
            color="#2563EB"
            weight={5}
            opacity={0.8}
          />
        )}

        {/* Active Markers (Driver live location, passenger, destination, etc.) */}
        {markers.map((marker) => {
          const markerPos: [number, number] = [marker.position.lat, marker.position.lng];
          return (
            <Marker
              key={marker.id}
              position={markerPos}
              icon={getCustomIcon(marker.iconType || 'passenger')}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
