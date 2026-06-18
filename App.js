// App.js — entry point. Sets up the shared store, a tiny screen navigator, the
// ScaleMail bottom tab bar, and the slide-up Compose / Profile sheets.

import React, { useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { colors } from './src/theme';
import { StoreProvider, useStore } from './src/store';
import InboxScreen from './src/screens/InboxScreen';
import TriageScreen from './src/screens/TriageScreen';
import DetailScreen from './src/screens/DetailScreen';
import ConnectScreen from './src/screens/ConnectScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import MailboxScreen from './src/screens/MailboxScreen';
import ReplyScreen from './src/screens/ReplyScreen';
import SignatureScreen from './src/screens/SignatureScreen';
import TabBar from './src/components/TabBar';
import UndoSnackbar from './src/components/UndoSnackbar';
import BottomSheet from './src/components/BottomSheet';
import ComposeSheet from './src/components/ComposeSheet';
import ProfileSheet from './src/components/ProfileSheet';

const StarredScreen = (props) => <InboxScreen {...props} starred />;

const SCREENS = {
  Inbox: InboxScreen,
  Starred: StarredScreen,
  Triage: TriageScreen,
  Detail: DetailScreen,
  Connect: ConnectScreen,
  Settings: SettingsScreen,
  Sent: MailboxScreen,
  Drafts: MailboxScreen,
  Reply: ReplyScreen,
  Signature: SignatureScreen,
};

// Screens that show the bottom tab bar and can be switched between as tabs.
// Settings now lives behind the profile avatar, not the tab bar.
const TAB_SCREENS = ['Inbox', 'Starred', 'Sent', 'Drafts'];
const DARK_SCREENS = ['Inbox', 'Starred', 'Triage', 'Sent', 'Drafts'];

function AppShell() {
  const { emails } = useStore();
  const [stack, setStack] = useState([{ name: 'Inbox', params: {} }]);
  const [sheet, setSheet] = useState(null); // 'compose' | 'profile' | null

  const navigate = useCallback((name, params = {}) => setStack((s) => [...s, { name, params }]), []);
  const goBack = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const switchTab = useCallback((name) => setStack([{ name, params: {} }]), []);
  const openSheet = useCallback((name) => setSheet(name), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  const onTabNavigate = useCallback((name) => {
    if (TAB_SCREENS.includes(name)) switchTab(name);
    else navigate(name); // Triage pushes as a full screen
  }, [switchTab, navigate]);

  const top = stack[stack.length - 1];
  const Screen = SCREENS[top.name] || InboxScreen;
  const showTabBar = TAB_SCREENS.includes(top.name);
  const inboxBadge = emails.filter((e) => e.read === false).length;

  return (
    <View style={styles.root}>
      <StatusBar style={DARK_SCREENS.includes(top.name) ? 'light' : 'dark'} />
      <Screen
        navigate={navigate}
        goBack={goBack}
        params={top.params}
        route={top.name}
        openSheet={openSheet}
      />
      {top.name !== 'Triage' && <UndoSnackbar />}
      {showTabBar && (
        <TabBar
          active={top.name}
          onNavigate={onTabNavigate}
          onCompose={() => openSheet('compose')}
          inboxBadge={inboxBadge}
        />
      )}

      {/* Slide-up sheets */}
      <BottomSheet visible={sheet === 'compose'} onClose={closeSheet} heightPct={0.9}>
        <ComposeSheet onClose={closeSheet} />
      </BottomSheet>
      <BottomSheet visible={sheet === 'profile'} onClose={closeSheet} heightPct={0.72}>
        <ProfileSheet
          onClose={closeSheet}
          onOpenSettings={() => { closeSheet(); navigate('Settings'); }}
          onOpenConnect={() => navigate('Connect')}
        />
      </BottomSheet>
    </View>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
