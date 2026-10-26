import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';
import { colors } from '../constants/theme';
import { FloatingTabBar } from '../components/FloatingTabBar';
import { DashboardScreen } from '../screens/DashboardScreen';
import { CardLibraryScreen } from '../screens/CardLibraryScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ScannerScreen } from '../screens/ScannerScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { CardDetailScreen } from '../screens/CardDetailScreen';
import { EventsScreen } from '../screens/EventsScreen';
import { CategoriesSettingsScreen } from '../screens/CategoriesSettingsScreen';
import { StorageSettingsScreen } from '../screens/StorageSettingsScreen';
import { BackupRestoreScreen } from '../screens/BackupRestoreScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} />}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Library" component={CardLibraryScreen} options={{ title: 'Card Library' }} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.primary }}>
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Scanner" component={ScannerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Review Card' }} />
      <Stack.Screen name="CardDetail" component={CardDetailScreen} options={{ title: 'Card Details' }} />
      <Stack.Screen name="Events" component={EventsScreen} options={{ title: 'Events' }} />
      <Stack.Screen name="Categories" component={CategoriesSettingsScreen} options={{ title: 'Categories' }} />
      <Stack.Screen name="StorageSettings" component={StorageSettingsScreen} options={{ title: 'Storage' }} />
      <Stack.Screen name="BackupRestore" component={BackupRestoreScreen} options={{ title: 'Backup & Restore' }} />
    </Stack.Navigator>
  );
}
