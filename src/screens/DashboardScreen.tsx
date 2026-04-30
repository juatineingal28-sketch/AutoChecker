// screens/DashboardScreen.tsx — FULL FIXED VERSION

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../theme';

// 🔥 Safe fallback (prevents theme crashes)
const C = {
  n100: Colors.n100 ?? '#F1F5F9',
  n400: Colors.n400 ?? '#94A3B8',
};

// ── Screens
import AnalyticsScreen from './AnalyticsTab';
import HomeTab from './HomeTab';
import SectionsScreen from './SectionsScreen';
import SettingsScreen from './SettingsTab';

// ─── Types ───────────────────────────────────────────────────

type TabName = 'home' | 'sections' | 'analytics' | 'settings';

interface Tab {
  name: TabName;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOutline: keyof typeof Ionicons.glyphMap;
}

const TABS: Tab[] = [
  {
    name: 'home',
    label: 'Home',
    icon: 'home',
    iconOutline: 'home-outline',
  },
  {
    name: 'sections',
    label: 'Sections',
    icon: 'folder',
    iconOutline: 'folder-outline',
  },
  {
    name: 'analytics',
    label: 'Analytics',
    icon: 'bar-chart',
    iconOutline: 'bar-chart-outline',
  },
  {
    name: 'settings',
    label: 'Settings',
    icon: 'settings',
    iconOutline: 'settings-outline',
  },
];

// ─── Component ───────────────────────────────────────────────

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<TabName>('home');

  const [alerts, setAlerts] = useState([
    {
      id: 1,
      type: 'warning' as const,
      message: 'No Answer Key Uploaded',
      icon: 'alert-circle' as const,
    },
    {
      id: 2,
      type: 'info' as const,
      message: 'Low scan accuracy detected',
      icon: 'alert-circle' as const,
    },
  ]);

  const handleDismissAlert = (id: number) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleLogout = () => {
    navigation.navigate('Login');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeTab
            alerts={alerts}
            onDismissAlert={handleDismissAlert}
            onNavigateToScan={() => navigation.navigate('Scan')}
            onNavigateToResults={() => setActiveTab('sections')}
            onNavigateToAnalytics={() => setActiveTab('analytics')}
            onNavigateToSettings={() => setActiveTab('settings')}
          />
        );

      case 'sections':
        return <SectionsScreen />;

      case 'analytics':
        return <AnalyticsScreen />;

      case 'settings':
        return <SettingsScreen onLogout={handleLogout} />;

      default:
        return (
          <HomeTab
            alerts={alerts}
            onDismissAlert={handleDismissAlert}
            onNavigateToScan={() => navigation.navigate('Scan')}
            onNavigateToResults={() => setActiveTab('sections')}
            onNavigateToAnalytics={() => setActiveTab('analytics')}
            onNavigateToSettings={() => setActiveTab('settings')}
          />
        );
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Bottom navigation */}
      <View style={styles.bottomNav}>
        {TABS.map((tab) => {
          const active = activeTab === tab.name;

          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.navItem}
              onPress={() => setActiveTab(tab.name)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={active ? tab.icon : tab.iconOutline}
                size={20}
                color={active ? Colors.primary : C.n400}
              />

              <Text
                style={[
                  styles.navLabel,
                  active && styles.navLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  content: {
    flex: 1,
  },

  bottomNav: {
    height: 56,
    borderTopWidth: 1,
    borderTopColor: C.n100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
    paddingBottom: 4,
    backgroundColor: Colors.white,
  },

  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 4,
    borderRadius: 10,
  },

  navLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: C.n400,
  },

  navLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});