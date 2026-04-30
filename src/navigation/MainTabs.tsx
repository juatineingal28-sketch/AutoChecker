// navigation/MainTabs.tsx

import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import { supabase } from "../../supabase";
import AnalyticsTab from '../screens/AnalyticsTab';
import HomeTab from '../screens/HomeTab';
import ResultsTab from '../screens/ResultsTab';
import ScanTab from '../screens/ScanTab';
import SectionsScreen from '../screens/SectionsScreen';
import SettingsScreen from '../screens/SettingsTab';

const Tab = createBottomTabNavigator();

function SettingsWrapper() {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
  };

  return <SettingsScreen onLogout={handleLogout} />;
}

export default function MainTabs() {
  const alerts = [
    {
      id: 1,
      type: 'info' as const,
      message: 'Welcome back! Ready to scan papers.',
      icon: 'notifications-outline' as keyof typeof Ionicons.glyphMap,
    },
  ];

  const handleDismissAlert = (id: number) => {
    console.log('Dismiss alert:', id);
  };

  return (
    <Tab.Navigator
      id="main-tabs"
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: route.name === 'Scan'
          ? { display: 'none' }
          : {
              height: 65,
              paddingBottom: 8,
              paddingTop: 8,
              display: 'flex',
            },
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Results') {
            iconName = 'document-text';
          } else if (route.name === 'Scan') {
            iconName = 'camera';
          } else if (route.name === 'Sections') {
            iconName = 'layers-outline';
          } else if (route.name === 'Analytics') {
            iconName = 'bar-chart-outline';
          } else if (route.name === 'Settings') {
            iconName = 'settings-outline';
          }

          return (
            <Ionicons
              name={iconName}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen
        name="Home"
        children={({ navigation }) => (
          <HomeTab
            alerts={alerts}
            onDismissAlert={handleDismissAlert}
            onNavigateToScan={() => navigation.navigate('Scan')}
            onNavigateToResults={() => navigation.navigate('Sections')}
            onNavigateToAnalytics={() => navigation.navigate('Analytics')}
            onNavigateToSettings={() => navigation.navigate('Settings')}
          />
        )}
      />

      <Tab.Screen
        name="Sections"
        component={SectionsScreen}
      />

      <Tab.Screen
        name="Analytics"
        component={AnalyticsTab}
      />

      <Tab.Screen
        name="Results"
        component={ResultsTab}
      />

      <Tab.Screen
        name="Scan"
        component={ScanTab}
      />

      <Tab.Screen
        name="Settings"
        component={SettingsWrapper}
      />
    </Tab.Navigator>
  );
}