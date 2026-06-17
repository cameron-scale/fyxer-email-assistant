// App.js — the entry point. Sets up the shared store and a tiny screen navigator.
//
// We keep navigation simple on purpose (no extra library): there's a "stack" of
// screens in state. navigate() pushes a screen, goBack() pops it. Easy to follow.

import React, { useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { colors } from './src/theme';
import { StoreProvider } from './src/store';
import InboxScreen from './src/screens/InboxScreen';
import TriageScreen from './src/screens/TriageScreen';
import DetailScreen from './src/screens/DetailScreen';
import ConnectScreen from './src/screens/ConnectScreen';

const SCREENS = {
  Inbox: InboxScreen,
  Triage: TriageScreen,
  Detail: DetailScreen,
  Connect: ConnectScreen,
};

export default function App() {
  // stack is an array like [{ name: 'Inbox' }, { name: 'Detail', params: {...} }]
  const [stack, setStack] = useState([{ name: 'Inbox', params: {} }]);

  const navigate = useCallback((name, params = {}) => {
    setStack((s) => [...s, { name, params }]);
  }, []);

  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const top = stack[stack.length - 1];
  const Screen = SCREENS[top.name] || InboxScreen;

  return (
    <StoreProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        <Screen navigate={navigate} goBack={goBack} params={top.params} />
      </View>
    </StoreProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
