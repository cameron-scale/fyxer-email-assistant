// BulkTriageScreen.js
// A self-contained, multi-step "Bulk Triage" flow for ScaleMail. It walks the
// user from an intro, through a (mock) scan, into per-bucket review, a confirm
// summary, and a "done" screen with recurrence rules. All decisions live in
// component state — nothing here mutates the global store except navigation.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  Modal,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, space, font, radius } from '../theme';
import { useStore } from '../store';

// ── Mock data ───────────────────────────────────────────────────────────────

const ARCHIVING_SOON = 8372;
const TOTAL_UNREAD = 11124;

const CAT_COLORS = {
  slate: '#6B7280',
  teal: '#2DD4BF',
  amber: '#F59E0B',
  indigo: '#818CF8',
  blue: '#60A5FA',
  red: '#EF4444',
};

const GREEN = '#34D399';
const PURPLE = '#A78BFA';

// The eight buckets exactly as specified.
const BUCKETS = [
  {
    id: 'promotions',
    name: 'Promotions and Deals',
    icon: 'pricetag',
    color: CAT_COLORS.slate,
    type: 'promotional emails',
    count: 4218,
    confidence: 99,
    recommendation: 'Archive',
    defaultAction: 'archive',
    warning: null,
  },
  {
    id: 'newsletters',
    name: 'Newsletters',
    icon: 'newspaper',
    color: CAT_COLORS.slate,
    type: 'newsletters',
    count: 797,
    confidence: 99,
    recommendation: 'Archive',
    defaultAction: 'archive',
    warning: null,
  },
  {
    id: 'notifications',
    name: 'App Notifications',
    icon: 'notifications',
    color: CAT_COLORS.slate,
    type: 'automated notifications',
    count: 2866,
    confidence: 99,
    recommendation: 'Archive',
    defaultAction: 'archive',
    warning: null,
  },
  {
    id: 'social',
    name: 'Social and Community',
    icon: 'people',
    color: CAT_COLORS.teal,
    type: 'social updates',
    count: 1441,
    confidence: 97,
    recommendation: 'Archive',
    defaultAction: 'archive',
    warning:
      'Heads up: about 3% of this group could be direct messages from people, not automated social updates. Review before archiving.',
  },
  {
    id: 'receipts',
    name: 'Receipts and Invoices',
    icon: 'receipt',
    color: CAT_COLORS.amber,
    type: 'receipts and invoices',
    count: 384,
    confidence: 99,
    recommendation: 'Snooze 30 days',
    defaultAction: 'snooze',
    warning:
      'Some of these may be tax-relevant. They will be flagged and surfaced separately so they are not lost.',
  },
  {
    id: 'recaps',
    name: 'Meeting Recaps',
    icon: 'document-text',
    color: CAT_COLORS.indigo,
    type: 'meeting recaps',
    count: 41,
    confidence: 99,
    recommendation: 'Keep',
    defaultAction: 'keep',
    warning: null,
  },
  {
    id: 'clients',
    name: 'Client Emails',
    icon: 'briefcase',
    color: CAT_COLORS.blue,
    type: 'client conversations',
    count: 35,
    confidence: 99,
    recommendation: 'Keep',
    defaultAction: 'keep',
    warning: null,
  },
  {
    id: 'urgent',
    name: 'Urgent and Action Items',
    icon: 'alert-circle',
    color: CAT_COLORS.red,
    type: 'time-sensitive emails',
    count: 342,
    confidence: 99,
    recommendation: 'Review',
    defaultAction: 'review',
    warning:
      'Do not bulk-archive this group. These look time-sensitive and likely need a personal response.',
  },
];

// A handful of fake previews per bucket so each card has something to scroll.
const PREVIEW_SENDERS = [
  ['Nike', 'Final hours — 30% off everything ends tonight', 'Jun 18'],
  ['Spotify', 'Your Discover Weekly is ready to play', 'Jun 18'],
  ['Airbnb', 'Deals near you: weekend getaways under $120', 'Jun 17'],
  ['Medium Daily', 'The 5 habits of highly effective engineers and', 'Jun 17'],
  ['LinkedIn', 'You appeared in 12 searches this week', 'Jun 16'],
  ['GitHub', '[scalembs/app] 3 new notifications since you', 'Jun 16'],
  ['Slack', 'New message in #general and 4 other channels', 'Jun 15'],
  ['Stripe', 'Your receipt for invoice #INV-20418', 'Jun 15'],
  ['Amazon', 'Your order has shipped — arriving Thursday', 'Jun 14'],
  ['Notion', 'Weekly digest: 8 updates across your workspace', 'Jun 14'],
];

function buildPreviews(bucket) {
  // Deterministic-ish slice so each bucket shows a few distinct rows.
  const start = (bucket.count + bucket.name.length) % PREVIEW_SENDERS.length;
  const rows = [];
  for (let i = 0; i < 6; i += 1) {
    rows.push(PREVIEW_SENDERS[(start + i) % PREVIEW_SENDERS.length]);
  }
  return rows;
}

const SCAN_MESSAGES = [
  'Reading sender patterns',
  'Applying your preferences',
  'Grouping by topic',
  'Checking email age',
  'Cross-referencing your interests',
  'Detecting newsletters versus deals',
  'Flagging action items',
  'Checking confidence thresholds',
  'Building triage groups',
];

const ACTIONS = [
  { key: 'archive', label: 'Archive', icon: 'archive-outline' },
  { key: 'snooze', label: 'Snooze', icon: 'time-outline' },
  { key: 'keep', label: 'Keep', icon: 'mail-outline' },
  { key: 'review', label: 'Review', icon: 'eye-outline' },
  { key: 'more', label: 'More', icon: 'ellipsis-horizontal' },
];

const ACTION_LABEL = {
  archive: 'Archive',
  snooze: 'Snooze 30 days',
  keep: 'Keep',
  review: 'Review',
};

const MORE_OPTIONS = [
  'Mark all as read',
  'Unsubscribe from all',
  'Move to folder',
  'Exclude certain senders from group',
  'Split into sub-groups',
  'Apply label',
];

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BulkTriageScreen({ goBack, navigate, params }) {
  const store = useStore();
  const hasSeenOnboarding = store?.prefs?.hasSeenOnboarding;

  // Onboarding gate. Runs as an effect so we never call navigate during render.
  useEffect(() => {
    if (!hasSeenOnboarding) navigate && navigate('Onboarding');
  }, [hasSeenOnboarding, navigate]);
  if (!hasSeenOnboarding) return null;

  // step: 'intro' | 'scanning' | 'review' | 'confirm' | 'done'
  const [step, setStep] = useState('intro');
  // decisions: { [bucketId]: actionKey }  (only 'archive'|'snooze'|'keep'|'review')
  const [decisions, setDecisions] = useState({});

  const decidedIds = Object.keys(decisions);
  const decidedBuckets = BUCKETS.filter((b) => decisions[b.id]);
  const undecidedBuckets = BUCKETS.filter((b) => !decisions[b.id]);

  const handledEmails = useMemo(
    () => decidedBuckets.reduce((sum, b) => sum + b.count, 0),
    [decidedBuckets],
  );

  // Per-action email tallies for the "Done" stat grid.
  const tally = useMemo(() => {
    const t = { archive: 0, snooze: 0, keep: 0, review: 0 };
    decidedBuckets.forEach((b) => {
      t[decisions[b.id]] += b.count;
    });
    return t;
  }, [decidedBuckets, decisions]);

  const setDecision = (bucketId, action) =>
    setDecisions((d) => ({ ...d, [bucketId]: action }));
  const clearDecision = (bucketId) =>
    setDecisions((d) => {
      const next = { ...d };
      delete next[bucketId];
      return next;
    });

  return (
    <SafeAreaView style={styles.safe}>
      <View pointerEvents="none" style={styles.scrim} />
      {step === 'intro' && (
        <IntroStep goBack={goBack} onStart={() => setStep('scanning')} />
      )}
      {step === 'scanning' && (
        <ScanningStep
          onCancel={goBack}
          onDone={() => setStep('review')}
        />
      )}
      {step === 'review' && (
        <ReviewStep
          decisions={decisions}
          setDecision={setDecision}
          clearDecision={clearDecision}
          decidedCount={decidedIds.length}
          handledEmails={handledEmails}
          onBack={goBack}
          onApply={() => setStep('confirm')}
        />
      )}
      {step === 'confirm' && (
        <ConfirmStep
          decisions={decisions}
          decidedBuckets={decidedBuckets}
          undecidedBuckets={undecidedBuckets}
          onBack={() => setStep('review')}
          onConfirm={() => setStep('done')}
        />
      )}
      {step === 'done' && (
        <DoneStep
          tally={tally}
          handledEmails={handledEmails}
          onInbox={() => navigate && navigate('Inbox')}
        />
      )}
    </SafeAreaView>
  );
}

// ── Intro ────────────────────────────────────────────────────────────────────

function IntroStep({ goBack, onStart }) {
  const steps = [
    'We scan your inbox and group similar mail together.',
    'You review each group and pick an action: archive, snooze, keep, or review.',
    'Apply your choices in one tap — nothing is deleted.',
    'Set simple rules so your inbox stays clean automatically.',
  ];
  const trust = [
    { icon: 'shield-checkmark', label: 'Nothing deleted' },
    { icon: 'arrow-undo', label: 'Per-bucket undo' },
    { icon: 'calendar', label: 'Last 7 days safe' },
    { icon: 'sparkles', label: '99% confidence' },
  ];
  return (
    <View style={styles.flex}>
      <Header title="Bulk Triage" onBack={goBack} />
      <ScrollView
        contentContainerStyle={styles.scrollPad}
        showsVerticalScrollIndicator={false}
      >
        {/* Archiving soon bar */}
        <Pressable style={styles.archivingBar}>
          <View style={styles.archivingIcon}>
            <Ionicons name="time" size={18} color={CAT_COLORS.amber} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.archivingTitle}>
              {fmt(ARCHIVING_SOON)} emails archiving soon
            </Text>
            <Text style={styles.archivingSub}>
              99%+ confident these can go — tap to review before they archive
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.onDarkDim} />
        </Pressable>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroCount}>{fmt(TOTAL_UNREAD)}</Text>
          <Text style={styles.heroLabel}>unread emails</Text>
          <Text style={styles.heroTitle}>Clear your inbox fast</Text>
        </View>

        {/* How it works */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>How it works</Text>
          {steps.map((s, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{s}</Text>
            </View>
          ))}
        </View>

        {/* Trust grid */}
        <View style={styles.trustGrid}>
          {trust.map((t) => (
            <View key={t.label} style={styles.trustCell}>
              <Ionicons name={t.icon} size={18} color={GREEN} />
              <Text style={styles.trustText}>{t.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.primaryBtn} onPress={onStart}>
          <Ionicons name="scan" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Start scan</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Scanning ─────────────────────────────────────────────────────────────────

const RING_SIZE = 188;
const RING_STROKE = 12;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

function ScanningStep({ onCancel, onDone }) {
  const progress = useRef(new Animated.Value(0)).current;
  const scanTimeout = useRef(null);
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      setPct(Math.round(value * 100));
    });
    Animated.timing(progress, {
      toValue: 1,
      duration: 2500,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setDone(true);
        const t = setTimeout(() => onDone && onDone(), 750);
        // Stored on the closure; cleared via component unmount below if needed.
        scanTimeout.current = t;
      }
    });

    const msgTimer = setInterval(() => {
      setMsgIndex((i) => (i + 1) % SCAN_MESSAGES.length);
    }, 2500 / SCAN_MESSAGES.length);

    return () => {
      progress.removeListener(id);
      clearInterval(msgTimer);
      if (scanTimeout.current) clearTimeout(scanTimeout.current);
    };
  }, []);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_C, 0],
  });

  const ringColor = done ? GREEN : colors.blue;
  const emailsScanned = Math.round((pct / 100) * TOTAL_UNREAD);

  return (
    <View style={styles.flex}>
      <Header title="Scanning your inbox" />
      <View style={styles.scanWrap}>
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_R}
              stroke={colors.onDarkBorder}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_R}
              stroke={ringColor}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${RING_C} ${RING_C}`}
              strokeDashoffset={strokeDashoffset}
              rotation="-90"
              origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
            />
          </Svg>
          <View style={styles.ringCenter}>
            {done ? (
              <Ionicons name="checkmark-circle" size={48} color={GREEN} />
            ) : (
              <>
                <Text style={styles.ringPct}>{pct}%</Text>
                <Text style={styles.ringCount}>
                  {fmt(emailsScanned)} scanned
                </Text>
              </>
            )}
          </View>
        </View>

        <Text style={styles.scanMsg}>
          {done ? 'Found 8 groups ready to review' : SCAN_MESSAGES[msgIndex]}
        </Text>
      </View>

      {!done && (
        <View style={styles.footer}>
          <Pressable style={styles.ghostBtn} onPress={onCancel}>
            <Text style={styles.ghostBtnText}>Cancel</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Review ───────────────────────────────────────────────────────────────────

function ReviewStep({
  decisions,
  setDecision,
  clearDecision,
  decidedCount,
  handledEmails,
  onBack,
  onApply,
}) {
  const totalBuckets = BUCKETS.length;
  const totalEmails = BUCKETS.reduce((s, b) => s + b.count, 0);
  const groupPct = Math.round((decidedCount / totalBuckets) * 100);
  const emailPct = Math.round((handledEmails / totalEmails) * 100);
  const readyEmails = BUCKETS.filter(
    (b) => decisions[b.id] === 'archive' || decisions[b.id] === 'snooze',
  ).reduce((s, b) => s + b.count, 0);
  const canApply = decidedCount > 0;

  return (
    <View style={styles.flex}>
      <Header title="Review groups" onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.scrollPad, { paddingBottom: 140 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress */}
        <View style={styles.card}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>
              {decidedCount} of {totalBuckets} groups decided
            </Text>
            <Text style={styles.progressLabel}>{fmt(handledEmails)} handled</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${groupPct}%` }]} />
          </View>
          <View style={[styles.progressTrack, { marginTop: 6 }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${emailPct}%`, backgroundColor: GREEN },
              ]}
            />
          </View>
        </View>

        {/* Protected banner */}
        <View style={styles.protectBanner}>
          <Ionicons name="lock-closed" size={16} color={CAT_COLORS.amber} />
          <Text style={styles.protectText}>
            Emails from the last 7 days are protected and won't be archived,
            snoozed, or touched here.
          </Text>
        </View>

        {BUCKETS.map((b) => (
          <BucketCard
            key={b.id}
            bucket={b}
            decision={decisions[b.id]}
            onDecide={(action) => setDecision(b.id, action)}
            onUndo={() => clearDecision(b.id)}
          />
        ))}

        <Text style={styles.autosave}>Progress saves automatically.</Text>
      </ScrollView>

      {/* Floating apply bar */}
      <View style={styles.applyBar}>
        <View style={styles.flex}>
          <Text style={styles.applyCount}>{fmt(readyEmails)} emails ready</Text>
          <Text style={styles.applySub}>
            {decidedCount} of {totalBuckets} groups decided
          </Text>
        </View>
        <Pressable
          style={[styles.applyBtn, !canApply && styles.btnDisabled]}
          disabled={!canApply}
          onPress={onApply}
        >
          <Text style={styles.applyBtnText}>Review and Apply</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BucketCard({ bucket, decision, onDecide, onUndo }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const previews = useMemo(() => buildPreviews(bucket), [bucket]);
  const highConf = bucket.confidence >= 99;
  const showWarning = !!bucket.warning || bucket.confidence < 99;

  const handleAction = (key) => {
    if (key === 'more') {
      setMoreOpen((o) => !o);
      return;
    }
    onDecide(key);
  };

  return (
    <View style={styles.bucket}>
      {/* Header */}
      <View style={styles.bucketHeader}>
        <View
          style={[styles.bucketIcon, { backgroundColor: bucket.color + '22' }]}
        >
          <Ionicons name={bucket.icon} size={20} color={bucket.color} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.bucketName}>{bucket.name}</Text>
          <Text style={styles.bucketDesc}>
            {fmt(bucket.count)} {bucket.type}
          </Text>
        </View>
      </View>

      {/* Badges */}
      <View style={styles.badgeRow}>
        <View
          style={[
            styles.confBadge,
            highConf ? styles.confBadgeGreen : styles.confBadgeAmber,
          ]}
        >
          <Ionicons
            name="sparkles"
            size={11}
            color={highConf ? GREEN : CAT_COLORS.amber}
          />
          <Text
            style={[
              styles.confBadgeText,
              { color: highConf ? GREEN : CAT_COLORS.amber },
            ]}
          >
            {bucket.confidence}% confident
          </Text>
        </View>
        <View style={styles.recBadge}>
          <Text style={styles.recBadgeText}>
            AI suggests: {bucket.recommendation}
          </Text>
        </View>
      </View>

      {/* Warning */}
      {showWarning && (
        <View style={styles.warnBox}>
          <Ionicons name="warning" size={15} color={CAT_COLORS.red} />
          <Text style={styles.warnText}>
            {bucket.warning ||
              'Confidence is below 99% — please review this group before applying.'}
          </Text>
        </View>
      )}

      {/* Previews */}
      <ScrollView
        style={styles.previewBox}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        {previews.map((p, i) => (
          <View key={i} style={styles.previewRow}>
            <Text style={styles.previewSender} numberOfLines={1}>
              {p[0]}
            </Text>
            <Text style={styles.previewSubject} numberOfLines={1}>
              {p[1]}
            </Text>
            <Text style={styles.previewDate}>{p[2]}</Text>
          </View>
        ))}
      </ScrollView>
      {previews.length > 4 && (
        <Text style={styles.scrollHint}>Scroll to see more ↓</Text>
      )}
      <Pressable>
        <Text style={styles.seeAll}>See all {fmt(bucket.count)} emails</Text>
      </Pressable>

      {/* Action buttons — always all five */}
      <View style={styles.actionRow}>
        {ACTIONS.map((a) => {
          const chosen = decision === a.key;
          const dimmed = decision && !chosen && a.key !== 'more';
          return (
            <Pressable
              key={a.key}
              style={[
                styles.actionBtn,
                chosen && styles.actionBtnChosen,
                dimmed && styles.actionBtnDim,
              ]}
              onPress={() => handleAction(a.key)}
            >
              {chosen && <View style={styles.actionTopLine} />}
              <Ionicons
                name={a.icon}
                size={16}
                color={chosen ? colors.blue : colors.onDark}
              />
              <Text
                style={[styles.actionLabel, chosen && { color: colors.blue }]}
              >
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* More dropdown */}
      {moreOpen && (
        <>
          <Pressable
            style={styles.dropBackdrop}
            onPress={() => setMoreOpen(false)}
          />
          <View style={styles.dropdown}>
            {MORE_OPTIONS.map((opt) => (
              <Pressable
                key={opt}
                style={styles.dropItem}
                onPress={() => setMoreOpen(false)}
              >
                <Text style={styles.dropItemText}>{opt}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Undo strip */}
      {decision && (
        <View style={styles.undoStrip}>
          <Text style={styles.undoText}>
            {ACTION_LABEL[decision]} · {fmt(bucket.count)} emails
          </Text>
          <Pressable onPress={onUndo}>
            <Text style={styles.undoBtn}>Undo</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Confirm ──────────────────────────────────────────────────────────────────

function ConfirmStep({ decidedBuckets, undecidedBuckets, decisions, onBack, onConfirm }) {
  return (
    <View style={styles.flex}>
      <Header title="Confirm" onBack={onBack} />
      <ScrollView
        contentContainerStyle={styles.scrollPad}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.confirmHeading}>You're about to apply</Text>

        <View style={styles.card}>
          {decidedBuckets.length === 0 && (
            <Text style={styles.bucketDesc}>No groups decided yet.</Text>
          )}
          {decidedBuckets.map((b) => (
            <View key={b.id} style={styles.confirmRow}>
              <View style={[styles.dot, { backgroundColor: b.color }]} />
              <Text style={styles.confirmName} numberOfLines={1}>
                {b.name}
              </Text>
              <Text style={[styles.confirmAction, { color: b.color }]}>
                {ACTION_LABEL[decisions[b.id]]}
              </Text>
              <Text style={styles.confirmCount}>{fmt(b.count)}</Text>
            </View>
          ))}
        </View>

        {undecidedBuckets.length > 0 && (
          <View style={styles.skipNote}>
            <Ionicons name="information-circle" size={16} color={CAT_COLORS.amber} />
            <Text style={styles.skipText}>
              {undecidedBuckets.length} group
              {undecidedBuckets.length > 1 ? 's' : ''} (
              {undecidedBuckets.map((b) => b.name).join(', ')}) have no decision
              and will be skipped.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.confirmBtn} onPress={onConfirm}>
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Confirm — Apply All Actions</Text>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={onBack}>
          <Text style={styles.ghostBtnText}>Go back and adjust</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Done ─────────────────────────────────────────────────────────────────────

function DoneStep({ tally, handledEmails, onInbox }) {
  const scale = useRef(new Animated.Value(0)).current;
  const [rules, setRules] = useState({
    newsletters: true,
    promotions: true,
    notifications: false,
    receipts: true,
  });

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, []);

  const toggleRule = (key) => setRules((r) => ({ ...r, [key]: !r[key] }));

  const stats = [
    { label: 'Archived', value: tally.archive, color: CAT_COLORS.slate },
    { label: 'Snoozed', value: tally.snooze, color: CAT_COLORS.amber },
    { label: 'Kept', value: tally.keep, color: CAT_COLORS.blue },
    { label: 'To Review', value: tally.review, color: PURPLE },
  ];

  const ruleRows = [
    {
      key: 'newsletters',
      title: 'Archive newsletters after 7 days in inbox',
      sub: 'e.g. Medium Daily, Morning Brew, The Hustle',
    },
    {
      key: 'promotions',
      title: 'Archive promotions after 7 days in inbox',
      sub: 'Only if no purchase is detected from that sender',
    },
    {
      key: 'notifications',
      title: 'Archive app notifications after 7 days in inbox',
      sub: 'e.g. GitHub, Slack, Notion, LinkedIn',
    },
    {
      key: 'receipts',
      title: 'Snooze receipts for 30 days',
      sub: 'Tax-relevant ones are flagged separately',
    },
  ];

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.scrollPad}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.doneHero}>
          <Animated.View style={[styles.doneCheck, { transform: [{ scale }] }]}>
            <Ionicons name="checkmark" size={44} color="#fff" />
          </Animated.View>
          <Text style={styles.doneTitle}>Inbox cleared</Text>
          <Text style={styles.doneSub}>
            {fmt(handledEmails)} emails handled in 2.5 seconds
          </Text>
        </View>

        {/* Stat grid */}
        <View style={styles.statGrid}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statCell}>
              <Text style={[styles.statValue, { color: s.color }]}>
                {fmt(s.value)}
              </Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Rules */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Keep it clean automatically</Text>
          {ruleRows.map((r) => (
            <View key={r.key} style={styles.ruleRow}>
              <View style={styles.flex}>
                <Text style={styles.ruleTitle}>{r.title}</Text>
                <Text style={styles.ruleSub}>{r.sub}</Text>
              </View>
              <Toggle on={rules[r.key]} onPress={() => toggleRule(r.key)} />
            </View>
          ))}
        </View>

        {/* Archiving soon bar again */}
        <View style={styles.archivingBar}>
          <View style={styles.archivingIcon}>
            <Ionicons name="time" size={18} color={CAT_COLORS.amber} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.archivingTitle}>
              {fmt(ARCHIVING_SOON)} emails archiving soon
            </Text>
            <Text style={styles.archivingSub}>
              These archive in 7 days unless you keep them.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.primaryBtn} onPress={onInbox}>
          <Text style={styles.primaryBtnText}>Go to Inbox</Text>
        </Pressable>
        <Pressable style={styles.linkBtn}>
          <Text style={styles.linkText}>View activity log and undo history</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Small shared pieces ──────────────────────────────────────────────────────

function Header({ title, onBack }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable style={styles.headerBack} onPress={onBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.onDark} />
        </Pressable>
      ) : (
        <View style={styles.headerBack} />
      )}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerBack} />
    </View>
  );
}

function Toggle({ on, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggle, on ? styles.toggleOn : styles.toggleOff]}
    >
      <View style={[styles.knob, on ? styles.knobOn : styles.knobOff]} />
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,10,18,0.5)',
  },
  flex: { flex: 1 },
  scrollPad: { padding: space.lg, paddingBottom: 40 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  headerBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.onDark,
    fontSize: font.title,
    fontWeight: '700',
  },

  // Archiving bar
  archivingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.35)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.lg,
  },
  archivingIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(245,158,11,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  archivingTitle: { color: colors.onDark, fontSize: font.body, fontWeight: '700' },
  archivingSub: { color: colors.onDarkDim, fontSize: font.tiny, marginTop: 2 },

  // Hero
  hero: { alignItems: 'center', marginBottom: space.lg },
  heroCount: { color: colors.onDark, fontSize: 46, fontWeight: '800' },
  heroLabel: { color: colors.onDarkDim, fontSize: font.small, marginTop: -2 },
  heroTitle: {
    color: colors.onDark,
    fontSize: font.h2,
    fontWeight: '700',
    marginTop: space.sm,
  },

  // Cards
  card: {
    backgroundColor: colors.onDarkFill,
    borderColor: colors.onDarkBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.lg,
  },
  cardHeading: {
    color: colors.onDark,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: space.md,
  },

  // How it works steps
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: space.md },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  stepNumText: { color: colors.blue, fontWeight: '800', fontSize: font.small },
  stepText: { flex: 1, color: colors.onDark, fontSize: font.small, lineHeight: 20 },

  // Trust grid
  trustGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  trustCell: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.onDarkFill,
    borderColor: colors.onDarkBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  trustText: { color: colors.onDark, fontSize: font.small, marginLeft: space.sm },

  // Footer / buttons
  footer: {
    padding: space.lg,
    borderTopColor: colors.onDarkBorder,
    borderTopWidth: 1,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
    borderRadius: radius.pill,
    paddingVertical: 16,
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: font.body, fontWeight: '700' },
  ghostBtn: { alignItems: 'center', paddingVertical: 14, marginTop: space.sm },
  ghostBtnText: { color: colors.onDarkDim, fontSize: font.body, fontWeight: '600' },
  linkBtn: { alignItems: 'center', paddingVertical: 12 },
  linkText: {
    color: colors.blue,
    fontSize: font.small,
    textDecorationLine: 'underline',
  },
  btnDisabled: { opacity: 0.4 },

  // Scanning
  scanWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringPct: { color: colors.onDark, fontSize: 40, fontWeight: '800' },
  ringCount: { color: colors.onDarkDim, fontSize: font.small, marginTop: 2 },
  scanMsg: {
    color: colors.onDark,
    fontSize: font.body,
    fontWeight: '600',
    marginTop: space.xl,
    textAlign: 'center',
    paddingHorizontal: space.lg,
  },

  // Review progress
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.sm },
  progressLabel: { color: colors.onDarkDim, fontSize: font.small },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.onDarkBorder,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.blue },

  // Protected banner
  protectBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderColor: 'rgba(245,158,11,0.3)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.lg,
    gap: 8,
  },
  protectText: { flex: 1, color: colors.onDark, fontSize: font.tiny, lineHeight: 17 },

  // Bucket card
  bucket: {
    backgroundColor: colors.onDarkFill,
    borderColor: colors.onDarkBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.lg,
  },
  bucketHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  bucketIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  bucketName: { color: colors.onDark, fontSize: font.title, fontWeight: '700' },
  bucketDesc: { color: colors.onDarkDim, fontSize: font.small, marginTop: 2 },

  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: space.md },
  confBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  confBadgeGreen: { backgroundColor: 'rgba(52,211,153,0.15)' },
  confBadgeAmber: { backgroundColor: 'rgba(245,158,11,0.15)' },
  confBadgeText: { fontSize: font.tiny, fontWeight: '700' },
  recBadge: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recBadgeText: { color: colors.blue, fontSize: font.tiny, fontWeight: '700' },

  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.35)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    gap: 8,
  },
  warnText: { flex: 1, color: '#FCA5A5', fontSize: font.tiny, lineHeight: 17 },

  // Previews
  previewBox: {
    maxHeight: 148,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomColor: colors.onDarkBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  previewSender: { width: 70, color: colors.onDark, fontSize: font.tiny, fontWeight: '700' },
  previewSubject: { flex: 1, color: colors.onDarkDim, fontSize: font.tiny, marginHorizontal: 6 },
  previewDate: { color: colors.onDarkFaint, fontSize: 10 },
  scrollHint: { color: colors.onDarkFaint, fontSize: 10, textAlign: 'center', marginTop: 4 },
  seeAll: { color: colors.blue, fontSize: font.small, fontWeight: '600', marginTop: space.sm },

  // Actions
  actionRow: { flexDirection: 'row', marginTop: space.md, gap: 6 },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.onDarkFill,
    borderColor: colors.onDarkBorder,
    borderWidth: 1,
    overflow: 'hidden',
  },
  actionBtnChosen: { backgroundColor: 'rgba(255,255,255,0.09)', borderColor: colors.blue },
  actionBtnDim: { opacity: 0.42 },
  actionTopLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.blue,
  },
  actionLabel: { color: colors.onDark, fontSize: 11, fontWeight: '600', marginTop: 3 },

  // Dropdown
  dropBackdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    backgroundColor: 'transparent',
  },
  dropdown: {
    position: 'absolute',
    right: space.md,
    bottom: 56,
    backgroundColor: colors.bgElevated,
    borderColor: colors.onDarkBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 4,
    minWidth: 240,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  dropItem: { paddingVertical: 11, paddingHorizontal: space.md },
  dropItemText: { color: colors.onDark, fontSize: font.small },

  // Undo strip
  undoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    paddingTop: space.md,
    borderTopColor: colors.onDarkBorder,
    borderTopWidth: 1,
  },
  undoText: { color: colors.onDarkDim, fontSize: font.small },
  undoBtn: { color: colors.blue, fontSize: font.small, fontWeight: '700' },

  autosave: { color: colors.onDarkFaint, fontSize: font.tiny, textAlign: 'center', marginTop: space.sm },

  // Apply bar
  applyBar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderColor: colors.onDarkBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
  },
  applyCount: { color: colors.onDark, fontSize: font.body, fontWeight: '700' },
  applySub: { color: colors.onDarkDim, fontSize: font.tiny, marginTop: 2 },
  applyBtn: {
    backgroundColor: colors.blue,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  applyBtnText: { color: '#fff', fontSize: font.small, fontWeight: '700' },

  // Confirm
  confirmHeading: { color: colors.onDark, fontSize: font.h2, fontWeight: '700', marginBottom: space.lg },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomColor: colors.onDarkBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: space.md },
  confirmName: { flex: 1, color: colors.onDark, fontSize: font.small, fontWeight: '600' },
  confirmAction: { fontSize: font.small, fontWeight: '700', marginHorizontal: space.md },
  confirmCount: { color: colors.onDarkDim, fontSize: font.small, width: 56, textAlign: 'right' },
  skipNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderColor: 'rgba(245,158,11,0.3)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: 8,
  },
  skipText: { flex: 1, color: colors.onDark, fontSize: font.tiny, lineHeight: 17 },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GREEN,
    borderRadius: radius.pill,
    paddingVertical: 16,
    gap: 8,
  },

  // Done
  doneHero: { alignItems: 'center', marginTop: space.xl, marginBottom: space.lg },
  doneCheck: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  doneTitle: { color: colors.onDark, fontSize: font.h1, fontWeight: '800' },
  doneSub: { color: colors.onDarkDim, fontSize: font.small, marginTop: 6, textAlign: 'center' },

  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  statCell: {
    width: '48%',
    backgroundColor: colors.onDarkFill,
    borderColor: colors.onDarkBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    alignItems: 'center',
  },
  statValue: { fontSize: font.h2, fontWeight: '800' },
  statLabel: { color: colors.onDarkDim, fontSize: font.small, marginTop: 4 },

  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomColor: colors.onDarkBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ruleTitle: { color: colors.onDark, fontSize: font.small, fontWeight: '600' },
  ruleSub: { color: colors.onDarkDim, fontSize: font.tiny, marginTop: 3, lineHeight: 16 },

  // Toggle
  toggle: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center', marginLeft: space.md },
  toggleOn: { backgroundColor: colors.blue },
  toggleOff: { backgroundColor: colors.onDarkBorder },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
  knobOff: { alignSelf: 'flex-start' },
});
