// src/navigation/AppNavigator.tsx

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useEffect } from "react";

import EditProfileScreen from "../screens/EditProfileScreen";
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import ReviewScreen from "../screens/ReviewScreen";
import SectionDetailScreen from "../screens/SectionDetailScreen";
import MainTabs from "./MainTabs";

import AddAnswerKeyScreen from "../screens/AddAnswerKeyScreen";
import EditAnswerKeyScreen from "../screens/EditAnswerKeyScreen";
import ManageAnswerKeysScreen from "../screens/ManageAnswerKeysScreen";

// ── OMR screens ────────────────────────────────────────────────────────────────
import GenerateSheetScreen from "../screens/GenerateSheetScreen";
import OMRScanScreen from "../screens/OMRScanScreen";
import OMRSheetPreviewScreen from "../screens/OMRSheetPreviewScreen";
// ──────────────────────────────────────────────────────────────────────────────

import { OMRSheetMeta } from "../constants/omrConfig";
import { useAuth } from "../context/AuthContext";
import WelcomeScreen from "../screens/WelcomeScreen";
import { AnswerKeyRecord } from "../services/api";

export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
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
  ManageAnswerKeys: { mode?: string } | undefined;
  AddAnswerKey: {
    sectionId:   string;
    sectionName: string;
  };
  EditAnswerKey: {
    sectionId:   string;
    sectionName: string;
    keyRecord:   AnswerKeyRecord;
  };
  // ── OMR routes ──────────────────────────────────────────────────────────────
  GenerateSheet:   undefined;
  /** meta is the full OMRSheetMeta passed from GenerateSheetScreen */
  OMRSheetPreview: { meta: OMRSheetMeta };
  OMRScan:         { sectionId?: string } | undefined;
  // ────────────────────────────────────────────────────────────────────────────
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

  const showAuthStack = !user || isPasswordRecovery;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>

        {showAuthStack ? (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login"   component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs"        component={MainTabs} />
            <Stack.Screen name="Review"          component={ReviewScreen} />
            <Stack.Screen name="SectionDetail"   component={SectionDetailScreen} />
            <Stack.Screen name="Results"         component={ResultsRedirect} />
            <Stack.Screen name="ResultScreen"    component={ReviewScreen} />
            <Stack.Screen name="EditProfile"     component={EditProfileScreen} />
            <Stack.Screen name="ManageAnswerKeys" component={ManageAnswerKeysScreen} />
            <Stack.Screen name="AddAnswerKey"    component={AddAnswerKeyScreen} />
            <Stack.Screen name="EditAnswerKey"   component={EditAnswerKeyScreen} />

            {/* ── OMR screens ─────────────────────────────────────────────── */}
            <Stack.Screen name="GenerateSheet"   component={GenerateSheetScreen} />
            <Stack.Screen name="OMRSheetPreview" component={OMRSheetPreviewScreen} />
            <Stack.Screen name="OMRScan"         component={OMRScanScreen} />
            {/* ────────────────────────────────────────────────────────────── */}
          </>
        )}

      </Stack.Navigator>
    </NavigationContainer>
  );
}