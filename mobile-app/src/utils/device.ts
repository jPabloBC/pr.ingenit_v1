import * as Application from 'expo-application';
import * as Device from 'expo-device';

export async function getDeviceId() {
  // Prioridad: installationId, androidId, iosId, deviceName
  const androidId = await Application.getAndroidId();
    if (androidId) return androidId;
  if (Device.osInternalBuildId) return Device.osInternalBuildId;
  if (Device.deviceName) return Device.deviceName;
  return 'unknown-device';
}
