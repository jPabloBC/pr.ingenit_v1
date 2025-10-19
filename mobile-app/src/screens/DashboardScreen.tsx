import React, { useEffect, useState } from 'react'
import { View, StyleSheet, ScrollView, RefreshControl, Alert, Image, Text } from 'react-native'
import { Card, Button, Divider } from 'react-native-paper'
import { COLORS, SPACING } from '../constants'
import { useAuth } from '../context/AuthContext'
import { apiService } from '../services/api'
import { Attendance, Notification, User, AttendanceQueryResult } from '../types' // Import User type
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabaseClient' // Corrected import path
import { formatInTimeZone } from 'date-fns-tz';
import { getAddressFromCoordinates } from '../utils/location'; // Import function to get address from coordinates
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { StackNavigationProp } from '@react-navigation/stack';
import { isToday } from 'date-fns';

// Función para validar y formatear RUT chileno
function formatRut(rut: string): string {
  // Elimina puntos y guión
  const cleanRut = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleanRut.length < 2) return rut;
  const body = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1);
  // Validación del dígito verificador
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const expectedDv = 11 - (sum % 11);
  let dvCalc = expectedDv === 11 ? '0' : expectedDv === 10 ? 'K' : expectedDv.toString();
  if (dvCalc !== dv) return rut; // No es RUT válido
  // Formateo: xx.xxx.xxx-x
  let formatted = '';
  let reversed = body.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    if (i !== 0 && i % 3 === 0) formatted = '.' + formatted;
    formatted = reversed[i] + formatted;
  }
  return `${formatted}-${dv}`;
}

// Define the type for the employee object
interface Employee {
  first_name: string;
  last_name: string;
  position?: string;
  photo_url?: string;
  company?: { name: string };
  department?: { name: string };
  phone?: string;
  address?: string;
  worker_type?: string;
  is_active?: boolean;
  document?: string;
}

// Extend the User type to include user_metadata
interface ExtendedUser {
  user_metadata?: {
    document?: string;
    company_id?: string;
  };
}

const DashboardScreen: React.FC = () => {
  const { user, refreshUser } = useAuth()
  const [attendance, setAttendance] = useState<Attendance | AttendanceQueryResult | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [employee, setEmployee] = useState<Employee | null>(null); // Updated state with proper type
  const [address, setAddress] = useState<string | null>(null); // State to store the address
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setRefreshing(true)
    try {
      if (user?.employee) {
        await refreshUser()
        const att = await apiService.get<Attendance>('/api/attendance/today')
        setAttendance(att)
        const notifs = await apiService.get<Notification[]>('/api/notifications')
        setNotifications(notifs)
      } else {
        setAttendance(null)
        setNotifications([])
      }
    } catch (e) {
      setAttendance(null)
      setNotifications([])
    } finally {
      setRefreshing(false)
    }
  }

  const fetchCollaboratorData = async () => {
    try {
      if (!user) {
        return;
      }
      const userId = user.id;
      const { data: collaboratorData, error: collaboratorError } = await supabase
        .from('pr_collaborators')
        .select('company_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (collaboratorError || !collaboratorData?.company_id) {
        Alert.alert(
          'Error',
          'No se pudo obtener el company_id del colaborador. Por favor, contacte al soporte.'
        );
        return;
      }

      const company_id = collaboratorData.company_id;
      const { data, error } = await supabase
        .from('pr_collaborators')
        .select('first_name, last_name, photo_url, document, position')
        .eq('user_id', userId)
        .eq('company_id', company_id)
        .maybeSingle();

      if (error) {
        Alert.alert('Error', 'No se pudo obtener los datos del colaborador.');
        return;
      }

      if (data) {
        setEmployee(data as Employee);
      } else {
        console.warn('No collaborator data found for the given user_id and company_id.');
      }
    } catch (e) {
      Alert.alert('Error', 'Ocurrió un problema al obtener los datos del colaborador.');
    }
  }

  const fetchAttendanceData = async () => {
    if (!user?.id) {
        console.warn('User ID is not defined. Unable to fetch attendance data.');
        setAttendance(null);
        return;
    }

    try {
        // Fetch collaborator ID from pr_collaborators using user_id
        const { data: collaboratorData, error: collaboratorError } = await supabase
            .from('pr_collaborators')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (collaboratorError || !collaboratorData?.id) {
            console.error('Error fetching collaborator ID:', collaboratorError);
            Alert.alert('Error', 'No se pudo obtener el ID del colaborador.');
            setAttendance(null);
            return;
        }

        const collaboratorId = collaboratorData.id;

        // Fetch the latest attendance data using collaborator ID
        const { data: attendanceData, error } = await supabase
            .from('pr_attendance')
            .select('id, collaborator_id, check_in, check_out, status, latitude_in, longitude_in, latitude_out, longitude_out, photo_url, local_time, local_time_out, device_id')
            .eq('collaborator_id', collaboratorId)
            .order('local_time', { ascending: false }) // Order by the latest check-in/check-out time
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error fetching attendance data:', error);
            Alert.alert('Error', 'No se pudo obtener los datos de asistencia.');
            setAttendance(null);
        } else if (attendanceData) {
            const checkInDate = attendanceData.check_in ? new Date(attendanceData.check_in) : null;
            const checkOutDate = attendanceData.check_out ? new Date(attendanceData.check_out) : null;

            if ((checkInDate && isToday(checkInDate)) || (checkOutDate && isToday(checkOutDate))) {
                setAttendance(attendanceData);
            } else {
                setAttendance(null);
                Alert.alert('Sin datos', 'No hay registro de asistencia para hoy.');
            }
        } else {
            console.warn('No attendance data found.');
            Alert.alert('Sin datos', 'No hay registro de asistencia disponible.');
            setAttendance(null);
        }
    } catch (err) {
        console.error('Unexpected error fetching attendance data:', err);
        Alert.alert('Error', 'Ocurrió un problema inesperado al obtener los datos de asistencia.');
        setAttendance(null);
    }
  };

  const fetchAttendanceHistory = async () => {
    if (!user?.id) {
      console.warn('User ID is not defined. Unable to fetch attendance history.');
      return;
    }

    try {
      const { data: collaboratorData, error: collaboratorError } = await supabase
        .from('pr_collaborators')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (collaboratorError || !collaboratorData?.id) {
        console.error('Error fetching collaborator ID:', collaboratorError);
        Alert.alert('Error', 'No se pudo obtener el ID del colaborador.');
        return;
      }

      const collaboratorId = collaboratorData.id;

      const { data: attendanceHistory, error } = await supabase
        .from('pr_attendance')
        .select('id, collaborator_id, check_in, check_out, status, latitude_in, longitude_in, latitude_out, longitude_out, photo_url, local_time, local_time_out, device_id')
        .eq('collaborator_id', collaboratorId)
        .order('local_time', { ascending: false }) // Order by the latest check-in/check-out time
        .limit(5); // Fetch the last 5 records

      if (error) {
        console.error('Error fetching attendance history:', error);
        Alert.alert('Error', 'No se pudo obtener el historial de asistencia.');
      } else {
        const transformedHistory = attendanceHistory.map(record => ({
          ...record,
          latitude: record.latitude_in, // Map latitude_in to latitude
          longitude: record.longitude_in, // Map longitude_in to longitude
        }));

        navigation.navigate('AttendanceHistory', { history: transformedHistory }); // Pass transformed data
      }
    } catch (err) {
      console.error('Unexpected error fetching attendance history:', err);
      Alert.alert('Error', 'Ocurrió un problema inesperado al obtener el historial de asistencia.');
    }
  };

  useEffect(() => {
    fetchCollaboratorData()
  }, [])

  useEffect(() => {
    fetchAttendanceData();
  }, [user]);

  useEffect(() => {
    if (attendance?.latitude_in != null && attendance?.longitude_in != null) { // Updated to use latitude_in and longitude_in
      (async () => {
        try {
          const fetchedAddress = await getAddressFromCoordinates(attendance.latitude_in as number, attendance.longitude_in as number); // Updated to use latitude_in and longitude_in
          setAddress(fetchedAddress);
        } catch (error) {
          console.error('Error fetching address:', error);
          setAddress('Dirección no disponible');
        }
      })();
    } else {
      setAddress('Coordenadas no disponibles');
    }
  }, [attendance]); // Fetch address whenever attendance changes

  function toChileTime(dateString: string) {
    if (!dateString) return '';
    try {
      return formatInTimeZone(dateString, 'America/Santiago', 'HH:mm');
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} />}
    >
      <Card style={[styles.card, { backgroundColor: COLORS.white }]}> 
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.xs, paddingHorizontal: SPACING.xs}}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                overflow: 'hidden',
                backgroundColor: COLORS.blue3,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {employee?.photo_url ? (
                <Image
                  source={{ uri: employee.photo_url }}
                  style={{ width: '100%', height: '100%' }}
                  onError={(error) => {
                    console.error('Error loading image:', error.nativeEvent);
                  }}
                  resizeMode="cover"
                />
              ) : (
                <Text style={{ color: COLORS.white, fontSize: 20, fontWeight: 'bold' }}>
                  {employee?.first_name ? employee.first_name[0] : '?'}
                </Text>
              )}
            </View>
            <View style={{ marginLeft: SPACING.md }}>
              <Text style={{ fontSize: 20, fontWeight: 'normal', color: COLORS.gray4 }}>
                {employee?.first_name && employee?.last_name ? `${employee.first_name} ${employee.last_name}` : 'Nombre no disponible'}
              </Text>
              <Text style={{ fontSize: 15, color: COLORS.blue7 }}>
                {employee?.document
                  ? (formatRut(employee.document) !== employee.document
                      ? `RUT: ${formatRut(employee.document)}`
                      : `CI / DNI: ${employee.document}`)
                  : 'Documento no disponible'}
              </Text>
              <Text style={{ fontSize: 15, color: COLORS.gray5 }}>
                {employee?.position ? employee.position : 'Cargo no disponible'}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      <Card style={[styles.card, { borderColor: COLORS.blue6, borderWidth: 1 }]}> 
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: SPACING.xs }}>
            <Ionicons name="time" size={32} color={COLORS.blue9} />
            <Text style={{ fontSize: 18, fontWeight: 'normal', color: COLORS.gray5, marginLeft: SPACING.md }}>
              Mi Asistencia Hoy
            </Text>
          </View>
          {attendance && (attendance.check_in || attendance.check_out) ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.md }}>
              <View style={{ flex: 1, marginRight: SPACING.md }}>
                <Text style={{ fontSize: 18, fontWeight: '500', color: COLORS.gray7 }}>Entrada</Text>
                <Text style={{ fontSize: 32, color: COLORS.blue7 }}>
                  {attendance?.check_in ? toChileTime(attendance.check_in) : '---'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '500', color: COLORS.gray7 }}>Salida</Text>
                <Text style={{ fontSize: 32, color: COLORS.blue7 }}>
                  {attendance?.check_out ? toChileTime(attendance.check_out) : '---'}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: 14, color: COLORS.blue9 }}>No hay registro de asistencia para hoy.</Text>
          )}
          {attendance && address && (
            <View style={{ marginTop: SPACING.md }}>
              <Text style={{ fontSize: 18, fontWeight: '500', color: COLORS.gray7 }}>Ubicación</Text>
              <Text style={{ fontSize: 16, color: COLORS.blue9 }}>
                Dirección: {address}
              </Text>
            </View>
          )}
        </Card.Content>
        <Card.Actions>
          <Button
            mode="contained"
            onPress={fetchAttendanceHistory}
            labelStyle={{ fontWeight: 'normal' }}
          >
            <Text>Ver historial</Text>
          </Button>
        </Card.Actions>
      </Card>

      <Card style={[styles.card, { marginBottom: SPACING.xs }]}> 
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: SPACING.xs }}>
            <Ionicons name="notifications" size={32} color={COLORS.primary} />
            <Text style={{ fontSize: 18, fontWeight: 'normal', color: COLORS.gray5, marginLeft: SPACING.md }}>
              Notificaciones
            </Text>
          </View>
          {notifications.length > 0 ? (
            notifications.map((notif) => (
              <View key={notif.id} style={styles.notification}>
                <Text style={{ fontSize: 16, fontWeight: '500' }}>{notif.title ? notif.title : 'Sin título'}</Text>
                <Text style={{ fontSize: 14, color: '#666' }}>{notif.message ? notif.message : 'Sin mensaje'}</Text>
                <Divider style={{ marginVertical: 4 }} />
              </View>
            ))
          ) : (
            <Text style={{ fontSize: 14, color: '#666' }}>No tienes notificaciones recientes.</Text>
          )}
        </Card.Content>
      </Card>

      <View style={styles.quickActions}>
        <Button
          mode="outlined"
          icon="calendar"
          style={styles.actionBtn}
          onPress={() => navigation.navigate('Attendance')}
        >
          <Text>Asistencia</Text>
        </Button>
        <Button
          mode="outlined"
          icon="shield-check"
          style={styles.actionBtn}
          onPress={() => navigation.navigate('EPP')}
        >
          <Text>Mi EPP</Text>
        </Button>
        <Button
          mode="outlined"
          icon="file-document"
          style={styles.actionBtn}
          onPress={() => navigation.navigate('Documents')}
        >
          <Text>Documentos</Text>
        </Button>
        <Button
          mode="outlined"
          icon="account"
          style={styles.actionBtn}
          onPress={() => navigation.navigate('Profile')}
        >
          <Text>Perfil</Text>
        </Button>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.md,
  },
  card: {
    marginBottom: SPACING.md,
  },
  infoText: {
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  statusChip: {
    backgroundColor: COLORS.success,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  notification: {
    marginBottom: 8,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  actionBtn: {
    marginBottom: SPACING.sm,
    width: '48%',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})

export default DashboardScreen
