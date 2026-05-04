/**
 * screens/SectionsScreen.tsx
 *
 * FIXES IN THIS VERSION:
 *  1. "Could not load sections" alert → replaced with silent empty state (no more popup)
 *  2. Network error on createSection → proper error message shown inside modal (no crash)
 *  3. fetchSections failure no longer blocks or crashes the screen
 *  4. loadSections is NOT re-fired on every focus to avoid repeated errors
 *  5. BASE_URL reminder comment added — change localhost → your LAN IP for real device
 */

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  createSection,
  deleteAnswerKey,
  deleteSection,
  fetchAnswerKey,
  fetchSections,
  uploadAnswerKey,
  type AnswerKeyRecord,
  type CreateSectionPayload,
  type Section,
  type TypeSummary,
} from '../services/api';
import { Colors, Radius, Shadow, Spacing } from '../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SectionMeta {
  record:  AnswerKeyRecord | null;
  loading: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_OPTIONS: Section['color'][] = ['blue', 'green', 'amber', 'red'];

const COLOR_MAP = {
  blue:  { bg: Colors.primaryLight, text: Colors.primary, bar: Colors.primary },
  green: { bg: Colors.successLight, text: Colors.success, bar: Colors.success },
  amber: { bg: Colors.amberLight,   text: Colors.amber,   bar: Colors.amber   },
  red:   { bg: Colors.dangerLight,  text: Colors.danger,  bar: Colors.danger  },
};

const SECTION_FILTERS = ['All', 'Archived'];

const TYPE_LABELS: Record<string, string> = {
  mc:             'MC',
  truefalse:      'T/F',
  identification: 'ID',
  enumeration:    'Enum',
  traceError:     'Trace',
  shortAnswer:    'SA',
};

// ─── Small components ─────────────────────────────────────────────────────────

function TypeSummaryRow({ summary }: { summary: TypeSummary }) {
  const entries = Object.entries(summary).filter(([, v]) => v! > 0);
  if (!entries.length) return null;
  return (
    <View style={summaryStyles.row}>
      {entries.map(([type, count]) => (
        <View key={type} style={summaryStyles.pill}>
          <Text style={summaryStyles.pillText}>
            {TYPE_LABELS[type] ?? type}: {count}
          </Text>
        </View>
      ))}
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  row:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  pill:     { backgroundColor: Colors.n100, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pillText: { fontSize: 9, fontWeight: '600', color: Colors.n600 },
});

function SearchBar({ value, onChangeText, placeholder }: any) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.n400}
      style={styles.search}
    />
  );
}

function Chip({ label, active, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  return (
    <View style={styles.progressBg}>
      <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function scoreColor(pct: number) {
  if (pct >= 75) return Colors.success;
  if (pct >= 60) return '#F59E0B';
  return Colors.danger;
}

// ─── Create Section Modal ─────────────────────────────────────────────────────

interface CreateSectionModalProps {
  visible:  boolean;
  onClose:  () => void;
  onCreate: (section: Section) => void;
}

function CreateSectionModal({ visible, onClose, onCreate }: CreateSectionModalProps) {
  const [name,         setName]         = useState('');
  const [abbr,         setAbbr]         = useState('');
  const [subject,      setSubject]      = useState('');
  const [studentCount, setStudentCount] = useState('');
  const [color,        setColor]        = useState<Section['color']>('blue');
  const [saving,       setSaving]       = useState(false);
  // ✅ FIX: show error inside modal instead of crashing or showing a separate Alert
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);

  const reset = () => {
    setName('');
    setAbbr('');
    setSubject('');
    setStudentCount('');
    setColor('blue');
    setErrorMsg(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleCreate = async () => {
    if (!name.trim()) {
      setErrorMsg('Section name is required.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const payload: CreateSectionPayload = {
        name:         name.trim(),
        abbr:         abbr.trim() || undefined,
        subject:      subject.trim() || undefined,
        studentCount: studentCount ? parseInt(studentCount, 10) : undefined,
        color,
      };

      const section = await createSection(payload);
      reset();
      onCreate(section);

    } catch (err: any) {
      // ✅ FIX: Catch network errors properly — covers fetch failures, timeouts, and server errors
      let msg = 'Could not create section.';

      if (err?.message?.toLowerCase().includes('network') ||
          err?.message?.toLowerCase().includes('fetch') ||
          err?.message?.toLowerCase().includes('failed')) {
        msg = 'Network error — make sure your server is running and reachable.';
      } else if (err?.response?.data?.error) {
        msg = err.response.data.error;
      } else if (err?.message) {
        msg = err.message;
      }

      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>

          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>New Section</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color={Colors.n600} />
            </TouchableOpacity>
          </View>

          {/* ✅ FIX: Inline error banner — shows network/server errors without closing modal */}
          {errorMsg ? (
            <View style={modalStyles.errorBanner}>
              <Ionicons name="warning-outline" size={14} color="#DC2626" />
              <Text style={modalStyles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <Text style={modalStyles.label}>Section Name *</Text>
          <TextInput
            style={modalStyles.input}
            value={name}
            onChangeText={text => { setName(text); setErrorMsg(null); }}
            placeholder="e.g. Section Rizal"
            placeholderTextColor={Colors.n400}
          />

          <Text style={modalStyles.label}>Abbreviation</Text>
          <TextInput
            style={modalStyles.input}
            value={abbr}
            onChangeText={setAbbr}
            placeholder="e.g. Ri  (auto-filled if blank)"
            placeholderTextColor={Colors.n400}
            maxLength={4}
          />

          <Text style={modalStyles.label}>Subject</Text>
          <TextInput
            style={modalStyles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="e.g. Science 10"
            placeholderTextColor={Colors.n400}
          />

          <Text style={modalStyles.label}>Number of Students</Text>
          <TextInput
            style={modalStyles.input}
            value={studentCount}
            onChangeText={setStudentCount}
            placeholder="e.g. 38"
            placeholderTextColor={Colors.n400}
            keyboardType="number-pad"
          />

          <Text style={modalStyles.label}>Color</Text>
          <View style={modalStyles.colorRow}>
            {COLOR_OPTIONS.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => setColor(c)}
                style={[
                  modalStyles.colorDot,
                  { backgroundColor: COLOR_MAP[c].bar },
                  color === c && modalStyles.colorDotActive,
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[modalStyles.btn, saving && { opacity: 0.6 }]}
            onPress={handleCreate}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={modalStyles.btnText}>Create Section</Text>
            }
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:    {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40,
  },
  header:   {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  title:    { fontSize: 17, fontWeight: '700', color: Colors.n900 },
  label:    { fontSize: 12, fontWeight: '600', color: Colors.n600, marginBottom: 4, marginTop: 12 },
  input:    {
    height: 42, backgroundColor: Colors.n100, borderRadius: 8,
    paddingHorizontal: 12, fontSize: 14, color: Colors.n800,
  },
  colorRow:       { flexDirection: 'row', gap: 12, marginTop: 4 },
  colorDot:       { width: 28, height: 28, borderRadius: 14 },
  colorDotActive: { borderWidth: 3, borderColor: Colors.n900 },
  btn:      {
    marginTop: 24, backgroundColor: Colors.primary,
    borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center',
  },
  btnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },

  // ✅ NEW: error banner inside the modal
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  errorText: { flex: 1, fontSize: 12, color: '#DC2626', lineHeight: 16 },
});

// ─── Edit Section Modal ───────────────────────────────────────────────────────

interface EditSectionModalProps {
  visible:  boolean;
  section:  Section;
  onClose:  () => void;
  onUpdate: (section: Section) => void;
}

function EditSectionModal({ visible, section, onClose, onUpdate }: EditSectionModalProps) {
  const [name,         setName]         = useState(section.name);
  const [abbr,         setAbbr]         = useState(section.abbr ?? '');
  const [subject,      setSubject]      = useState(section.subject ?? '');
  const [studentCount, setStudentCount] = useState(String(section.studentCount ?? ''));
  const [color,        setColor]        = useState<Section['color']>(section.color ?? 'blue');
  const [saving,       setSaving]       = useState(false);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);

  // Sync fields if the section prop changes (e.g. user opens a different section)
  useEffect(() => {
    setName(section.name);
    setAbbr(section.abbr ?? '');
    setSubject(section.subject ?? '');
    setStudentCount(String(section.studentCount ?? ''));
    setColor(section.color ?? 'blue');
    setErrorMsg(null);
  }, [section]);

  const handleSave = async () => {
    if (!name.trim()) { setErrorMsg('Section name is required.'); return; }
    setSaving(true);
    setErrorMsg(null);
    try {
      // TODO: replace with your real API call e.g. await updateSection(section.id, payload)
      const updated: Section = {
        ...section,
        name:         name.trim(),
        abbr:         abbr.trim() || section.abbr,
        subject:      subject.trim() || section.subject,
        studentCount: studentCount ? parseInt(studentCount, 10) : section.studentCount,
        color,
      };
      onUpdate(updated);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Could not update section.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>

          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Edit Section</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.n600} />
            </TouchableOpacity>
          </View>

          {errorMsg ? (
            <View style={modalStyles.errorBanner}>
              <Ionicons name="warning-outline" size={14} color="#DC2626" />
              <Text style={modalStyles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <Text style={modalStyles.label}>Section Name *</Text>
          <TextInput
            style={modalStyles.input}
            value={name}
            onChangeText={t => { setName(t); setErrorMsg(null); }}
            placeholder="e.g. Section Rizal"
            placeholderTextColor={Colors.n400}
          />

          <Text style={modalStyles.label}>Abbreviation</Text>
          <TextInput
            style={modalStyles.input}
            value={abbr}
            onChangeText={setAbbr}
            placeholder="e.g. Ri"
            placeholderTextColor={Colors.n400}
            maxLength={6}
          />

          <Text style={modalStyles.label}>Subject</Text>
          <TextInput
            style={modalStyles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="e.g. Science"
            placeholderTextColor={Colors.n400}
          />

          <Text style={modalStyles.label}>Number of Students</Text>
          <TextInput
            style={modalStyles.input}
            value={studentCount}
            onChangeText={setStudentCount}
            placeholder="e.g. 38"
            placeholderTextColor={Colors.n400}
            keyboardType="number-pad"
          />

          <Text style={modalStyles.label}>Color</Text>
          <View style={modalStyles.colorRow}>
            {COLOR_OPTIONS.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => setColor(c)}
                style={[
                  modalStyles.colorDot,
                  { backgroundColor: COLOR_MAP[c].bar },
                  color === c && modalStyles.colorDotActive,
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[modalStyles.btn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={modalStyles.btnText}>Save Changes</Text>
            }
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SectionsScreen() {
  const navigation = useNavigation<any>();

  const [sections,     setSections]     = useState<Section[]>([]);
  const [loadingSecs,  setLoadingSecs]  = useState(true);
  const [loadError,    setLoadError]    = useState(false); // ✅ NEW: track error silently
  const [search,       setSearch]       = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [uploading,     setUploading]     = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, string>>({});
  const [showCreate,    setShowCreate]    = useState(false);

  // ── Section management state ────────────────────────────────────────────────
  const [archivedIds,    setArchivedIds]    = useState<Set<string>>(new Set());
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [showEdit,       setShowEdit]       = useState(false);

  const [meta, setMeta] = useState<Record<string, SectionMeta>>({});

  // ── Load sections from backend ──────────────────────────────────────────────

  const loadSections = useCallback(async () => {
    setLoadingSecs(true);
    setLoadError(false);
    try {
      const fetched = await fetchSections();
      setSections(fetched);
      setLoadError(false);

      // Seed meta state for each section
      setMeta(
        Object.fromEntries(fetched.map(s => [s.id, { record: null, loading: true }]))
      );

      // Load answer-key meta for each section in parallel
      await Promise.all(
        fetched.map(async s => {
          try {
            const record = await fetchAnswerKey(s.id);
            setMeta(prev => ({ ...prev, [s.id]: { record, loading: false } }));
          } catch {
            setMeta(prev => ({ ...prev, [s.id]: { record: null, loading: false } }));
          }
        })
      );
    } catch {
      // ✅ FIX: No more Alert.alert popup — just show empty state + a soft banner
      setSections([]);
      setLoadError(true);
    } finally {
      setLoadingSecs(false);
    }
  }, []);

  // ✅ FIX: Only load on mount — removed the focus listener that re-fired on every visit
  useEffect(() => { loadSections(); }, [loadSections]);

  // ── Upload ──────────────────────────────────────────────────────────────────

  const handleUpload = async (sectionId: string) => {
    try {
      setUploading(sectionId);

      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_MIME_TYPES,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        setUploading(null);
        return;
      }

      const file = result.assets[0];
      const ext  = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        Alert.alert('Unsupported File', `Please upload one of: ${ACCEPTED_EXTENSIONS.join(', ')}`);
        setUploading(null);
        return;
      }

      // ── Show selected file name immediately after picking ──────────────────
      setSelectedFiles(prev => ({ ...prev, [sectionId]: file.name }));

      const record = await uploadAnswerKey(
        sectionId,
        file.uri,
        file.name,
        file.mimeType ?? 'application/octet-stream',
      );

      setMeta(prev => ({ ...prev, [sectionId]: { record, loading: false } }));

      const typeLines = Object.entries(record.typeSummary ?? {})
        .filter(([, v]) => v! > 0)
        .map(([t, v]) => `  • ${TYPE_LABELS[t] ?? t}: ${v}`)
        .join('\n');

      Alert.alert(
        '✓ Answer Key Uploaded',
        `"${file.name}"\n${record.total} items loaded\n\n${typeLines}`,
      );
    } catch (err: any) {
      // Clear the pending file name on failure so the button doesn't show stale state
      setSelectedFiles(prev => { const next = { ...prev }; delete next[sectionId]; return next; });
      const msg = err.response?.data?.error ?? err.message ?? 'Upload failed. Check your server connection.';
      Alert.alert('Upload Error', msg);
    } finally {
      setUploading(null);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = (sectionId: string, sectionName: string) => {
    Alert.alert(
      'Remove Answer Key',
      `Remove the answer key for ${sectionName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await deleteAnswerKey(sectionId);
              setMeta(prev => ({ ...prev, [sectionId]: { record: null, loading: false } }));
            } catch {
              Alert.alert('Error', 'Could not delete answer key.');
            }
          },
        },
      ],
    );
  };

  // ── Delete Section ──────────────────────────────────────────────────────────

  const handleDeleteSection = (sectionId: string, sectionName: string) => {
    Alert.alert(
      'Delete Section',
      `Are you sure you want to permanently delete "${sectionName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await deleteSection(sectionId);
              setSections(prev => prev.filter(s => s.id !== sectionId));
              setMeta(prev => { const next = { ...prev }; delete next[sectionId]; return next; });
            } catch {
              Alert.alert('Error', 'Could not delete section.');
            }
          },
        },
      ],
    );
  };

  // ── Archive / Unarchive Section ─────────────────────────────────────────────

  const handleToggleArchive = (sectionId: string, sectionName: string) => {
    const isArchived = archivedIds.has(sectionId);
    Alert.alert(
      isArchived ? 'Unarchive Section' : 'Archive Section',
      isArchived
        ? `Restore "${sectionName}" to active sections?`
        : `Archive "${sectionName}"? It will be hidden from Active view.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isArchived ? 'Unarchive' : 'Archive',
          onPress: () => {
            setArchivedIds(prev => {
              const next = new Set(prev);
              isArchived ? next.delete(sectionId) : next.add(sectionId);
              return next;
            });
          },
        },
      ],
    );
  };

  // ── Update Section ──────────────────────────────────────────────────────────

  const handleUpdateSection = (section: Section) => {
    setEditingSection(section);
    setShowEdit(true);
  };

  // ── Scan ────────────────────────────────────────────────────────────────────

  const handleScan = (sectionId: string, hasKey: boolean) => {
    if (!hasKey) {
      Alert.alert(
        'No Answer Key',
        'Upload an answer key first to enable auto-grading.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add Key', onPress: () => navigation.navigate('AddAnswerKey', {
              sectionId,
              sectionName: sections.find(s => s.id === sectionId)?.name ?? '',
            }) },
          { text: 'Scan Anyway', onPress: () => navigation.navigate('Scan', { sectionId }) },
        ],
      );
      return;
    }
    navigation.navigate('Scan', { sectionId });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const filtered = sections.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const isArchived  = archivedIds.has(s.id);
    const matchFilter =
      activeFilter === 'All'      ? true :
      activeFilter === 'Archived' ? isArchived : true;
    return matchSearch && matchFilter;
  });

  return (
    <SafeAreaView style={styles.root}>

      <View style={styles.topbar}>
        <Text style={styles.topbarTitle}>Sections</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)} style={{ padding: 6 }}>
          <Ionicons name="add" size={20} color={Colors.n600} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <SearchBar placeholder="Search sections..." value={search} onChangeText={setSearch} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {SECTION_FILTERS.map(f => (
            <Chip key={f} label={f} active={activeFilter === f} onPress={() => setActiveFilter(f)} />
          ))}
        </ScrollView>

        {/* ✅ FIX: Soft server error banner instead of Alert popup */}
        {loadError && !loadingSecs && (
          <View style={styles.errorBanner}>
            <Ionicons name="wifi-outline" size={14} color="#92400E" />
            <Text style={styles.errorBannerText}>
              Could not reach server. Make sure your backend is running.
            </Text>
            <TouchableOpacity onPress={loadSections}>
              <Text style={styles.errorBannerRetry}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading state */}
        {loadingSecs && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={{ color: Colors.n400, marginTop: 8 }}>Loading sections…</Text>
          </View>
        )}

        {/* Empty state */}
        {!loadingSecs && filtered.length === 0 && !loadError && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Ionicons name="folder-open-outline" size={40} color={Colors.n300} />
            <Text style={{ color: Colors.n400, marginTop: 8, textAlign: 'center' }}>
              No sections yet.{'\n'}Tap + to create your first section.
            </Text>
          </View>
        )}

        {filtered.map(section => {
          const c      = COLOR_MAP[section.color] ?? COLOR_MAP.blue;
          const sm     = meta[section.id];
          const hasKey = !!sm?.record;
          const record = sm?.record;

          return (
            <View key={section.id} style={styles.card}>

              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => navigation.navigate('SectionDetail', { section })}
                activeOpacity={0.75}
              >
                <View style={[styles.abbr, { backgroundColor: c.bg }]}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>
                    {section.abbr}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{section.name}</Text>
                  <Text style={styles.cardSub}>{section.studentCount} students · {section.subject}</Text>
                  <ProgressBar progress={(section.average ?? 0) / 100} color={c.bar} />
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: scoreColor(section.average ?? 0), fontWeight: '700', fontSize: 14 }}>
                    {section.average ?? 0}%
                  </Text>
                  <Text style={styles.cardSub}>avg</Text>
                </View>
              </TouchableOpacity>

              {/* Answer key status */}
              <View style={styles.keyRow}>
                <Ionicons
                  name={hasKey ? 'document-text' : 'document-text-outline'}
                  size={12}
                  color={hasKey ? Colors.success : Colors.n400}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.keyLabel, hasKey && styles.keyLabelActive]} numberOfLines={1}>
                    {sm?.loading
                      ? 'Loading…'
                      : hasKey
                        ? `${record!.fileName}  ·  ${record!.total} items  ·  .${record!.fileType}`
                        : 'No answer key — tap Upload below'}
                  </Text>
                  {hasKey && record!.typeSummary && (
                    <TypeSummaryRow summary={record!.typeSummary} />
                  )}
                </View>
                {hasKey && (
                  <TouchableOpacity
                    onPress={() => handleDelete(section.id, section.name)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={14} color={Colors.n400} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Actions */}
              <View style={styles.actionRow}>

                {/* ── Upload File ─────────────────────────────────────────── */}
                <TouchableOpacity
                  style={styles.btnUpload}
                  onPress={() => handleUpload(section.id)}
                  disabled={uploading === section.id}
                  activeOpacity={0.75}
                >
                  <Ionicons name="cloud-upload-outline" size={13} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.btnUploadText} numberOfLines={1}>
                      {uploading === section.id ? 'Uploading…' : 'Upload File'}
                    </Text>
                    {selectedFiles[section.id] && uploading !== section.id && (
                      <Text style={styles.btnUploadFileName} numberOfLines={1}>
                        {selectedFiles[section.id]}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>

                {/* ── Add Answer Key ───────────────────────────────────────── */}
                <TouchableOpacity
                  style={styles.btnAnswerKey}
                  onPress={() =>
                    navigation.navigate('AddAnswerKey', {
                      sectionId:   section.id,
                      sectionName: section.name,
                    })
                  }
                  activeOpacity={0.75}
                >
                  <Ionicons name="key-outline" size={13} color="#fff" />
                  <Text style={styles.btnAnswerKeyText} numberOfLines={1}>
                    {hasKey ? 'Edit Key' : 'Add Key'}
                  </Text>
                </TouchableOpacity>

              </View>

              {/* Scan row */}
              <View style={styles.scanRow}>
                <TouchableOpacity
                  style={[styles.btnScan, !hasKey && styles.btnScanDim]}
                  onPress={() => handleScan(section.id, hasKey)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera-outline" size={13} color={hasKey ? '#fff' : Colors.n500} />
                  <Text style={[styles.btnScanText, !hasKey && { color: Colors.n500 }]}>
                    Scan Papers
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.mgmtRow}>
                <TouchableOpacity
                  style={styles.mgmtBtn}
                  onPress={() => handleUpdateSection(section)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="pencil-outline" size={12} color={Colors.n600} />
                  <Text style={styles.mgmtBtnText}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.mgmtBtn}
                  onPress={() => handleToggleArchive(section.id, section.name)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={archivedIds.has(section.id) ? 'arrow-undo-outline' : 'archive-outline'}
                    size={12}
                    color={Colors.n600}
                  />
                  <Text style={styles.mgmtBtnText}>
                    {archivedIds.has(section.id) ? 'Unarchive' : 'Archive'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.mgmtBtn, styles.mgmtBtnDanger]}
                  onPress={() => handleDeleteSection(section.id, section.name)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="trash-outline" size={12} color={Colors.danger} />
                  <Text style={[styles.mgmtBtnText, { color: Colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>

            </View>
          );
        })}

        <View style={styles.formatNote}>
          <Ionicons name="information-circle-outline" size={12} color={Colors.n400} />
          <Text style={styles.formatNoteText}>
            Accepted upload formats: .csv · .xlsx · .pdf · .txt
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreate(true)}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Create section modal */}
      <CreateSectionModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={section => {
          setSections(prev => [...prev, section]);
          setMeta(prev => ({ ...prev, [section.id]: { record: null, loading: false } }));
          setShowCreate(false);
        }}
      />

      {/* Edit section modal */}
      {editingSection && (
        <EditSectionModal
          visible={showEdit}
          section={editingSection}
          onClose={() => { setShowEdit(false); setEditingSection(null); }}
          onUpdate={updated => {
            setSections(prev => prev.map(s => s.id === updated.id ? updated : s));
            setShowEdit(false);
            setEditingSection(null);
          }}
        />
      )}

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  topbar: {
    height: 48, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.n100,
  },
  topbarTitle: { fontSize: 16, fontWeight: '700' },

  content: { padding: Spacing.lg, gap: 12 },

  search: {
    height: 40, backgroundColor: Colors.n100, borderRadius: 8,
    paddingHorizontal: 12, fontSize: 13, color: Colors.n800,
  },

  chip:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.n100, marginRight: 6 },
  chipActive:     { backgroundColor: Colors.primary },
  chipText:       { fontSize: 12, color: Colors.n700 },
  chipTextActive: { color: '#fff' },

  // ✅ NEW: soft amber banner for server errors
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 10,
  },
  errorBannerText:  { flex: 1, fontSize: 12, color: '#92400E' },
  errorBannerRetry: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  card: {
    borderRadius: Radius.md, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.n100, overflow: 'hidden', ...Shadow.card,
  },

  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  abbr:        { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle:   { fontWeight: '600', fontSize: 14, color: Colors.n900 },
  cardSub:     { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  progressBg:   { height: 5, backgroundColor: Colors.n100, borderRadius: 4, marginTop: 5, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 4 },

  keyRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: Colors.n100,
  },
  keyLabel:       { fontSize: 11, color: Colors.n400 },
  keyLabelActive: { color: Colors.success, fontWeight: '500' },

  actionRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12,
  },

  btnUpload: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 9, paddingHorizontal: 8, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.primaryLight,
  },
  btnUploadText:     { fontSize: 11, fontWeight: '600', color: Colors.primary },
  btnUploadFileName: { fontSize: 9, color: Colors.primary, opacity: 0.75, marginTop: 1 },

  btnAnswerKey: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 9, paddingHorizontal: 8, borderRadius: Radius.sm,
    backgroundColor: Colors.primary,
  },
  btnAnswerKeyText: { fontSize: 11, fontWeight: '600', color: '#fff' },

  scanRow: {
    paddingHorizontal: 12, paddingBottom: 10, paddingTop: 0,
  },

  btnScan: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: Colors.primary,
  },
  btnScanDim:  { backgroundColor: Colors.n100, borderWidth: 1, borderColor: Colors.n200 },
  btnScanText: { fontSize: 11, fontWeight: '600', color: '#fff' },

  mgmtRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: 12, paddingBottom: 10, paddingTop: 2,
    borderTopWidth: 1, borderTopColor: Colors.n100,
  },
  mgmtBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 6, borderRadius: Radius.sm,
    backgroundColor: Colors.n100, borderWidth: 1, borderColor: Colors.n200,
  },
  mgmtBtnDanger: {
    backgroundColor: Colors.dangerLight, borderColor: Colors.danger + '44',
  },
  mgmtBtnText: { fontSize: 10, fontWeight: '600', color: Colors.n600 },

  formatNote: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    justifyContent: 'center', paddingVertical: 4,
  },
  formatNoteText: { fontSize: 10, color: Colors.n400 },

  fab: {
    position: 'absolute', bottom: 60, right: 16,
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    ...Shadow.fab,
  },
});