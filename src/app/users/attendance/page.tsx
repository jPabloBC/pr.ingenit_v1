'use client'

import { Container, Typography, Box, Paper } from '@mui/material'
import { AccessTime } from '@mui/icons-material'
import { colors } from '@/theme/theme'
import UserHeader from '@/components/layout/UserHeader'
import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, Modal } from '@mui/material'
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import dynamic from 'next/dynamic';
import { Box as MuiBox } from '@mui/system';
import axios from 'axios';
import { TextField, InputAdornment } from '@mui/material';
import { Search } from '@mui/icons-material';

// Format the date to Latin American format
const formatDate = (dateString: string | null) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return format(date, "dd/MM/yyyy HH:mm:ss", { locale: es });
};

// Actualización del tipo para incluir todas las columnas relevantes de pr_collaborators
interface Collaborator {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  document?: string;
  address?: string;
  gender?: string;
  worker_type?: string;
  emergency_contact?: string;
  photo_url?: string;
}

// Actualización del tipo Attendance para usar el nuevo tipo Collaborator
interface Attendance {
  attendance_id: string;
  collaborator_id: string;
  check_in: string | null;
  check_out: string | null;
  attendance_status: string;
  latitude_in?: number;
  longitude_in?: number;
  latitude_out?: number;
  longitude_out?: number;
  collaborators?: Collaborator;
}

// Utility function to truncate the ID
const truncateId = (id: string) => id.split('-')[0];

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

const fetchAddress = async (latitude: number, longitude: number): Promise<string> => {
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
};

export default function AttendancePage() {
  const [attendanceData, setAttendanceData] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [openModal, setOpenModal] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const response = await fetch('/api/attendance')
        const data = await response.json()
        setAttendanceData(data)
      } catch (error) {
        console.error('Error fetching attendance data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAttendance()
  }, [])

  const handleOpenModal = (latitude: number, longitude: number) => {
    setSelectedLocation({ latitude, longitude })
    setOpenModal(true)
  }

  const handleCloseModal = () => {
    setOpenModal(false)
    setSelectedLocation(null)
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value.toLowerCase());
  };

  const filteredAttendanceData = attendanceData.filter((row) => {
    const collaborator = row.collaborators;
    const search = searchTerm.toLowerCase();

    return (
      (collaborator?.first_name?.toLowerCase() || '').includes(search) ||
      (collaborator?.last_name?.toLowerCase() || '').includes(search) ||
      (collaborator?.email?.toLowerCase() || '').includes(search) ||
      (collaborator?.phone?.toLowerCase() || '').includes(search) ||
      (collaborator?.position?.toLowerCase() || '').includes(search) ||
      (row.collaborator_id?.toLowerCase() || '').includes(search) ||
      (collaborator?.document?.toLowerCase() || '').includes(search) ||
      (collaborator?.address?.toLowerCase() || '').includes(search) ||
      (collaborator?.gender?.toLowerCase() || '').includes(search) ||
      (collaborator?.worker_type?.toLowerCase() || '').includes(search) ||
      (collaborator?.emergency_contact?.toLowerCase() || '').includes(search) ||
      (collaborator?.photo_url?.toLowerCase() || '').includes(search)
    );
  });

  const truncateAddress = (address: string, maxLength: number = 30): string => {
    return address.length > maxLength ? `${address.substring(0, maxLength)}...` : address;
  };

  const AttendanceRow = ({ row }: { row: Attendance }) => {
    const [checkInAddress, setCheckInAddress] = useState<string>('Obteniendo dirección...');
    const [checkOutAddress, setCheckOutAddress] = useState<string>('Obteniendo dirección...');

    useEffect(() => {
      if (row.latitude_in != null && row.longitude_in != null) {
        fetchAddress(row.latitude_in, row.longitude_in).then((address) => {
          setCheckInAddress(truncateAddress(address));
        });
      } else {
        setCheckInAddress('Sin ubicación');
      }

      if (row.latitude_out != null && row.longitude_out != null) {
        fetchAddress(row.latitude_out, row.longitude_out).then((address) => {
          setCheckOutAddress(truncateAddress(address));
        });
      } else {
        setCheckOutAddress('Sin ubicación');
      }
    }, [row.latitude_in, row.longitude_in, row.latitude_out, row.longitude_out]);

    return (
      <TableRow key={`${row.attendance_id}-${row.collaborator_id}`}>
        <TableCell title={row.collaborator_id}>{truncateId(row.collaborator_id)}</TableCell>
        <TableCell>{row.collaborators?.first_name} {row.collaborators?.last_name}</TableCell>
        <TableCell>{row.collaborators?.position}</TableCell>
        <TableCell>{row.collaborators?.phone}</TableCell>
        
        <TableCell>{row.check_in ? formatDate(row.check_in) : 'No marcó entrada'}</TableCell>
        <TableCell>{row.check_out ? formatDate(row.check_out) : 'No marcó salida'}</TableCell>
        <TableCell>
          {row.latitude_in != null && row.longitude_in != null ? (
            <Typography
              sx={{ color: 'blue', cursor: 'pointer' }}
              onClick={() => handleOpenModal(row.latitude_in as number, row.longitude_in as number)}
              title={checkInAddress}
            >
              {checkInAddress}
            </Typography>
          ) : (
            'Sin ubicación'
          )}
        </TableCell>
        <TableCell>
          {row.latitude_out != null && row.longitude_out != null ? (
            <Typography
              sx={{ color: 'blue', cursor: 'pointer' }}
              onClick={() => handleOpenModal(row.latitude_out as number, row.longitude_out as number)}
              title={checkOutAddress}
            >
              {checkOutAddress}
            </Typography>
          ) : (
            'Sin ubicación'
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <Box sx={{ flex: 1 }}>
        <UserHeader title="Asistencia y Colaboradores" />
        <Container maxWidth={false} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="h4" sx={{ color: colors.blue1, fontWeight: 700, mt: 2 }}>
              Gestión de Asistencia y Colaboradores
            </Typography>
          </Box>

          <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
            {loading ? (
              <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                <CircularProgress />
              </Box>
            ) : (
              <>
                <Box sx={{ marginBottom: 2 }}>
                  <TextField
                    label="Buscar colaborador"
                    variant="outlined"
                    fullWidth
                    value={searchTerm}
                    onChange={handleSearchChange}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Box>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>Nombre</TableCell>
                        <TableCell>Posición</TableCell>
                        <TableCell>Teléfono</TableCell>
                        
                        <TableCell>Check In</TableCell>
                        <TableCell>Check Out</TableCell>
                        <TableCell>Ubicación Entrada</TableCell>
                        <TableCell>Ubicación Salida</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredAttendanceData.map((row) => (
                        <AttendanceRow key={`${row.attendance_id}-${row.collaborator_id}`} row={row} />
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Paper>
        </Container>

        <Modal open={openModal} onClose={handleCloseModal}>
          <MuiBox sx={{ width: '80%', height: '80%', margin: 'auto', mt: 8, backgroundColor: 'white', borderRadius: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {selectedLocation && (
              <Map latitude={selectedLocation.latitude} longitude={selectedLocation.longitude} />
            )}
          </MuiBox>
        </Modal>
      </Box>
    </Box>
  )
}



