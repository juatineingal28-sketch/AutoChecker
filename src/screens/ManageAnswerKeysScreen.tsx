// screens/ManageAnswerKeysScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    deleteAnswerKey,
    fetchAnswerKey,
    fetchSections,
    type AnswerKeyRecord,
    type Section,
} from '../services/api';
import { Colors, Radius, Spacing } from '../theme';

interface SectionWithKey {
  section:   Section;
  keyRecord: AnswerKeyRecord | null;
  loading:   boolean;
}

const COLOR_MAP = {
  blue:  { bg: Colors.primaryLight, text: Colors.primary },
  green: { bg: Colors.successLight, text: Colors.success },
  amber: { bg: Colors.amberLight,   text: Colors.amber   },
  red:   { bg: Colors.dangerLight,  text: Colors.danger  },
};

const TYPE_LABELS: Record<string, string> = {
  mc:             'MC',
  truefalse:      'T/F',
  identification: 'ID',
  enumeration:    'Enum',
  traceError:     'Trace',
  shortAnswer:    'SA',
};

export default function ManageAnswerKeysScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { mode } = (route.params ?? {}) as { mode?: string };
  const isAddMode = mode === 'add';

  const [items,   setItems]   = useState<SectionWithKey[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Reload every time the screen comes into focus ──────────────────────────
  // This ensures that after uploading a key in SectionsScreen or AddAnswerKey,
  // the list is always up-to-date when the user returns here.
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const sections = await fetchSections();
      setItems(sections.map(s => ({ section: s, keyRecord: null, loading: true })));

      const records = await Promise.allSettled(
        sections.map(s => fetchAnswerKey(s.id))
      );

      setItems(sections.map((s, i) => ({
        section:   s,
        keyRecord: records[i].status === 'fulfilled'
          ? (records[i] as PromiseFulfilledResult<AnswerKeyRecord | null>).value
          : null,
        loading: false,
      })));
    } catch {
      Alert.alert('Error', 'Could not load sections. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh every time this screen is focused (e.g. after coming back from AddAnswerKey)
  useFocusEffect(
    useCallback(() => {
      loadAll();
      return undefined;
    }, [loadAll])
  );

  const handleDelete = useCallback((sectionId: string, sectionName: string) => {
    Alert.alert(
      'Delete Answer Key',
      `Remove the answer key for "${sectionName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAnswerKey(sectionId);
              setItems(prev => prev.map(item =>
                item.section.id === sectionId ? { ...item, keyRecord: null } : item
              ));
            } catch {
              Alert.alert('Error', 'Could not delete the answer key.');
            }
          },
        },
      ],
    );
  }, []);

  if (loading) {
    return (
      <View style={styles.root}>
        <TopBar navigation={navigation} isAddMode={isAddMode} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading answer keys…</Text>
        </View>
      </View>
    );
  }

  const withKey    = items.filter(i => i.keyRecord !== null);
  const withoutKey = items.filter(i => i.keyRecord === null);

  return (
    <View style={styles.root}>
      <TopBar navigation={navigation} isAddMode={isAddMode} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {items.length === 0 && (
          <View style={styles.center}>
            <Ionicons name="layers-outline" size={48} color={Colors.n300} />
            <Text style={styles.emptyTitle}>No sections yet</Text>
            <Text style={styles.emptySub}>Create a section first to add answer keys</Text>
          </View>
        )}

        {withKey.length > 0 && (
          <>
            <Text style={styles.groupLabel}>WITH ANSWER KEY ({withKey.length})</Text>
            {withKey.map(({ section, keyRecord }) => {
              const clr = COLOR_MAP[section.color] ?? COLOR_MAP.blue;
              return (
                <TouchableOpacity
                  key={section.id}
                  style={styles.card}
                  activeOpacity={0.75}
                  onPress={() =>
                    isAddMode
                      ? navigation.navigate('AddAnswerKey', {
                          sectionId:   section.id,
                          sectionName: section.name,
                        })
                      : navigation.navigate('EditAnswerKey', {
                          sectionId:   section.id,
                          sectionName: section.name,
                          keyRecord,
                        })
                  }
                >
                  <View style={[styles.abbr, { backgroundColor: clr.bg }]}>
                    <Text style={[styles.abbrText, { color: clr.text }]}>
                      {section.abbr || section.name.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.cardBody}>
                    <Text style={styles.cardName}>{section.name}</Text>
                    <Text style={styles.cardSub}>
                      {section.subject || 'No subject'} · {keyRecord?.total ?? 0} items
                    </Text>
                    {keyRecord?.typeSummary && (
                      <View style={styles.pills}>
                        {Object.entries(keyRecord.typeSummary)
                          .filter(([, v]) => (v ?? 0) > 0)
                          .map(([type, count]) => (
                            <View key={type} style={styles.pill}>
                              <Text style={styles.pillText}>{TYPE_LABELS[type] ?? type}: {count}</Text>
                            </View>
                          ))}
                      </View>
                    )}
                  </View>

                  <View style={styles.cardActions}>
                    <View style={styles.editChip}>
                      <Ionicons name="pencil-outline" size={11} color={Colors.primary} />
                      <Text style={styles.editChipText}>Edit</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDelete(section.id, section.name)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ marginTop: 8 }}
                    >
                      <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {withoutKey.length > 0 && (
          <>
            <Text style={[styles.groupLabel, { marginTop: withKey.length > 0 ? 16 : 0 }]}>
              NO ANSWER KEY ({withoutKey.length})
            </Text>
            {withoutKey.map(({ section }) => {
              const clr = COLOR_MAP[section.color] ?? COLOR_MAP.blue;
              return (
                <TouchableOpacity
                  key={section.id}
                  style={[styles.card, { opacity: 0.7 }]}
                  activeOpacity={0.6}
                  // ✅ FIX: Navigate to AddAnswerKey instead of Sections screen
                  onPress={() =>
                    navigation.navigate('AddAnswerKey', {
                      sectionId:   section.id,
                      sectionName: section.name,
                    })
                  }
                >
                  <View style={[styles.abbr, { backgroundColor: clr.bg }]}>
                    <Text style={[styles.abbrText, { color: clr.text }]}>
                      {section.abbr || section.name.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={[styles.cardName, { color: Colors.textSecondary }]}>{section.name}</Text>
                    <Text style={styles.cardSub}>{section.subject || 'No subject'} · No key uploaded</Text>
                  </View>
                  <View style={styles.uploadChip}>
                    <Ionicons name="add-outline" size={11} color={Colors.primary} />
                    <Text style={styles.uploadChipText}>Add Key</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

function TopBar({ navigation, isAddMode }: { navigation: any; isAddMode?: boolean }) {
  return (
    <View style={styles.topbar}>
      <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.8}>
        <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.topbarTitle}>{isAddMode ? 'Select a Section' : 'Manage Answer Keys'}</Text>
      <View style={{ width: 20 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.background },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, gap: 10 },

  topbar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  topbarTitle: {
    fontSize: 16, fontWeight: '700',
    color: Colors.textPrimary, letterSpacing: -0.4,
  },

  groupLabel: {
    fontSize: 10, fontWeight: '700',
    color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 2,
  },

  center: {
    flex: 1, alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingVertical: 60,
  },
  loadingText: { fontSize: 13, color: Colors.textSecondary },
  emptyTitle:  { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  emptySub:    { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  abbr: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  abbrText: { fontSize: 12, fontWeight: '800' },

  cardBody:  { flex: 1, minWidth: 0 },
  cardName:  { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  cardSub:   { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  pills:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  pill:     { backgroundColor: Colors.n100, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pillText: { fontSize: 9, fontWeight: '600', color: Colors.n600 },

  cardActions: { alignItems: 'center', flexShrink: 0 },
  editChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: Radius.sm, backgroundColor: Colors.primaryLight,
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  editChipText: { fontSize: 10, fontWeight: '700', color: Colors.primary },

  uploadChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: Radius.sm, backgroundColor: Colors.primaryLight,
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  uploadChipText: { fontSize: 10, fontWeight: '600', color: Colors.primary },
});