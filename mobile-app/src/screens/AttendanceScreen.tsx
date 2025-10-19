import React, { useEffect, useState, useRef } from 'react'
import { View, Text, StyleSheet, FlatList, Alert, AppState, Linking, TouchableOpacity, Dimensions, Animated } from 'react-native'
import { Button, Card, Divider, useTheme } from 'react-native-paper'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabaseClient'
import { authService } from '../services/auth'
import { getCurrentLocation } from '../utils/location'
import { getDeviceId } from '../utils/device'
import * as ImagePicker from 'expo-image-picker';
import { uploadPhotoAsync } from '../utils/uploadPhoto';
import * as SecureStore from 'expo-secure-store';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useNavigation } from '@react-navigation/native';
import { formatInTimeZone } from 'date-fns-tz';
import * as Location from 'expo-location';
import { useIsFocused } from '@react-navigation/native';
import { COLORS, FONTS } from '../constants';
import { addDays, format, isAfter, isToday, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';

interface Attendance {
  id: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  created_at: string | null;
}

const ITEM_WIDTH = 70;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HORIZONTAL_PADDING = SCREEN_WIDTH / 2 - ITEM_WIDTH / 2;

type AttendanceScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Attendance'>;

const DateItem = React.memo(({ item, index, scrollX, onPress, selectedDate }: { item: Date, index: number, scrollX: Animated.Value, onPress: () => void, selectedDate: Date }) => {
    const inputRange = [
        (index - 1) * ITEM_WIDTH,
        index * ITEM_WIDTH,
        (index + 1) * ITEM_WIDTH,
    ];

    const scale = scrollX.interpolate({
        inputRange,
        outputRange: [1, 1.3, 1],
        extrapolate: 'clamp',
    });

    const isSelected = isSameDay(item, selectedDate);

    const backgroundColor = isSelected ? COLORS.primary : '#e9ecef';
    const textColor = isSelected ? '#fff' : COLORS.textSecondary;
    const dayTextColor = isSelected ? COLORS.primary : COLORS.textSecondary;

    const isFutureDate = isAfter(item, new Date()) && !isToday(item);

    return (
        <TouchableOpacity onPress={onPress} disabled={isFutureDate}>
            <Animated.View style={[styles.dateItemContainer, { transform: [{ scale }] }]}>
                <View style={[styles.dateCircle, { backgroundColor }]}>
                    <Text style={[styles.dateText, { color: textColor, fontSize: isSelected ? 28 : 22, fontWeight: isSelected ? 'normal' : 'normal'}]}>
                        {format(item, 'd')}
                    </Text>
                </View>
                <Text style={[styles.dayText, { color: dayTextColor, fontSize: isSelected ? 14 : 14 }, isFutureDate && { color: '#aaa' }]}>
                    {format(item, 'EEE', { locale: es })}
                </Text>
            </Animated.View>
        </TouchableOpacity>
    );
});

const AttendanceScreen: React.FC = () => {
  const { user } = useAuth()
  const { sendHeartbeat } = useAuth() as any;
  const [attendance, setAttendance] = useState<Attendance | null>(null)
  const [history, setHistory] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(false)
  const [collaboratorId, setCollaboratorId] = useState<string | null>(null)
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [allDates, setAllDates] = useState<Date[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const isFocused = useIsFocused();
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const today = new Date();
    const pastDates = Array.from({ length: 30 }, (_, i) => addDays(today, -i)).reverse();
    setAllDates(pastDates);
  }, []);

  useEffect(() => {
    if (isFocused && allDates.length > 0) {
      const todayIndex = allDates.findIndex(d => isToday(d));
      if (todayIndex !== -1) {
        setTimeout(() => {
            handleDatePress(allDates[todayIndex], todayIndex, false);
            flatListRef.current?.scrollToIndex({ index: todayIndex, animated: true });
        }, 100);
      }
      restoreAttendanceState();
    }
  }, [isFocused, allDates]);

  const restoreSupabaseSession = async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token')
      const refresh = await SecureStore.getItemAsync('refresh_token')
      if (token) {
        await supabase.auth.setSession({ access_token: token, refresh_token: refresh || undefined } as any)
      }
    } catch (err) { /* ignore */ }
  }

  useEffect(() => {
    const fetchCollaborator = async () => {
      const { data: collaborator } = await supabase.from('pr_collaborators').select('id').eq('user_id', user?.id || '').maybeSingle();
      if (collaborator?.id) setCollaboratorId(collaborator.id)
    }
    fetchCollaborator()
  }, [user])

  useEffect(() => {
    if (collaboratorId) {
      fetchAttendance(selectedDate)
      fetchHistory()
    }
  }, [collaboratorId, selectedDate])

  const fetchAttendance = async (dateToFetch: Date) => {
    setLoading(true);
    try {
      if (!collaboratorId) { setAttendance(null); return; }
      const startDate = new Date(dateToFetch); startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateToFetch); endDate.setHours(23, 59, 59, 999);
      const { data } = await supabase.from('pr_attendance').select('*').eq('collaborator_id', collaboratorId).gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
      setAttendance(data || null);
    } catch (err) {
      setAttendance(null);
    } finally {
      setLoading(false);
    }
  }

  const fetchHistory = async () => {
    try {
      if (!collaboratorId) return;
      const { data, error } = await supabase.from('pr_attendance').select('*').eq('collaborator_id', collaboratorId).order('created_at', { ascending: false }).limit(10)
      if (error) throw error
      setHistory(data || [])
    } catch (e) {
      setHistory([])
    }
  }

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso requerido', 'Se requiere permiso de cámara para tomar la foto.');
            return null;
        }
        await SecureStore.setItemAsync('attendance_state', JSON.stringify({ attendance, history, photoUri }));
        const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.7, base64: false });
        if (!result.canceled && result.assets && result.assets.length > 0) {
            setPhotoUri(result.assets[0].uri);
            return result.assets[0].uri;
        }
        return null;
    };

    const checkPermissions = async () => {
        const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
        const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
        if (cameraStatus !== 'granted' || locationStatus !== 'granted') {
            Alert.alert('Permisos requeridos', 'Se requieren permisos de cámara y ubicación.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Abrir configuración', onPress: () => Linking.openSettings() }]);
            return false;
        }
        return true;
    };

  const handleCheckIn = async () => {
    if (!(await checkPermissions())) return;
    try {
      const photoUri = await takePhoto();
      if (!photoUri) return;
      await restoreSupabaseSession();
      const { data: collaborator } = await supabase.from('pr_collaborators').select('id, company_id').eq('user_id', user?.id || '').maybeSingle();
      if (!collaborator) {
        Alert.alert('Error', 'No se encontró colaborador.');
        return;
      }
      const photoUrl = await uploadPhotoAsync(photoUri, `checkin_${Date.now()}.jpg`, collaborator.company_id, collaborator.id);
      const location = await getCurrentLocation();
      const now = new Date();
      const formattedDate = now.toISOString();

      const deviceId = await getDeviceId();
      const { error } = await supabase.from('pr_attendance').insert({
        collaborator_id: collaborator.id,
        status: 'checked_in',
        check_in: formattedDate, // Use formatted date
        latitude_in: location.latitude,
        longitude_in: location.longitude,
        local_time: now.toLocaleString(),
        device_id: deviceId,
        photo_url: photoUrl
      });
      if (error) throw error;
      Alert.alert('Éxito', `Entrada registrada a las ${formatInTimeZone(now, 'America/Santiago', 'HH:mm:ss')}`);
      await fetchAttendance(selectedDate);
      await fetchHistory();
    } catch (e) {
      Alert.alert('Error', 'No se pudo registrar la entrada.');
    }
  };

  const handleCheckOut = async () => {
    if (!(await checkPermissions())) return;
    try {
      const photoUri = await takePhoto();
      if (!photoUri) return;
      const { data: collaborator } = await supabase.from('pr_collaborators').select('id, company_id').eq('user_id', user?.id || '').maybeSingle();
      if (!collaborator) {
        Alert.alert('Error', 'No se encontró colaborador.');
        return;
      }
      const { data: lastAttendance } = await supabase.from('pr_attendance').select('id').eq('collaborator_id', collaborator.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!lastAttendance) {
        Alert.alert('Error', 'No se encontró registro de entrada.');
        return;
      }
      const photoUrl = await uploadPhotoAsync(photoUri, `checkout_${Date.now()}.jpg`, collaborator.company_id, collaborator.id);
      const location = await getCurrentLocation();
      const now = new Date();
      const formattedDate = now.toISOString();

      const deviceId = await getDeviceId();
      const { error } = await supabase.from('pr_attendance').update({
        status: 'checked_out',
        check_out: formattedDate, // Use formatted date
        latitude_out: location.latitude,
        longitude_out: location.longitude,
        local_time_out: now.toLocaleString(),
        device_id: deviceId,
        photo_url: photoUrl
      }).eq('id', lastAttendance.id);
      if (error) throw error;
      Alert.alert('Éxito', `Salida registrada a las ${formatInTimeZone(now, 'America/Santiago', 'HH:mm:ss')}`);
      await fetchAttendance(selectedDate);
      await fetchHistory();
    } catch (e) {
      Alert.alert('Error', 'No se pudo registrar la salida.');
    }
  }

  function toChileTime(dateString: string) {
    if (!dateString) return '';
    try {
      return formatInTimeZone(dateString, 'America/Santiago', 'HH:mm');
    } catch (error) {
      return 'Invalid date';
    }
  }

  const handleScrollEnd = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / ITEM_WIDTH);
    if (index >= 0 && index < allDates.length) {
      const date = allDates[index];
      if (!isSameDay(date, selectedDate)) {
        setSelectedDate(date);
      }
    } else if (index >= allDates.length) {
      // If scrolled beyond the last date, bring the last date into focus
      flatListRef.current?.scrollToIndex({ index: allDates.length - 1, animated: true });
    }
  };

  const handleDatePress = (item: Date, index: number, animated = true) => {
    if (isAfter(item, new Date()) && !isToday(item)) return;
    if (!isSameDay(item, selectedDate)) {
        setSelectedDate(item);
    }
    flatListRef.current?.scrollToIndex({ index, animated });
  };

  const restoreAttendanceState = async () => {
    const savedState = await SecureStore.getItemAsync('attendance_state');
    if (savedState) {
      const parsed = JSON.parse(savedState);
      setAttendance(parsed.attendance);
      setHistory(parsed.history);
      await SecureStore.deleteItemAsync('attendance_state');
    }
  }

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        try {
          const session = await supabase.auth.getSession();
          if (session.data.session) await restoreSupabaseSession();
        } catch (e) { /* ignore */ }
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.dateSelectorContainer}>
            <Animated.FlatList
              ref={flatListRef}
              data={allDates}
              keyExtractor={(item) => item.toISOString()}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PADDING }}
              snapToInterval={ITEM_WIDTH}
              decelerationRate="fast"
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: true } // Using native driver for performance
              )}
              scrollEventThrottle={16}
              onMomentumScrollEnd={handleScrollEnd}
              getItemLayout={(_, index) => ({ length: ITEM_WIDTH, offset: ITEM_WIDTH * index, index })}
              renderItem={({ item, index }) => (
                <DateItem 
                  item={item} 
                  index={index} 
                  scrollX={scrollX} 
                  onPress={() => handleDatePress(item, index)}
                  selectedDate={selectedDate}
                />
              )}
            />
          </View>

          <Text style={styles.title}>Asistencia para el {format(selectedDate, 'PPP', { locale: es })}</Text>
          {attendance ? (
            <>
              <Text style={{ textAlign: 'center', fontSize: 32, fontFamily: FONTS.title, marginVertical: 8, color: COLORS.primary }}>
                {attendance.status === 'checked_in' ? 'En jornada' : 'Fuera de jornada'}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <View style={{ flex: 1, alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 18, fontFamily: FONTS.body, color: COLORS.textSecondary, marginBottom: 4 }}>Entrada</Text>
                  <Text style={{ fontSize: 32, fontFamily: FONTS.title, color: COLORS.primary }}>
                    {attendance.check_in ? toChileTime(attendance.check_in) : '---'}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 18, fontFamily: FONTS.body, color: COLORS.textSecondary, marginBottom: 4 }}>Salida</Text>
                  <Text style={{ fontSize: 32, fontFamily: FONTS.title, color: COLORS.primary }}>
                    {attendance.check_out ? toChileTime(attendance.check_out) : '---'}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={{textAlign: 'center', marginVertical: 20, fontFamily: FONTS.body}}>No hay registros de asistencia para el día seleccionado.</Text>
          )}
        </Card.Content>
        <Card.Actions style={{ flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <Button mode="contained" onPress={handleCheckIn} disabled={!isToday(selectedDate) || attendance?.status === 'checked_in'} style={{ width: 220, marginVertical: 8 }} contentStyle={{ height: 80, justifyContent: 'center' }} labelStyle={{ fontSize: 18, fontWeight: 'normal' }}>
            Registrar entrada
          </Button>
          <Button mode="contained" onPress={handleCheckOut} disabled={!isToday(selectedDate) || attendance?.status !== 'checked_in'} style={{ width: 220, marginVertical: 8 }} contentStyle={{ height: 80, justifyContent: 'center' }} labelStyle={{ fontSize: 18, fontWeight: 'normal' }}>
            Registrar salida
          </Button>
        </Card.Actions>
      </Card>
      <Text style={styles.title}>Historial reciente</Text>
      <FlatList
        data={history}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.historyItem}>
            <Text>
              {item.created_at ? new Date(item.created_at).toLocaleDateString('es-CL') : 'Fecha no disponible'} - Entrada: {item.check_in ? toChileTime(item.check_in) : '-'} / Salida: {item.check_out ? toChileTime(item.check_out) : '-'}
            </Text>
            <Divider style={{ marginVertical: 4 }} />
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8f9fa',
  },
  card: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 2,
    textAlign: 'center',
  },
  historyItem: {
    marginBottom: 8,
  },
  dateSelectorContainer: {
    height: 120,
    marginBottom: 2,
    justifyContent: 'center',
  },
  dateItemContainer: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
  },
  dateCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e9ecef',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  dayText: {
    fontSize: 14,
    textTransform: 'capitalize',
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
})

export default AttendanceScreen