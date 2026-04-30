import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ✅ FIXED IMPORT (MATCHES YOUR THEME)
import { Colors } from '../theme';

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  showBack = false,
  rightIcon,
  onRightPress,
}) => {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      {/* Left */}
      {showBack ? (
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
      ) : (
        <View style={styles.side} />
      )}

      {/* Title */}
      <Text style={styles.title}>{title}</Text>

      {/* Right */}
      {rightIcon ? (
        <TouchableOpacity onPress={onRightPress}>
          <Ionicons name={rightIcon} size={24} color={Colors.white} />
        </TouchableOpacity>
      ) : (
        <View style={styles.side} />
      )}
    </View>
  );
};

export default ScreenHeader;

const styles = StyleSheet.create({
  container: {
    height: 60,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 18, // ✅ since you don’t have FONT_SIZES
    fontWeight: '600',
    color: Colors.white,
  },
  side: {
    width: 24,
  },
});