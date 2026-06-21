'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer } from '@react-google-maps/api';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = {
  lat: 12.9716, // Bengaluru default
  lng: 77.5946,
};

// Premium Dark Luxury Maps Styling
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0f0f12' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f0f12' }, { weight: 2 }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#747480' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1f1f24' }],
  },
  {
    featureType: 'landscape',
    elementType: 'geometry',
    stylers: [{ color: '#08080a' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#131317' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8e8e93' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1c1c22' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#121216' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#2563eb' }, { opacity: 0.15 }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#141418' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#030305' }],
  },
];

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
}

export default function GoogleMapComponent({
  center = defaultCenter,
  zoom = 13,
  markers = [],
  pickupCoords = null,
  dropoffCoords = null,
  onMapClick,
}: GoogleMapComponentProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: ['places'],
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);

  const onLoad = useCallback(function callback(mapInstance: google.maps.Map) {
    setMap(mapInstance);
  }, []);

  const onUnmount = useCallback(function callback() {
    setMap(null);
  }, []);

  // Fetch routing directions between pickup and dropoff
  useEffect(() => {
    if (!isLoaded || !pickupCoords || !dropoffCoords) {
      setDirections(null);
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: pickupCoords,
        destination: dropoffCoords,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirections(result);
        } else {
          console.error(`error fetching directions ${result}`);
        }
      }
    );
  }, [isLoaded, pickupCoords, dropoffCoords]);

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (onMapClick && e.latLng) {
      onMapClick({
        lat: e.latLng.lat(),
        lng: e.latLng.lng(),
      });
    }
  };

  const getMarkerIcon = (type?: 'passenger' | 'driver' | 'destination') => {
    if (!isLoaded) return undefined;
    
    switch (type) {
      case 'driver':
        return {
          path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
          fillColor: '#FFB800', // Taxi Yellow
          fillOpacity: 1,
          strokeColor: '#050505',
          strokeWeight: 2,
          scale: 1.5,
          anchor: new window.google.maps.Point(12, 22),
        };
      case 'passenger':
        return {
          path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
          fillColor: '#2563EB', // Royal Blue
          fillOpacity: 1,
          strokeColor: '#050505',
          strokeWeight: 2,
          scale: 1.5,
          anchor: new window.google.maps.Point(12, 22),
        };
      case 'destination':
        return {
          path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
          fillColor: '#FF3B30', // Red
          fillOpacity: 1,
          strokeColor: '#050505',
          strokeWeight: 2,
          scale: 1.5,
          anchor: new window.google.maps.Point(12, 22),
        };
      default:
        return undefined;
    }
  };

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#050505] text-[#8E8E93] border border-border rounded-xl">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Loading Google Maps Interface...</p>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      zoom={zoom}
      onLoad={onLoad}
      onUnmount={onUnmount}
      onClick={handleMapClick}
      options={{
        styles: darkMapStyle,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
      }}
    >
      {directions && (
        <DirectionsRenderer
          directions={directions}
          options={{
            polylineOptions: {
              strokeColor: '#2563EB', // Royal Blue route path
              strokeWeight: 5,
              strokeOpacity: 0.8,
            },
            markerOptions: {
              visible: false, // Hide default marker flags (we draw custom ones)
            },
          }}
        />
      )}

      {/* Render Pickup & Dropoff Custom Pins if directions not rendered */}
      {!directions && pickupCoords && (
        <Marker
          position={pickupCoords}
          icon={getMarkerIcon('passenger')}
          title="Pickup Location"
        />
      )}
      {!directions && dropoffCoords && (
        <Marker
          position={dropoffCoords}
          icon={getMarkerIcon('destination')}
          title="Destination Location"
        />
      )}

      {/* Render live drivers and other map markers */}
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          position={marker.position}
          title={marker.title}
          icon={getMarkerIcon(marker.iconType)}
        />
      ))}
    </GoogleMap>
  );
}
