import { Alert, Linking } from 'react-native';

/** Shows a permission-denied alert with an "Open Settings" action when the OS will no longer
 *  show its own permission dialog (canAskAgain === false) — the only way forward at that point.
 *  When canAskAgain is true, just shows the message with an OK button so the user can try the
 *  action again themselves. */
export function showPermissionDeniedAlert(title: string, message: string, canAskAgain: boolean): void {
  if (canAskAgain) {
    Alert.alert(title, message);
    return;
  }
  Alert.alert(title, message, [
    { text: 'Not Now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => Linking.openSettings() },
  ]);
}
