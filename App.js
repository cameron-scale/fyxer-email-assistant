// App.js — entry point. Sets up the shared store, a tiny screen navigator, and
// the ScaleMail bottom tab bar.
//
// Navigation is intentionally simple: a "stack" of screens in state. Tab buttons
// reset the stack (switchTab); everything else pushes on top (navigate / goBack).

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
import ComposeScreen from './src/screens/ComposeScreen';
import TabBar from './src/components/TabBar';
import UndoSnackbar from './src/components/UndoSnackbar';

const StarredScreen = (props) => <InboxScreen {...props} starred />;

const SCREENS = {
  Inbox: InboxScreen,
  Starred: StarredScreen,
  Triage: TriageScreen,
  Detail: DetailScreen,
  Connect: ConnectScreen,
  Settings: SettingsScreen,
  Compose: ComposeScreen,
};

// Screens that show the bottom tab bar and can be switched between as tabs.
const TAB_SCREENS = ['Inbox', 'Starred', 'Settings'];

function AppShell() {
  const { emails } = useStore();
  const [stack, setStack] = useState([{ name: 'Inbox', params: {} }]);

  const navigate = useCallback((name, params = {}) => {
    setStack((s) => [...s, { name, params }]);
  }, []);
  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);
  const switchTab = useCallback((name) => {
    setStack([{ name, params: {} }]);
  }, []);

  const onTabNavigate = useCallback((name) => {
    if (TAB_SCREENS.includes(name)) switchTab(name);
    else navigate(name); // Triage / Compose push as full screens
  }, [switchTab, navigate]);

  const top = stack[stack.length - 1];
  const Screen = SCREENS[top.name] || InboxScreen;
  const showTabBar = TAB_SCREENS.includes(top.name);
  const inboxBadge = emails.filter((e) => e.read === false).length;

  return (
    <View style={styles.root}>
      <StatusBar style={top.name === 'Inbox' || top.name === 'Starred' || top.name === 'Triage' ? 'light' : 'dark'} />
      <Screen navigate={navigate} goBack={goBack} params={top.params} />
      {top.name !== 'Triage' && <UndoSnackbar />}
      {showTabBar && (
        <TabBar active={top.name} onNavigate={onTabNavigate} inboxBadge={inboxBadge} />
      )}
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
