// TabBar.js — the frosted bottom tab bar with a LONG-PRESS EDITOR.
//
// Layout: 3 customizable slots · [compose] · 3 customizable slots. The compose
// button is hardcoded in the center and can never be moved or removed. Empty
// slots are invisible in normal mode (blank flex space). Long-press any tab icon
// for 480ms to enter edit mode: icons wiggle, each slot gets a remove badge,
// empty slots show an "Add" target, and you can drag to reorder. State lives in
// prefs.tabs (6 entries; null = empty) and the bar re-renders from it.

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, PanResponder, Dimensions, ScrollView, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useStore } from '../store';
import { useTourTarget } from '../lib/tour';
import { TAB_DEFS, PICKER_SECTIONS, DEFAULT_TABS, normalizeTabs } from '../lib/tabs';

const SCREEN_W = Dimensions.get('window').width;

// Map a cell index (0..6, where 3 is compose) to a slot index (0..5) or -1.
function cellToSlot(cell) {
  if (cell < 0 || cell > 6 || cell === 3) return -1;
  return cell < 3 ? cell : cell - 1;
}

export default function TabBar({ active, onNavigate, onCompose, inboxBadge = 0 }) {
  const barRef = useTourTarget('tabbar');
  const { prefs, setPrefs, vips } = useStore();
  const slots = useMemo(() => normalizeTabs(prefs?.tabs || DEFAULT_TABS), [prefs?.tabs]);

  const [editMode, setEditMode] = useState(false);
  const [pickerFor, setPickerFor] = useState(null); // slot index awaiting an add
  const [toast, setToast] = useState('');
  const [drag, setDrag] = useState(null); // { from, key, hover }
  const dragRef = useRef(null);
  const ghost = useRef(new Animated.ValueXY()).current;
  const barW = useRef(SCREEN_W);

  // Per-slot wiggle values (staggered so they don't move in unison).
  const wig = useRef([0, 1, 2, 3, 4, 5].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = [];
    if (editMode) {
      wig.forEach((v, i) => {
        const loop = Animated.loop(Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 140, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(v, { toValue: -1, duration: 140, easing: Easing.linear, useNativeDriver: true }),
        ]));
        const seq = Animated.sequence([Animated.delay(i * 35), loop]);
        seq.start();
        loops.push(seq);
      });
    } else {
      wig.forEach((v) => v.setValue(0));
    }
    return () => loops.forEach((l) => l.stop());
  }, [editMode]); // eslint-disable-line

  const persist = (next) => setPrefs({ tabs: normalizeTabs(next) });
  const exitEdit = () => { setEditMode(false); setDrag(null); dragRef.current = null; };
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 1600); };

  const removeSlot = (i) => { const next = slots.slice(); next[i] = null; persist(next); };
  const addToSlot = (i, key) => {
    const next = slots.slice();
    // If the tab is already somewhere, clear its old slot (no duplicates).
    const old = next.indexOf(key); if (old >= 0) next[old] = null;
    next[i] = key; persist(next);
    setPickerFor(null);
    showToast(`${TAB_DEFS[key].label} added`);
  };

  // ── Drag to reorder (one PanResponder on the bar; source from touch x) ───────
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (e, g) => {
      if (!editModeRef.current) return false;
      if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) return false;
      const cw = barW.current / 7;
      const slot = cellToSlot(Math.floor(g.x0 / cw));
      return slot >= 0 && Boolean(slotsRef.current[slot]);
    },
    onPanResponderGrant: (e, g) => {
      const cw = barW.current / 7;
      const from = cellToSlot(Math.floor(g.x0 / cw));
      const key = slotsRef.current[from];
      if (from < 0 || !key) return;
      ghost.setValue({ x: g.moveX || g.x0, y: g.moveY || g.y0 });
      const d = { from, key, hover: from };
      dragRef.current = d; setDrag(d);
    },
    onPanResponderMove: (e, g) => {
      if (!dragRef.current) return;
      ghost.setValue({ x: g.moveX, y: g.moveY });
      const cw = barW.current / 7;
      const hover = cellToSlot(Math.floor(g.moveX / cw));
      if (hover !== dragRef.current.hover) {
        dragRef.current = { ...dragRef.current, hover };
        setDrag({ ...dragRef.current });
      }
    },
    onPanResponderRelease: () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      const { from, hover } = d;
      if (hover < 0 || hover === from) return; // dropped outside or on itself
      const next = slotsRef.current.slice();
      const tmp = next[hover];
      next[hover] = next[from];
      next[from] = tmp; // swap (works for empty target too — leaves source empty)
      persistRef.current(next);
    },
    onPanResponderTerminate: () => { dragRef.current = null; setDrag(null); },
  })).current;

  // Refs so the PanResponder (created once) always sees fresh values.
  const editModeRef = useRef(editMode); editModeRef.current = editMode;
  const slotsRef = useRef(slots); slotsRef.current = slots;
  const persistRef = useRef(persist); persistRef.current = persist;

  const renderSlot = (key, slotIndex, wigIndex) => {
    const isDragSrc = drag && drag.from === slotIndex;
    const isHover = drag && drag.hover === slotIndex && drag.from !== slotIndex;
    const rot = wig[wigIndex].interpolate({ inputRange: [-1, 1], outputRange: ['-2.5deg', '2.5deg'] });

    if (!key) {
      // Empty: invisible normally; an "Add" target in edit mode.
      if (!editMode) return <View key={`e${slotIndex}`} style={styles.cell} />;
      return (
        <Pressable key={`e${slotIndex}`} style={styles.cell} onPress={() => setPickerFor(slotIndex)}>
          <Animated.View style={[styles.addBox, isHover && styles.hoverBox]}>
            <Ionicons name="add" size={20} color={isHover ? colors.blue : colors.onDarkFaint} />
          </Animated.View>
          <Text style={styles.label}>Add</Text>
        </Pressable>
      );
    }

    const def = TAB_DEFS[key];
    const isActive = active === key;
    const badge = key === 'Inbox' ? inboxBadge : (key === 'VIPSenders' ? (vips?.length || 0) : 0);
    return (
      <View key={key} style={[styles.cell, isHover && styles.hoverCell]}>
        <Pressable
          style={styles.cellPress}
          onPress={editMode ? undefined : () => onNavigate(key)}
          onLongPress={editMode ? undefined : () => setEditMode(true)}
          delayLongPress={480}
        >
          <Animated.View style={{ transform: [{ rotate: editMode ? rot : '0deg' }], opacity: isDragSrc ? 0.25 : 1 }}>
            <View>
              <Ionicons name={def.icon} size={21} color={isActive ? colors.blue : colors.onDarkFaint} />
              {badge > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>}
            </View>
            <Text style={[styles.label, isActive && { color: colors.blue }]} numberOfLines={1}>{def.label}</Text>
          </Animated.View>
        </Pressable>
        {editMode && (
          <Pressable style={styles.removeBadge} hitSlop={8} onPress={() => removeSlot(slotIndex)}>
            <View style={styles.removeLine} />
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <>
      {/* Dim overlay + header (above content, behind the bar). Tap to exit. */}
      {editMode && (
        <Pressable style={styles.overlay} onPress={exitEdit}>
          <View style={styles.editHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.editTitle}>Customize Tab Bar</Text>
              <Text style={styles.editSub}>Drag to reorder, minus to remove, plus to add.</Text>
            </View>
            <Pressable style={styles.doneBtn} onPress={exitEdit}><Text style={styles.doneText}>Done</Text></Pressable>
          </View>
        </Pressable>
      )}

      {/* The bar itself */}
      <View
        ref={barRef} collapsable={false} style={styles.bar}
        onLayout={(e) => { barW.current = e.nativeEvent.layout.width; }}
        {...pan.panHandlers}
      >
        {renderSlot(slots[0], 0, 0)}
        {renderSlot(slots[1], 1, 1)}
        {renderSlot(slots[2], 2, 2)}
        <View style={styles.cell}>
          <Pressable style={styles.composeWrap} onPress={onCompose} disabled={editMode}>
            <View style={styles.composeBtn}><Ionicons name="pencil-sharp" size={21} color="#fff" /></View>
          </Pressable>
        </View>
        {renderSlot(slots[3], 3, 3)}
        {renderSlot(slots[4], 4, 4)}
        {renderSlot(slots[5], 5, 5)}
      </View>

      {/* Floating ghost that follows the finger (free of the bar's clipping). */}
      {drag && drag.key && (
        <View style={styles.ghostLayer} pointerEvents="none">
          <Animated.View style={[styles.ghost, { borderColor: `${TAB_DEFS[drag.key].color}99`, transform: [
            { translateX: Animated.subtract(ghost.x, 28) }, { translateY: Animated.subtract(ghost.y, 28) }, { scale: 1.18 },
          ] }]}>
            <Ionicons name={TAB_DEFS[drag.key].icon} size={22} color={TAB_DEFS[drag.key].color} />
            <Text style={styles.ghostLabel} numberOfLines={1}>{TAB_DEFS[drag.key].label}</Text>
          </Animated.View>
        </View>
      )}

      {/* Add picker */}
      <AddPicker
        visible={pickerFor != null}
        present={slots.filter(Boolean)}
        onPick={(key) => addToSlot(pickerFor, key)}
        onClose={() => setPickerFor(null)}
      />

      {/* Toast */}
      {!!toast && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}><Ionicons name="checkmark-circle" size={15} color="#fff" /><Text style={styles.toastText}>{toast}</Text></View>
        </View>
      )}
    </>
  );
}

function AddPicker({ visible, present, onPick, onClose }) {
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slide, { toValue: visible ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible]); // eslint-disable-line
  if (!visible) return null;
  const y = slide.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });
  return (
    <View style={styles.pickerRoot}>
      <Pressable style={styles.pickerBackdrop} onPress={onClose} />
      <Animated.View style={[styles.pickerSheet, { transform: [{ translateY: y }] }]}>
        <View style={styles.handle} />
        <Text style={styles.pickerTitle}>Add to Tab Bar</Text>
        <Text style={styles.pickerSub}>Choose what goes in the empty slot.</Text>
        <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 6 }}>
          {PICKER_SECTIONS.map((sec) => (
            <View key={sec.title}>
              <Text style={styles.secLabel}>{sec.title}</Text>
              {sec.keys.map((k) => {
                const def = TAB_DEFS[k];
                const taken = present.includes(k);
                return (
                  <Pressable key={k} style={[styles.row, taken && styles.rowTaken]} disabled={taken} onPress={() => onPick(k)}>
                    <View style={[styles.rowIcon, { backgroundColor: `${def.color}1A` }]}>
                      <Ionicons name={def.icon} size={18} color={def.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{def.label}</Text>
                      <Text style={styles.rowDesc} numberOfLines={1}>{def.desc}</Text>
                    </View>
                    {taken && <Ionicons name="checkmark-circle" size={20} color={colors.blue} />}
                  </Pressable>
                );
              })}
            </View>
          ))}
          <View style={{ height: 30 }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.tabBar,
    borderTopWidth: 1, borderTopColor: colors.onDarkBorder,
    paddingTop: 8, paddingBottom: 30, paddingHorizontal: 4, zIndex: 20,
  },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  cellPress: { alignItems: 'center', gap: 3, paddingVertical: 4 },
  hoverCell: { backgroundColor: 'rgba(0,113,227,0.18)', borderRadius: 12 },
  label: { fontSize: 9, fontWeight: '600', color: colors.onDarkFaint },
  badge: { position: 'absolute', top: -5, left: 12, backgroundColor: colors.blue, borderRadius: 8, minWidth: 15, height: 15, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 8.5, fontWeight: '800' },
  composeWrap: { alignItems: 'center', justifyContent: 'center' },
  composeBtn: {
    width: 46, height: 46, borderRadius: 15, backgroundColor: colors.blue,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.blue, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  // Empty-slot add target (edit mode)
  addBox: { width: 34, height: 30, borderRadius: 9, borderWidth: 1.5, borderColor: colors.onDarkBorder, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  hoverBox: { borderColor: colors.blue, backgroundColor: 'rgba(0,113,227,0.18)' },
  // Remove badge
  removeBadge: { position: 'absolute', top: -2, left: '50%', marginLeft: -22, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  removeLine: { width: 8, height: 2, borderRadius: 1, backgroundColor: '#fff' },
  // Edit overlay
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', zIndex: 15 },
  editHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 96, marginHorizontal: 16, backgroundColor: colors.surface, borderRadius: 16, padding: 16 },
  editTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  editSub: { fontSize: 12.5, color: colors.ink3, marginTop: 2 },
  doneBtn: { backgroundColor: colors.blue, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 18 },
  doneText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  // Ghost
  ghostLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 },
  ghost: { position: 'absolute', width: 56, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 2, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  ghostLabel: { fontSize: 9, fontWeight: '700', color: colors.ink2 },
  // Picker
  pickerRoot: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, justifyContent: 'flex-end' },
  pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  pickerSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 8, maxHeight: '78%' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.hairline, marginBottom: 12 },
  pickerTitle: { fontSize: 19, fontWeight: '800', color: colors.ink },
  pickerSub: { fontSize: 13.5, color: colors.ink3, marginTop: 2 },
  secLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.ink4, marginTop: 18, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowTaken: { opacity: 0.45 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowDesc: { fontSize: 12.5, color: colors.ink3, marginTop: 1 },
  // Toast
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 110, alignItems: 'center', zIndex: 80 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(20,22,28,0.95)', borderRadius: 22, paddingVertical: 10, paddingHorizontal: 18 },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
