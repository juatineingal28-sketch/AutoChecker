// src/navigation/AppNavigator.tsx
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useEffect } from "react";

import EditProfileScreen from "../screens/EditProfileScreen";
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import ReviewScreen from "../screens/ReviewScreen";
import SectionDetailScreen from "../screens/SectionDetailScreen";
import MainTabs from "./MainTabs";

import { useAuth } from "../context/AuthContext";

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ResetPassword: undefined;
  MainTabs: { screen?: string; params?: Record<string, unknown> } | undefined;
  Review: undefined;
  ResultScreen: {
    result?: Record<string, unknown>;
    resultId?: string;
    sectionId?: string;
  };
  Results: undefined;
  SectionDetail: { section: Record<string, unknown> };
  EditProfile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function ResultsRedirect({ navigation }: any) {
  useEffect(() => {
    navigation.replace("MainTabs", { screen: "Results" });
  }, [navigation]);
  return null;
}

export default function AppNavigator() {
  const { user, isPasswordRecovery } = useAuth();

  // Splash is gone from here — it now lives in App.tsx above AuthProvider
  // so auth state changes never touch it.

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>

        {isPasswordRecovery ? (
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        ) : !user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Review" component={ReviewScreen} />
            <Stack.Screen name="SectionDetail" component={SectionDetailScreen} />
            <Stack.Screen name="Results" component={ResultsRedirect} />
            <Stack.Screen name="ResultScreen" component={ReviewScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
          </>
        )}

      </Stack.Navigator>
    </NavigationContainer>
  );
}