// App.js — entry point. Sets up the shared store, a tiny screen navigator, the
// ScaleMail bottom tab bar, and the slide-up Compose / Profile sheets.

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { colors } from './src/theme';
import { StoreProvider, useStore } from './src/store';
import AuroraBackground from './src/components/AuroraBackground';
import InboxScreen from './src/screens/InboxScreen';
import TriageScreen from './src/screens/TriageScreen';
import DetailScreen from './src/screens/DetailScreen';
import ConnectScreen from './src/screens/ConnectScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import MailboxScreen from './src/screens/MailboxScreen';
import MailboxDrawerScreen from './src/screens/MailboxDrawerScreen';
import FolderScreen from './src/screens/FolderScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import ThreadScreen from './src/screens/ThreadScreen';
import ReplyScreen from './src/screens/ReplyScreen';
import SignatureScreen from './src/screens/SignatureScreen';
import SignatureEditorScreen from './src/screens/SignatureEditorScreen';
import CategoriesScreen from './src/screens/CategoriesScreen';
import DigestScreen from './src/screens/DigestScreen';
import HealthScreen from './src/screens/HealthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ProfilingScreen from './src/screens/ProfilingScreen';
import BulkTriageScreen from './src/screens/BulkTriageScreen';
import ArchivingSoonScreen from './src/screens/ArchivingSoonScreen';
import TabBar from './src/components/TabBar';
import UndoSnackbar from './src/components/UndoSnackbar';
import OnboardingTour from './src/components/OnboardingTour';
import LearnInboxOverlay from './src/components/LearnInboxOverlay';
import { DEMO_URGENT_ID } from './src/lib/demo';
import { TAB_DEFS } from './src/lib/tabs';
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
  MailboxDrawer: MailboxDrawerScreen,
  Folder: FolderScreen,
  Calendar: CalendarScreen,
  Thread: ThreadScreen,
  Reply: ReplyScreen,
  Signature: SignatureScreen,
  SignatureEditor: SignatureEditorScreen,
  Categories: CategoriesScreen,
  Digest: DigestScreen,
  Health: HealthScreen,
  Onboarding: OnboardingScreen,
  Profiling: ProfilingScreen,
  BulkTriage: BulkTriageScreen,
  ArchivingSoon: ArchivingSoonScreen,
};

// Screens that show the bottom tab bar and can be switched between as tabs.
// Settings now lives behind the profile avatar, not the tab bar.
const TAB_SCREENS = ['Inbox', 'Starred', 'Sent', 'Drafts'];
const DARK_SCREENS = ['Inbox', 'Starred', 'Triage', 'Sent', 'Drafts', 'MailboxDrawer', 'Folder', 'Calendar', 'Thread', 'Onboarding', 'Profiling', 'BulkTriage', 'Digest', 'ArchivingSoon'];

// Which aurora palette a top-level screen uses (Detail sets its own per-email).
const SCREEN_PALETTE = { Starred: 'starred', Sent: 'sent', Drafts: 'drafts' };

function AppShell() {
  const { emails, setPalette, tourActive, mailboxUnread, openWellKnownFolder, prefs, accounts, mailAccounts, bootstrapped } = useStore();
  const [stack, setStack] = useState([{ name: 'Inbox', params: {} }]);
  const [sheet, setSheet] = useState(null); // 'compose' | 'profile' | null

  // Genuine first install (no accounts, never onboarded) → start in onboarding.
  const onboardGate = useRef(false);
  useEffect(() => {
    if (onboardGate.current || !bootstrapped) return;
    onboardGate.current = true;
    const hasAccounts = (mailAccounts && mailAccounts.length) || accounts?.outlook || accounts?.gmail || accounts?.icloud;
    if (!prefs?.hasSeenOnboarding && !hasAccounts) setStack([{ name: 'Onboarding', params: {} }]);
  }, [bootstrapped]); // eslint-disable-line

  // Drive the app through screens during the onboarding tour.
  const handleTourAction = useCallback((action) => {
    setSheet(null);
    if (action === 'inbox') setStack([{ name: 'Inbox', params: {} }]);
    else if (action === 'openEmail') setStack([{ name: 'Inbox', params: {} }, { name: 'Detail', params: { id: DEMO_URGENT_ID } }]);
    else if (action === 'closeEmail') setStack([{ name: 'Inbox', params: {} }]);
    else if (action === 'openZip') setStack([{ name: 'Inbox', params: {} }, { name: 'Triage', params: {} }]);
    else if (action === 'closeZip') setStack([{ name: 'Inbox', params: {} }]);
  }, []);

  // When the tutorial starts, make sure we're on the Inbox behind the overlay.
  useEffect(() => { if (tourActive) setStack([{ name: 'Inbox', params: {} }]); }, [tourActive]);

  const navigate = useCallback((name, params = {}) => {
    // "Go to Inbox" from onboarding/profiling/etc. resets to the inbox root.
    if (name === 'Inbox') { setStack([{ name: 'Inbox', params }]); return; }
    setStack((s) => [...s, { name, params }]);
  }, []);
  const goBack = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const switchTab = useCallback((name) => setStack([{ name, params: {} }]), []);
  const openSheet = useCallback((name) => setSheet(name), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  const onTabNavigate = useCallback((key) => {
    const nav = TAB_DEFS[key]?.nav || (TAB_SCREENS.includes(key) ? { tab: key } : { push: key });
    if (nav.tab) switchTab(nav.tab);
    else if (nav.filter) setStack([{ name: 'Inbox', params: { filter: nav.filter } }]); // smart-folder tab
    else if (nav.folder) { openWellKnownFolder(nav.folder, nav.name); navigate('Folder'); }
    else if (nav.push) navigate(nav.push); // Triage / Digest push as full screens
    else switchTab(key);
  }, [switchTab, navigate, openWellKnownFolder]);

  const top = stack[stack.length - 1];
  const Screen = SCREENS[top.name] || InboxScreen;
  const showTabBar = TAB_SCREENS.includes(top.name);
  // Prefer the mailbox's true unread count (matches Outlook) over just-loaded mail.
  const loadedUnread = emails.filter((e) => e.read === false).length;
  const inboxBadge = mailboxUnread != null ? mailboxUnread : loadedUnread;

  // Shift the aurora palette to match the current folder (Detail handles per-email).
  useEffect(() => {
    if (top.name !== 'Detail') setPalette(SCREEN_PALETTE[top.name] || 'default');
  }, [top.name, setPalette]);

  return (
    <View style={styles.root}>
      <StatusBar style={DARK_SCREENS.includes(top.name) ? 'light' : 'dark'} />
      <AuroraBackground />
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
          onOpenDigest={() => navigate('Digest')}
          onOpenHealth={() => navigate('Health')}
          onOpenCalendar={() => navigate('Calendar')}
        />
      </BottomSheet>

      {/* First-launch guided tour (sits above everything) */}
      <OnboardingTour onAction={handleTourAction} />

      {/* Full-screen "learn my inbox" overlay (ring → frosted "Inbox ready") */}
      <LearnInboxOverlay />
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
