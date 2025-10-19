import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { COLORS, SPACING } from '../constants';
import { Card } from 'react-native-paper';

interface AttendanceRecord {
  id: string;
  collaborator_id: string;
  check_in: string;
  check_out: string;
  status: string;
  latitude: number;
  longitude: number;
  photo_url: string;
  local_time: string;
  local_time_out: string;
  device_id: string;
}

interface AttendanceHistoryScreenProps {
  route: {
    params: {
      history: AttendanceRecord[];
    };
  };
}

const AttendanceHistoryScreen: React.FC<AttendanceHistoryScreenProps> = ({ route }) => {
  const { history } = route.params;

  return (
    <View style={styles.container}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.title}>Registro de Asistencia</Text>
              <Text>Entrada: {item.local_time}</Text>
              <Text>Salida: {item.local_time_out}</Text>
              <Text>Estado: {item.status}</Text>
            </Card.Content>
          </Card>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.md,
  },
  card: {
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: SPACING.sm,
  },
});

export default AttendanceHistoryScreen;