// src/screens/OMRSheetPreviewScreen.tsx
// ─── OMR Sheet Preview Screen ─────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import OMRSheetRenderer from '../components/omr/OMRSheetRenderer';
import { OMRSheetMeta } from '../constants/omrConfig';
import { RootStackParamList } from '../navigation/AppNavigator';
import { COLORS, FONT_SIZES, RADIUS, SPACING } from '../theme/theme';
import { printOMRSheet, shareOMRSheet } from '../utils/omrPDFRenderer';

type PreviewRoute = RouteProp<RootStackParamList, 'OMRSheetPreview'>;

export default function OMRSheetPreviewScreen() {
  const navigation = useNavigation();
  const route      = useRoute<PreviewRoute>();

  // Route params carry the full meta object passed from GenerateSheetScreen
  const meta = (route.params as unknown as { meta?: OMRSheetMeta })?.meta;

  const [loading, setLoading] = useState<'print' | 'share' | null>(null);

  if (!meta) {
    return (
      <View style={styles.center}>
        <Text style={{ color: COLORS.textSecondary }}>No sheet metadata provided.</Text>
      </View>
    );
  }

  async function handlePrint() {
    try {
      setLoading('print');
      await printOMRSheet(meta!);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Print failed.';
      Alert.alert('Print failed', msg);
    } finally {
      setLoading(null);
    }
  }

  async function handleShare() {
    try {
      setLoading('share');
      await shareOMRSheet(meta!);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Share failed.';
      Alert.alert('Share failed', msg);
    } finally {
      setLoading(null);
    }
  }

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Sheet Preview</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Sheet preview (scaled down to fit screen) */}
      <View style={styles.previewWrap}>
        <OMRSheetRenderer meta={meta} scale={0.44} showBackground />
      </View>

      {/* Bottom action bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.shareBtn, loading === 'share' && styles.btnDisabled]}
          onPress={handleShare}
          disabled={!!loading}
        >
          {loading === 'share'
            ? <ActivityIndicator color={COLORS.primary} size="small" />
            : <><Ionicons name="share-outline" size={18} color={COLORS.primary} />
               <Text style={styles.shareBtnText}>Save PDF</Text></>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.printBtn, loading === 'print' && styles.btnDisabled]}
          onPress={handlePrint}
          disabled={!!loading}
        >
          {loading === 'print'
            ? <ActivityIndicator color="#fff" size="small" />
            : <><Ionicons name="print-outline" size={18} color="#fff" />
               <Text style={styles.printBtnText}>Print</Text></>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#E5E7EB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    backgroundColor:   COLORS.primary,
    paddingTop:        Platform.OS === 'ios' ? 54 : 16,
    paddingBottom:     16,
    paddingHorizontal: SPACING.lg,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { fontSize: FONT_SIZES.base, fontWeight: '700', color: '#fff' },

  previewWrap: { flex: 1, overflow: 'hidden' },

  bottomBar: {
    flexDirection:   'row',
    gap:             SPACING.md,
    padding:         SPACING.lg,
    paddingBottom:   Platform.OS === 'ios' ? 32 : SPACING.lg,
    backgroundColor: '#fff',
    borderTopWidth:  1,
    borderTopColor:  COLORS.border,
  },
  actionBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    paddingVertical: 15,
    borderRadius:    RADIUS.lg,
  },
  shareBtn:      { backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: COLORS.primary },
  shareBtnText:  { fontSize: FONT_SIZES.base, fontWeight: '700', color: COLORS.primary },
  printBtn:      { backgroundColor: COLORS.primary },
  printBtnText:  { fontSize: FONT_SIZES.base, fontWeight: '700', color: '#fff' },
  btnDisabled:   { opacity: 0.6 },
});