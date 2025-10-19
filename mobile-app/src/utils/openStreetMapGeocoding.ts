import axios from 'axios';

// Function to convert coordinates to address using OpenStreetMap
export const convertCoordinatesToAddress = async (latitude: number, longitude: number): Promise<string> => {
  try {
    const response = await axios.get(`https://nominatim.openstreetmap.org/reverse`, {
      params: {
        lat: latitude,
        lon: longitude,
        format: 'json',
      },
    });

    const address = response.data?.display_name;
    return address || 'Dirección no disponible';
  } catch (error) {
    console.error('Error converting coordinates to address:', error);
    return 'Dirección no disponible';
  }
};