// OnboardingScreen.js — the first-launch flow that teaches ScaleMail about the
// user before showing the inbox. Five steps run in sequence inside this one
// self-contained screen: Welcome → Setup Questions → Account Connection →
// Risk Review → Ready. All questionnaire answers persist under
// prefs.onboarding; prefs.hasSeenOnboarding flips true when the flow finishes
// (or the user skips). Real account connecting happens elsewhere — here we just
// simulate the sync ring then advance.
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput, SafeAreaView, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { colors, space, font, radius } from '../theme';
import { useStore } from '../store';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Static option data ─────────────────────────────────────────────────────
const ROLES = [
  { key: 'founder', label: 'Founder & CEO' },
  { key: 'sales', label: 'Sales professional' },
  { key: 'freelancer', label: 'Freelancer & consultant' },
  { key: 'marketing', label: 'Marketing & growth' },
  { key: 'developer', label: 'Developer & technical' },
  { key: 'operations', label: 'Operations & admin' },
  { key: 'personal', label: 'Personal use' },
];

// Picking a role pre-selects the interest chips most relevant to them (step 4).
const ROLE_INTERESTS = {
  founder: ['Business tools', 'Finance & investing', 'Productivity', 'Travel'],
  sales: ['CRM & sales tools', 'Business tools', 'Travel', 'Networking'],
  freelancer: ['Productivity', 'Design tools', 'Finance & investing', 'Software deals'],
  marketing: ['Marketing tools', 'Design tools', 'Analytics', 'Software deals'],
  developer: ['Software deals', 'Cloud & hosting', 'Productivity', 'Hardware & gadgets'],
  operations: ['Productivity', 'Business tools', 'Office supplies', 'Travel'],
  personal: ['Shopping & retail', 'Travel', 'Food & dining', 'Entertainment'],
};

const REACH_OPTIONS = [
  'Clients', 'My team', 'Family', 'Investors', 'Business partners',
  'Attorney', 'Accountant & CPA', 'Government agencies', 'Banks & financial',
];

const SENSITIVITY = [
  {
    key: 'relaxed',
    name: 'Relaxed',
    desc: 'ScaleMail keeps most things in your inbox and only quietly handles obvious junk.',
    result: 'Typical result: 25–40 emails in inbox per day. You stay in control, but see more noise.',
  },
  {
    key: 'balanced',
    name: 'Balanced',
    recommended: true,
    desc: 'ScaleMail auto-handles newsletters, promos and routine noise, and surfaces what matters.',
    result: 'Typical result: 5–15 emails in inbox per day. Newsletters and promos handled automatically.',
  },
  {
    key: 'aggressive',
    name: 'Aggressive',
    desc: 'ScaleMail is proactive — anything that is not clearly important gets filed away for you.',
    result: 'Typical result: 2–6 emails in inbox per day. Only people and time-sensitive items reach you.',
  },
];

// Plain-English confidence table (consequences, not technical thresholds).
const CONFIDENCE_TABLE = [
  { band: '95–100%', plain: 'ScaleMail is almost certain this email is what it appears to be and acts automatically.' },
  { band: '80–94%', plain: 'ScaleMail is fairly sure and will sort it, but keeps a record in case you disagree.' },
  { band: '50–79%', plain: 'ScaleMail has a hunch but flags it for a quick look so it can learn from your choice.' },
  { band: 'Below 50%', plain: 'ScaleMail is unsure, so it leaves the email in your inbox and asks you to decide.' },
];

const DEAL_FREQUENCY = [
  { key: 'often', label: 'Almost every day' },
  { key: 'weekly', label: 'A few times a week' },
  { key: 'rarely', label: 'Once in a while' },
  { key: 'never', label: 'Basically never' },
];

const ALL_INTERESTS = [
  'Shopping & retail', 'Travel', 'Food & dining', 'Entertainment', 'Software deals',
  'Cloud & hosting', 'Hardware & gadgets', 'Design tools', 'Marketing tools', 'Analytics',
  'CRM & sales tools', 'Business tools', 'Finance & investing', 'Productivity', 'Networking',
  'Office supplies', 'Health & fitness', 'Home & garden', 'Fashion', 'Books & courses',
];

const FEATURE_PILLS = [
  { icon: 'pricetags', label: 'AI Categorization' },
  { icon: 'flame', label: 'Urgent Detection' },
  { icon: 'flash', label: 'Zip Triage' },
  { icon: 'archive', label: 'Smart Archiving' },
  { icon: 'sunny', label: 'Daily Digest' },
];

const SYNC_MESSAGES = [
  'Connecting your mailbox',
  'Reading your recent mail',
  'Applying your preferences',
  'Cross-referencing your interests',
  'Spotting things to double-check',
  'Finishing up',
];

// Representative risky emails surfaced during setup (mock data).
const RISKY = [
  {
    id: 'r1', reason: 'Possible DM', tag: 'dm',
    sender: 'Jordan Maslen', subject: 'Quick question about your last post',
    preview: 'Hey! Loved your thread on inbox triage. I run a small team and wanted to ask how you’d approach…',
  },
  {
    id: 'r2', reason: 'Tax receipt', tag: 'tax',
    sender: 'Stripe', subject: 'Your receipt for invoice #4821',
    preview: 'Thanks for your payment. Attached is your receipt for $1,240.00 — you may need this for your…',
  },
  {
    id: 'r3', reason: 'Potential deal', tag: 'deal',
    sender: 'Acme Partnerships', subject: 'Re: Bulk pricing for ScaleMBS',
    preview: 'Following up on our call — we can offer 30% off annual plans for teams over 20 seats if we close…',
  },
  {
    id: 'r4', reason: 'Legal or security', tag: 'legal',
    sender: 'Cloudflare Security', subject: 'Action required: verify a new login',
    preview: 'We noticed a sign-in from a new device. If this was you, no action is needed. If not, secure your…',
  },
  {
    id: 'r5', reason: 'Tax receipt', tag: 'tax',
    sender: 'QuickBooks', subject: 'Your Q2 statement is ready',
    preview: 'Your quarterly statement is now available. Download it for your records before filing your…',
  },
  {
    id: 'r6', reason: 'Potential deal', tag: 'deal',
    sender: 'Sara at Vendr', subject: 'Renewal coming up — want to renegotiate?',
    preview: 'Your contract renews in 45 days. Based on usage, we think there’s room to lower your rate — happy…',
  },
];

const REASON_COLORS = {
  dm: '#A78BFA',     // purple
  tax: '#F5A623',    // amber
  deal: '#2DD4BF',   // teal
  legal: '#FF5C7A',  // red
};

const STEP_TITLES = [
  'About you',
  'Who matters most',
  'How aggressive should we be?',
  'Shopping & interests',
  'Anything else?',
];

export default function OnboardingScreen({ goBack, navigate, params }) {
  const { prefs, setPrefs } = useStore();

  // Top-level flow stage.
  const [stage, setStage] = useState('welcome'); // welcome | questions | connect | risk | ready

  // Setup-questions sub-step (0..4).
  const [step, setStep] = useState(0);

  // Questionnaire answers (persisted under prefs.onboarding on completion).
  const [role, setRole] = useState(null);
  const [reach, setReach] = useState(['Clients', 'My team']);
  const [reachText, setReachText] = useState('');
  const [sensitivity, setSensitivity] = useState('balanced');
  const [dealFreq, setDealFreq] = useState(null);
  const [brandsText, setBrandsText] = useState('');
  const [interests, setInterests] = useState(ROLE_INTERESTS.founder);
  const [notes, setNotes] = useState('');

  // Risk-review tracking.
  const [kept, setKept] = useState([]);
  const [archived, setArchived] = useState([]);

  const finish = (extra = {}) => {
    setPrefs({
      onboarding: {
        role,
        reach,
        reachText: reachText.trim(),
        sensitivity,
        dealFrequency: dealFreq,
        brands: brandsText.trim(),
        interests,
        notes: notes.trim(),
        completedAt: Date.now(),
        ...extra,
      },
    });
    setPrefs({ hasSeenOnboarding: true });
    navigate('Inbox');
  };

  // Choosing a role pre-seeds interests for step 4 (only if untouched-by-role).
  const pickRole = (key) => {
    setRole(key);
    setInterests(ROLE_INTERESTS[key] || []);
  };

  const toggleIn = (list, setList, value) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.scrim} pointerEvents="none" />
      {stage === 'welcome' && (
        <WelcomeStage
          onStart={() => { setStage('questions'); setStep(0); }}
          onSkip={() => setStage('connect')}
        />
      )}
      {stage === 'questions' && (
        <QuestionsStage
          step={step}
          setStep={setStep}
          onBack={() => { if (step === 0) setStage('welcome'); else setStep(step - 1); }}
          onSkip={() => setStage('connect')}
          onDone={() => setStage('connect')}
          role={role} pickRole={pickRole}
          reach={reach} setReach={setReach}
          reachText={reachText} setReachText={setReachText}
          sensitivity={sensitivity} setSensitivity={setSensitivity}
          dealFreq={dealFreq} setDealFreq={setDealFreq}
          brandsText={brandsText} setBrandsText={setBrandsText}
          interests={interests} setInterests={setInterests}
          notes={notes} setNotes={setNotes}
          toggleIn={toggleIn}
        />
      )}
      {stage === 'connect' && (
        <ConnectStage onDone={() => setStage('risk')} />
      )}
      {stage === 'risk' && (
        <RiskStage
          kept={kept} setKept={setKept}
          archived={archived} setArchived={setArchived}
          onDone={() => setStage('ready')}
        />
      )}
      {stage === 'ready' && (
        <ReadyStage
          sensitivity={sensitivity}
          interests={interests}
          onGo={() => finish({ kept, archived })}
        />
      )}
    </SafeAreaView>
  );
}

// ── Welcome ────────────────────────────────────────────────────────────────
function WelcomeStage({ onStart, onSkip }) {
  return (
    <ScrollView contentContainerStyle={styles.welcomeBody} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={['#3A82F6', '#0055CC']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.logoMark}
      >
        <Ionicons name="mail" size={40} color="#fff" />
      </LinearGradient>

      <Text style={styles.wordmark}>
        <Text style={styles.wordWhite}>Scale</Text>
        <Text style={styles.wordBlue}>Mail</Text>
      </Text>
      <Text style={styles.tagline}>AI-Powered Inbox</Text>
      <Text style={styles.welcomeDesc}>
        ScaleMail reads, sorts and triages your email for you — surfacing what
        needs you, quietly handling the rest, and learning your habits as it goes.
      </Text>

      <View style={styles.pillWrap}>
        {FEATURE_PILLS.map((p) => (
          <View key={p.label} style={styles.featPill}>
            <Ionicons name={p.icon} size={14} color={colors.blue} />
            <Text style={styles.featPillText}>{p.label}</Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.primaryBtn} onPress={onStart}>
        <Text style={styles.primaryBtnText}>Set up my inbox</Text>
      </Pressable>
      <Pressable hitSlop={10} onPress={onSkip} style={styles.textLinkWrap}>
        <Text style={styles.textLink}>I'll set this up later</Text>
      </Pressable>
    </ScrollView>
  );
}

// ── Setup questions (5 steps) ──────────────────────────────────────────────
function QuestionsStage(props) {
  const {
    step, setStep, onBack, onSkip, onDone,
    role, pickRole, reach, setReach, reachText, setReachText,
    sensitivity, setSensitivity, dealFreq, setDealFreq,
    brandsText, setBrandsText, interests, setInterests, notes, setNotes, toggleIn,
  } = props;

  const last = step === 4;
  const next = () => (last ? onDone() : setStep(step + 1));

  return (
    <View style={{ flex: 1 }}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <Pressable hitSlop={10} onPress={onBack} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>{STEP_TITLES[step]}</Text>
        <Pressable hitSlop={10} onPress={onSkip} style={styles.navBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      {/* Dot-pill progress */}
      <View style={styles.progressRow}>
        {STEP_TITLES.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.qBody}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <>
            <Text style={styles.qHeading}>What best describes you?</Text>
            <Text style={styles.qSub}>This helps ScaleMail guess what matters and what's just noise.</Text>
            <View style={styles.chipGrid}>
              {ROLES.map((r) => {
                const a = role === r.key;
                return (
                  <Pressable key={r.key} onPress={() => pickRole(r.key)} style={[styles.chip, a && styles.chipActive]}>
                    <Text style={[styles.chipText, a && styles.chipTextActive]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.qHeading}>Who should always reach you?</Text>
            <Text style={styles.qSub}>Mail from these people skips the filters and lands straight in your inbox.</Text>
            <View style={styles.chipGrid}>
              {REACH_OPTIONS.map((opt) => {
                const a = reach.includes(opt);
                return (
                  <Pressable key={opt} onPress={() => toggleIn(reach, setReach, opt)} style={[styles.chip, a && styles.chipActive]}>
                    {a && <Ionicons name="checkmark" size={13} color={colors.blue} style={{ marginRight: 5 }} />}
                    <Text style={[styles.chipText, a && styles.chipTextActive]}>{opt}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>Specific emails or domains</Text>
            <TextInput
              style={styles.input}
              value={reachText}
              onChangeText={setReachText}
              placeholder="jane@client.com, @ourlawfirm.com"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.note}>
              ScaleMail also learns from who you reply to over time — so this list keeps getting smarter on its own.
            </Text>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.qHeading}>How aggressive should ScaleMail be?</Text>
            <Text style={styles.qSub}>You can change this any time in Settings.</Text>
            {SENSITIVITY.map((s) => {
              const a = sensitivity === s.key;
              return (
                <Pressable key={s.key} onPress={() => setSensitivity(s.key)} style={[styles.sensCard, a && styles.sensCardActive]}>
                  <View style={styles.sensHead}>
                    <Text style={styles.sensName}>{s.name}</Text>
                    {s.recommended && (
                      <View style={styles.recBadge}><Text style={styles.recBadgeText}>Recommended</Text></View>
                    )}
                    <View style={{ flex: 1 }} />
                    <View style={[styles.checkRing, a && styles.checkRingOn]}>
                      {a && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </View>
                  <Text style={styles.sensDesc}>{s.desc}</Text>
                  <Text style={styles.sensResult}>{s.result}</Text>
                </Pressable>
              );
            })}

            <Text style={styles.fieldLabel}>What the confidence levels mean</Text>
            <View style={styles.confTable}>
              {CONFIDENCE_TABLE.map((row, i) => (
                <View key={row.band} style={[styles.confRow, i < CONFIDENCE_TABLE.length - 1 && styles.confRowBorder]}>
                  <Text style={styles.confBand}>{row.band}</Text>
                  <Text style={styles.confPlain}>{row.plain}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.qHeading}>Shopping & interests</Text>
            <Text style={styles.qSub}>So ScaleMail knows which deals are worth surfacing — and which to bin.</Text>

            <Text style={styles.fieldLabel}>How often do you find useful deals in email?</Text>
            <View style={styles.chipGrid}>
              {DEAL_FREQUENCY.map((d) => {
                const a = dealFreq === d.key;
                return (
                  <Pressable key={d.key} onPress={() => setDealFreq(d.key)} style={[styles.chip, a && styles.chipActive]}>
                    <Text style={[styles.chipText, a && styles.chipTextActive]}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Brands you actually buy from</Text>
            <TextInput
              style={styles.input}
              value={brandsText}
              onChangeText={setBrandsText}
              placeholder="Apple, Nike, Notion…"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <Text style={styles.fieldLabel}>Topics you care about</Text>
            <View style={styles.chipGrid}>
              {ALL_INTERESTS.map((t) => {
                const a = interests.includes(t);
                return (
                  <Pressable key={t} onPress={() => toggleIn(interests, setInterests, t)} style={[styles.chip, a && styles.chipActive]}>
                    {a && <Ionicons name="checkmark" size={13} color={colors.blue} style={{ marginRight: 5 }} />}
                    <Text style={[styles.chipText, a && styles.chipTextActive]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.qHeading}>Anything else ScaleMail should know?</Text>
            <Text style={styles.qSub}>
              This goes to your private AI profile and is never shared. Mention projects,
              people, deadlines or quirks — anything that helps ScaleMail get you right.
            </Text>
            <TextInput
              style={styles.textArea}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. I run a brokerage — anything about ScaleMBS deals is urgent. Ignore recruiter spam."
              placeholderTextColor={colors.textFaint}
              multiline
              textAlignVertical="top"
            />
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.primaryBtn} onPress={next}>
          <Text style={styles.primaryBtnText}>{last ? 'Continue' : 'Next'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Account connection (simulated sync ring) ───────────────────────────────
function ConnectStage({ onDone }) {
  const RING = 110;
  const STROKE = 10;
  const R = (RING - STROKE) / 2;
  const C = 2 * Math.PI * R;

  const progress = useRef(new Animated.Value(0)).current;
  const [pct, setPct] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const id = progress.addListener(({ value }) => setPct(Math.round(value * 100)));
    Animated.timing(progress, {
      toValue: 1,
      duration: 4200,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => { if (finished) setTimeout(onDone, 450); });

    const msgTimer = setInterval(() => {
      setMsgIdx((i) => Math.min(i + 1, SYNC_MESSAGES.length - 1));
    }, 700);

    return () => { progress.removeListener(id); clearInterval(msgTimer); progress.stopAnimation(); };
  }, []);

  const dashoffset = progress.interpolate({ inputRange: [0, 1], outputRange: [C, 0] });

  return (
    <View style={styles.centerStage}>
      <View style={styles.ringWrap}>
        <Svg width={RING} height={RING}>
          <Circle
            cx={RING / 2} cy={RING / 2} r={R}
            stroke="rgba(255,255,255,0.1)" strokeWidth={STROKE} fill="none"
          />
          <AnimatedCircle
            cx={RING / 2} cy={RING / 2} r={R}
            stroke={colors.blue} strokeWidth={STROKE} fill="none"
            strokeLinecap="round"
            strokeDasharray={`${C}, ${C}`}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={styles.ringPct}>{pct}%</Text>
        </View>
      </View>
      <Text style={styles.connectTitle}>Setting up your inbox</Text>
      <Text style={styles.connectMsg}>{SYNC_MESSAGES[msgIdx]}…</Text>
    </View>
  );
}

// ── Risk review ────────────────────────────────────────────────────────────
function RiskStage({ kept, setKept, archived, setArchived, onDone }) {
  const [reviewed, setReviewed] = useState([]); // ids already actioned
  const remaining = RISKY.filter((e) => !reviewed.includes(e.id));
  const unsureCount = remaining.length;

  const act = (item, kind) => {
    setReviewed((r) => [...r, item.id]);
    if (kind === 'keep') setKept((k) => [...k, item.id]);
    else if (kind === 'archive') setArchived((a) => [...a, item.id]);
    // 'skip' just removes it from the queue without counting either way
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.navBar}>
        <View style={styles.navBtn} />
        <Text style={styles.navTitle}>Review</Text>
        <Pressable hitSlop={10} onPress={onDone} style={styles.navBtn}>
          <Text style={styles.skipText}>Skip remaining</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.riskBody} showsVerticalScrollIndicator={false}>
        <View style={styles.warnBanner}>
          <Ionicons name="alert-circle" size={18} color="#F5A623" />
          <Text style={styles.warnText}>
            {unsureCount} {unsureCount === 1 ? 'email' : 'emails'} ScaleMail wasn't 100% sure about.
          </Text>
        </View>

        <Text style={styles.riskTitle}>Before you go to your inbox</Text>
        <Text style={styles.riskSub}>
          ScaleMail found these while setting up and needs a quick gut-check. Your
          choices teach it — it'll handle similar mail automatically next time.
        </Text>

        <View style={styles.counterRow}>
          <Counter label="Reviewed" value={reviewed.length} />
          <Counter label="Kept" value={kept.length} color={colors.fyi} />
          <Counter label="Archived" value={archived.length} color={colors.textDim} />
        </View>

        {remaining.length === 0 ? (
          <View style={styles.allClear}>
            <Ionicons name="checkmark-circle" size={40} color={colors.fyi} />
            <Text style={styles.allClearText}>All reviewed. Nice work.</Text>
          </View>
        ) : (
          remaining.map((item) => (
            <View key={item.id} style={styles.riskCard}>
              <View style={[styles.reasonTag, { backgroundColor: `${REASON_COLORS[item.tag]}22` }]}>
                <Text style={[styles.reasonTagText, { color: REASON_COLORS[item.tag] }]}>{item.reason}</Text>
              </View>
              <Text style={styles.riskSender}>{item.sender}</Text>
              <Text style={styles.riskSubject} numberOfLines={1}>{item.subject}</Text>
              <Text style={styles.riskPreview} numberOfLines={2}>{item.preview}</Text>
              <View style={styles.riskActions}>
                <Pressable style={styles.actBtn} onPress={() => act(item, 'keep')}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.fyi} />
                  <Text style={[styles.actText, { color: colors.fyi }]}>Keep</Text>
                </Pressable>
                <Pressable style={styles.actBtn} onPress={() => act(item, 'archive')}>
                  <Ionicons name="archive" size={17} color={colors.textDim} />
                  <Text style={[styles.actText, { color: colors.textDim }]}>Archive</Text>
                </Pressable>
                <Pressable style={styles.actBtn} onPress={() => act(item, 'skip')}>
                  <Ionicons name="time" size={17} color={colors.textFaint} />
                  <Text style={[styles.actText, { color: colors.textFaint }]}>Skip</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.primaryBtn} onPress={onDone}>
          <Text style={styles.primaryBtnText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Counter({ label, value, color }) {
  return (
    <View style={styles.counter}>
      <Text style={[styles.counterValue, color && { color }]}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

// ── Ready ──────────────────────────────────────────────────────────────────
function ReadyStage({ sensitivity, interests, onGo }) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
  }, []);

  const level = SENSITIVITY.find((s) => s.key === sensitivity)?.name || 'Balanced';

  return (
    <View style={styles.centerStage}>
      <Animated.View style={[styles.readyCheck, { transform: [{ scale }] }]}>
        <Ionicons name="checkmark" size={48} color="#fff" />
      </Animated.View>
      <Text style={styles.readyTitle}>You're all set</Text>
      <Text style={styles.readySub}>
        Your inbox is sorted, your preferences are saved, and ScaleMail is ready to keep it that way.
      </Text>

      <View style={styles.statGrid}>
        <Stat value="1,284" label="Emails synced" />
        <Stat value="7" label="Categories trained" />
        <Stat value={level} label="Confidence set" />
      </View>

      <View style={styles.footerInline}>
        <Pressable style={styles.primaryBtn} onPress={onGo}>
          <Text style={styles.primaryBtnText}>Go to Inbox</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Stat({ value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const card = 'rgba(255,255,255,0.06)';
const cardActive = 'rgba(0,113,227,0.18)';
const border = 'rgba(255,255,255,0.1)';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,18,0.5)' },

  // Welcome
  welcomeBody: { flexGrow: 1, alignItems: 'center', paddingHorizontal: space.xl, paddingTop: 48, paddingBottom: 40 },
  logoMark: { width: 84, height: 84, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  wordmark: { fontSize: 38, fontWeight: '800' },
  wordWhite: { color: '#fff' },
  wordBlue: { color: colors.blue },
  tagline: { color: colors.blue, fontSize: font.title, fontWeight: '700', marginTop: 4 },
  welcomeDesc: { color: colors.textDim, fontSize: font.body, lineHeight: 23, textAlign: 'center', marginTop: 18 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9, marginTop: 28, marginBottom: 32 },
  featPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: card, borderWidth: 1, borderColor: border,
    borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 13,
  },
  featPillText: { color: colors.text, fontSize: 13, fontWeight: '600' },

  // Buttons / links
  primaryBtn: { backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', width: '100%' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  textLinkWrap: { marginTop: 18, paddingVertical: 6 },
  textLink: { color: colors.textDim, fontSize: font.body, fontWeight: '600' },

  // Nav + progress
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingTop: space.sm, height: 52 },
  navBtn: { minWidth: 64, justifyContent: 'center' },
  navTitle: { flex: 1, color: colors.text, fontSize: font.title, fontWeight: '700', textAlign: 'center' },
  skipText: { color: colors.textDim, fontSize: font.body, fontWeight: '600', textAlign: 'right' },
  progressRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)' },
  dotActive: { width: 22, backgroundColor: colors.blue },

  // Questions body
  qBody: { paddingHorizontal: space.lg, paddingTop: 8 },
  qHeading: { color: colors.text, fontSize: font.h2, fontWeight: '800' },
  qSub: { color: colors.textDim, fontSize: font.body, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: card, borderWidth: 1, borderColor: border,
    borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 15,
  },
  chipActive: { backgroundColor: cardActive, borderColor: colors.blue },
  chipText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  fieldLabel: { color: colors.text, fontSize: font.small, fontWeight: '700', marginTop: 22, marginBottom: 10, letterSpacing: 0.2 },
  input: {
    backgroundColor: card, borderWidth: 1, borderColor: border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: colors.text,
  },
  textArea: {
    backgroundColor: card, borderWidth: 1, borderColor: border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: colors.text,
    minHeight: 150,
  },
  note: { color: colors.textFaint, fontSize: 13, lineHeight: 19, marginTop: 12 },

  // Sensitivity cards
  sensCard: {
    backgroundColor: card, borderWidth: 1, borderColor: border, borderRadius: radius.md,
    padding: 16, marginBottom: 12,
  },
  sensCardActive: { backgroundColor: cardActive, borderColor: colors.blue },
  sensHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  sensName: { color: colors.text, fontSize: font.title, fontWeight: '800' },
  recBadge: { backgroundColor: 'rgba(0,113,227,0.22)', borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },
  recBadgeText: { color: colors.blue, fontSize: 11, fontWeight: '800' },
  checkRing: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: border, alignItems: 'center', justifyContent: 'center' },
  checkRingOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  sensDesc: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  sensResult: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 10, fontWeight: '600' },

  // Confidence table
  confTable: { backgroundColor: card, borderWidth: 1, borderColor: border, borderRadius: radius.md, overflow: 'hidden' },
  confRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14, gap: 12, alignItems: 'flex-start' },
  confRowBorder: { borderBottomWidth: 1, borderBottomColor: border },
  confBand: { color: colors.blue, fontSize: 13, fontWeight: '800', width: 74 },
  confPlain: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 19 },

  // Connect ring
  centerStage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  ringWrap: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ringPct: { color: colors.text, fontSize: 24, fontWeight: '800' },
  connectTitle: { color: colors.text, fontSize: font.h2, fontWeight: '800', marginTop: 32 },
  connectMsg: { color: colors.textDim, fontSize: font.body, marginTop: 8 },

  // Risk review
  riskBody: { paddingHorizontal: space.lg, paddingTop: 6 },
  warnBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: 'rgba(245,166,35,0.14)', borderWidth: 1, borderColor: 'rgba(245,166,35,0.3)',
    borderRadius: radius.md, padding: 13,
  },
  warnText: { flex: 1, color: '#F5C97A', fontSize: 14, fontWeight: '600' },
  riskTitle: { color: colors.text, fontSize: font.h2, fontWeight: '800', marginTop: 18 },
  riskSub: { color: colors.textDim, fontSize: font.body, lineHeight: 21, marginTop: 8 },
  counterRow: { flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 16 },
  counter: { flex: 1, backgroundColor: card, borderWidth: 1, borderColor: border, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  counterValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  counterLabel: { color: colors.textFaint, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  riskCard: { backgroundColor: card, borderWidth: 1, borderColor: border, borderRadius: radius.md, padding: 15, marginBottom: 12 },
  reasonTag: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10, marginBottom: 10 },
  reasonTagText: { fontSize: 11.5, fontWeight: '800' },
  riskSender: { color: colors.text, fontSize: 15, fontWeight: '700' },
  riskSubject: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 3 },
  riskPreview: { color: colors.textDim, fontSize: 13.5, lineHeight: 19, marginTop: 6 },
  riskActions: { flexDirection: 'row', gap: 8, marginTop: 14, borderTopWidth: 1, borderTopColor: border, paddingTop: 12 },
  actBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  actText: { fontSize: 13.5, fontWeight: '700' },
  allClear: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  allClearText: { color: colors.text, fontSize: font.title, fontWeight: '700' },

  // Ready
  readyCheck: { width: 92, height: 92, borderRadius: 46, backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center', marginBottom: 26 },
  readyTitle: { color: colors.text, fontSize: font.h1, fontWeight: '800' },
  readySub: { color: colors.textDim, fontSize: font.body, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  statGrid: { flexDirection: 'row', gap: 10, marginTop: 30, width: '100%' },
  stat: { flex: 1, backgroundColor: card, borderWidth: 1, borderColor: border, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  statLabel: { color: colors.textFaint, fontSize: 11.5, fontWeight: '600', marginTop: 4, textAlign: 'center' },

  // Footers
  footer: { paddingHorizontal: space.lg, paddingTop: 10, paddingBottom: 18 },
  footerInline: { width: '100%', marginTop: 36 },
});
