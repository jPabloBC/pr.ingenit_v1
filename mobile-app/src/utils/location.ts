import * as Location from 'expo-location';
import axios from 'axios';

export async function getCurrentLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permiso de ubicación denegado');
    }
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (e) {
    return { latitude: null, longitude: null };
  }
}

export async function getAddressFromCoordinates(latitude: number, longitude: number): Promise<string> {
  try {
    const url = `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}`;

    const response = await axios.get(url);

    if (response.data && response.data.features && response.data.features.length > 0) {
      const properties = response.data.features[0].properties;
      const street = properties.street || '';
      const housenumber = properties.housenumber || '';
      const name = properties.name || '';
      const city = properties.city || '';
      const state = properties.state || '';
      const country = properties.country || '';

      // Construir una dirección más detallada si es posible
      return [street, housenumber, name, city, state, country].filter(Boolean).join(', ') || 'Dirección no disponible';
    }

    return 'Dirección no encontrada para las coordenadas proporcionadas';
  } catch (error) {
    console.error('Error fetching address from coordinates:', error);
    return 'Error al obtener la dirección';
  }
}
