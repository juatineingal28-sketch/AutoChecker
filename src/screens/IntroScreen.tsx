import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import DashboardScreen from '../screens/DashboardScreen';
import HomeTab from '../screens/HomeTab';
import IntroScreen from '../screens/IntroScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ScanTab from '../screens/ScanTab';
import UploadScreen from '../screens/UploadScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator id="tabs" screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Upload" component={UploadScreen} />
      <Tab.Screen name="Scan" component={ScanTab} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator id="stack" screenOptions={{ headerShown: false }}>

        {/* Auth Flow */}
        <Stack.Screen name="Intro" component={IntroScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />

        {/* App Flow */}
        <Stack.Screen name="Home" component={HomeTab} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="Main" component={MainTabs} />

      </Stack.Navigator>
    </NavigationContainer>
  );
}