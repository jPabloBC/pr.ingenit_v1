import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

interface MapProps {
  latitude: number;
  longitude: number;
}

const containerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '16px', // Added rounded border to the map container
  overflow: 'hidden', // Ensures the rounded corners are visible
};

const customIcon = L.icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  shadowSize: [41, 41],
  shadowAnchor: [12, 41],
});

const Map: React.FC<MapProps> = ({ latitude, longitude }) => {
  useEffect(() => {
    console.log('Map coordinates:', { latitude, longitude });
  }, [latitude, longitude]);

  const position = [latitude, longitude];

  return (
    <div style={containerStyle}>
      <MapContainer
        center={position as L.LatLngExpression}
        zoom={15}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position as L.LatLngExpression} icon={customIcon} />
      </MapContainer>
    </div>
  );
};

export default Map;