# PlatePath — Legality & Compliance

> **Not legal advice.** This is an engineering/business analysis of publicly
> available law as of mid-2026, produced to steer product design. Statutes and
> enforcement posture change; get a formal opinion from privacy/regulatory
> counsel before building or launching. Citations are provided so counsel can
> verify. Several exact statute section numbers and per-state retention figures
> are flagged as medium/low confidence and must be re-checked against primary
> sources.

## Bottom line

The idea **as originally described** — *scan public traffic cameras to find any
registered plate and trace its path* — **cannot be built or sold in the USA.** It
fails on four independent grounds, any one of which is disqualifying:

1. **The data doesn't exist the way the idea assumes** (traffic cams can't read
   plates; no national feed) — see [ARCHITECTURE.md](./ARCHITECTURE.md) and §5.
2. **The federal DPPA** makes a plate → registered-owner lookup for
   parents/dealers/fleets/consumers unlawful (§1).
3. **State ALPR + electronic-tracking statutes** ban or criminalize it in a large
   share of the country, and the "register the plate" gate supplies none of the
   consent those statutes require (§2).
4. **It is functionally stalkerware** — Apple and Google will reject it, and it
   carries FTC and criminal/civil stalking exposure (§3).

**PlatePath is the version that is legal:** consent-based telematics on vehicles
whose ownership/authority the user has **verified**, architected so the consent
requirement maps directly onto the statutory exceptions (§6). Same four
customers; a product that ships.

---

## 1. Federal law

### 1.1 Driver's Privacy Protection Act (DPPA) — the decisive blocker for plate→owner

- **18 U.S.C. §§ 2721–2725.** §2721(a) bars DMVs and downstream recipients from
  disclosing personal information from a motor-vehicle record except for the
  **14 enumerated permissible uses** in §2721(b) (government function, motor-safety/
  theft/recall, insurance, litigation, toll operations, licensed PIs acting for a
  permitted purpose, etc.). **None covers a parent, dealer, or fleet who wants to
  locate an arbitrary registered plate's owner.**
- **Private right of action:** **§2724** lets any person sue anyone who
  "knowingly obtains, discloses or uses" record data for a non-permitted purpose,
  with **liquidated damages of at least $2,500 per violation**, punitive damages,
  and attorneys' fees. §2723 adds criminal fines.
- *Maracich v. Spears*, 570 U.S. 48 (2013) construes the exceptions **narrowly**.
- The DPPA exists **because of exactly this harm**: it was passed after the 1989
  murder of actress Rebecca Schaeffer, whom a PI located via her California DMV
  record — the "plate → find the person" use case.

**Consequence:** you cannot lawfully build a nationwide plate→owner directory for
the marketed audiences. Owner-resolution is confined to genuine §2721(b)
permissible-use customers (insurers, PIs for permitted purposes, litigants) with
audited purpose certification — which **excludes** parents and general consumers.

### 1.2 Fourth Amendment — binds government, but taints police sales

- *United States v. Jones*, 565 U.S. 400 (2012): attaching a GPS tracker and
  monitoring a car for 28 days is a **search**. *Carpenter v. United States*, 138
  S. Ct. 2206 (2018): the government needs a **warrant** for 7+ days of historical
  location; the third-party doctrine does not defeat the privacy interest because
  time-stamped location is "an intimate window into a person's life."
- These bind **the government, not a private company** — but selling movement
  traces to police can make you a **state actor**, injecting suppression motions
  and **§1983** civil-rights exposure. In *Schmidt v. City of Norfolk* (E.D. Va.,
  Feb 2026) a court let a Fourth-Amendment challenge to warrantless Flock ALPR
  querying proceed, calling it "notably similar" to *Carpenter*.

### 1.3 Computer Fraud and Abuse Act (CFAA)

- **18 U.S.C. § 1030.** *Van Buren v. United States*, 141 S. Ct. 1648 (2021)
  narrowed "exceeds authorized access" to a gates-up-or-down rule, but accessing
  **police, private, or ToS-restricted** camera systems without permission is
  still access "without authorization" — criminal. Genuinely public DOT/511 feeds
  are generally fine to view; you may not tap closed systems.

### 1.4 FTC Act § 5 — active enforcement against exactly this data pattern

- **15 U.S.C. § 45** bars "unfair or deceptive acts or practices." Since 2024 the
  FTC has built a **location-data enforcement line**: X-Mode/Outlogic and InMarket
  (Jan 2024), Gravy Analytics/Venntel and Mobilewalla (Dec 2024), and the
  **Kochava settlement (May 4, 2026)**. A product whose entire output is a
  person's movement history sits squarely in this lane. Selling B2B "to police or
  dealers" does not immunize it where the tracked person never consented.

### 1.5 Stalking & the "neutral tool" problem

- Federal cyberstalking, **18 U.S.C. § 2261A(2)**, criminalizes using an
  electronic service to place a person under surveillance **with intent to kill,
  injure, harass, or intimidate** and a course of conduct causing fear/substantial
  emotional distress. *(Note: surveillance alone is not the crime — intent + a
  course of conduct is required; a general-purpose tracking tool still creates
  facilitation/aiding-and-abetting exposure and direct user liability.)*
- The **FTC has banned stalkerware operators from the business entirely**: Support
  King/SpyFone and its CEO (2021), a ban the FTC **voted 2-0 to reaffirm on Dec 8,
  2025**. Company- and executive-level bans, not just app removal.

---

## 2. State law — a hostile 50-state patchwork, trending stricter

There is **no federal ALPR law**, so this is 50 regimes. The direction is
uniformly toward **more** restriction (driven largely by backlash over ICE/CBP
access to Flock networks in 2025–26). Two overlapping regimes bite:

### 2.1 States that ban / reserve private ALPR (illegal on its face)

| State | Statute (verify) | Effect |
|---|---|---|
| **New Hampshire** | RSA 261:75-b | Strictest in the US — non-hit data purged in **~3 minutes**; a path-history product is structurally impossible. |
| **Maine** | 29-A M.R.S. §2117-A | ALPR reserved to public-safety; 21-day retention. |
| **Arkansas** | Ark. Code §12-12-1803 | Bars use by private individuals/corporations (narrow exceptions). |
| **Vermont** | 23 V.S.A. §1607 | Deployment limited to law enforcement; 18-month retention. |

Commercial ALPR vendors already list **AR, ME, NH** as states where private ALPR
service is unavailable.

### 2.2 States with retention caps (incompatible with long-lookback tracing)

California SB 34 (Civ. Code §1798.90.5 et seq., with a **private right of action**
reaching commercial "ALPR operators"), Maryland (~1 yr), Virginia (**21 days**,
HB 2724, 2025), Oregon (**30 days**, 2025), Washington (SB 6002 — 21-day
retention, warrant requirement, ban on buy/sell), Minnesota (60 days), Montana
(90 days), and more. *(Exact figures are medium-confidence — re-verify.)*

### 2.3 Electronic-tracking-of-a-person criminal statutes

These are the ones that matter most for a legitimate design, because **they define
the consent that makes tracking lawful**:

- **California Penal Code § 637.7** — misdemeanor to use an electronic tracking
  device to determine a person's location **without consent**; the exception is
  the **registered owner/lessee's** consent. *(Verification note: §637.7 is a
  device-**attachment** statute — it fits an installed GPS tracker precisely, and
  its owner-consent exception is exactly PlatePath's model. It likely does **not**
  reach camera-network tracking, which is why the camera idea evades the safe
  harbor and lands in stalking law instead.)*
- **Texas Penal Code § 16.06**, **Virginia § 18.2-60.5**, **Michigan MCL
  § 750.539l**, **Florida § 934.425** (a "tracking application" felony that
  **squarely reaches software-based tracking**). The consenting party in all of
  these is **the person being tracked / the vehicle owner** — *not* the app's
  customer. **Registering a plate supplies none of this consent.**

---

## 3. Why "register the plate" does not stop stalkers, and why the stores ban it

- **Registration ≠ ownership ≠ the driver's consent.** Anyone can type any plate.
  The dangerous cases are precisely the ones the gate lets through: an abuser who
  co-owned the car, a parent surveilling an **adult** child, an ex who knows the
  plate. This is the **Rebecca Schaeffer harm** the DPPA was written to prevent.
- **You can't even verify ownership legitimately** for a consumer, because the
  DPPA blocks the plate→owner lookup that would confirm it (§1.1).
- **Google Play** stalkerware policy (2020, still live) bans code that tracks a
  person without a **persistent on-device notification**, and states a tracker
  "cannot be used to track anyone else (a spouse, for example) **even with their
  knowledge and permission**." Only **parental (minor children)** and
  **enterprise/employee** monitoring are permitted.
- **Apple** rejects under 5.1.2 (surreptitious profiling), 1.1.6 (fake/location
  trickery — "stating that the app is for entertainment purposes won't overcome
  this"), 1.2 (harassment), and the 5.6 Developer Code of Conduct.
- **Verification nuance (important):** the *stalkerware* policies specifically
  target code that runs **on the tracked person's device**. A camera-network app
  puts no code on the target's phone, so it doesn't fit that clause cleanly — but
  it would still be **rejected under the broader harassment / personal-safety /
  deceptive-behavior provisions**, and "we never touch their device" is not a cure.
  The architecture that *does* pass review is the one where the tracked person's
  device (or a device on a vehicle they've consented to) is enrolled with notice.

---

## 4. Selling to police is not a shortcut

It can make you a **state actor** (§1.2), inheriting *Carpenter*/§1983 exposure —
the exact litigation now hitting Flock. A government channel needs its own
warrant/legal-process framework, per-query audit logging, and retention limits as
**table stakes**, sold off the consumer app stores (enterprise/MDM distribution),
never as a public download.

---

## 5. The traffic-camera premise, precisely

- **DOT/511 traffic-flow cameras cannot read plates** — low resolution by design,
  wide PTZ field of view, snapshots every few seconds to minutes (not video),
  usually **not archived**, and there is **no unified national public API**. You
  cannot reconstruct a path or compute segment speed from them.
- **Nuance (from verification):** *some government cameras do read plates* —
  all-electronic tolling / pay-by-plate (E-ZPass etc.), red-light/speed cameras,
  and **point-to-point "average speed" enforcement cameras that literally compute
  segment speed from two timestamped plate reads.** So plate-reading + segment
  speed on government cameras is **not physically impossible** — but those systems
  are **closed to a consumer app** and restricted to enforcement/tolling use. The
  premise fails for **access & data-architecture** reasons, not physics.
- Real plate-based tracking lives in **closed ALPR networks** — Flock Safety
  (**120,000+ cameras, 49 states, ~6,000 agencies, ~$300M ARR, ~$7.5–8.4B
  valuation**), Motorola/Vigilant + DRN, Rekor — none public, all access-gated by
  **institutional identity and legal purpose**, not by "who registered a plate."
  DRN's commercial data is licensed only for **DPPA permissible uses** (repo,
  lending, insurance), never to consumers.

---

## 6. How PlatePath is compliant by design

The product keeps the goal (route + time codes + per-segment speed) and removes
every blocker by changing the **data source** and the **consent model**.

| Blocker | PlatePath's design response |
|---|---|
| DPPA plate→owner lookup | **We never do a plate→owner lookup.** Data comes from a device the owner installed or a phone enrolled with consent — first-party data the customer already has rights to. |
| Traffic-cam feasibility | **No traffic cams.** Consented **GPS/OBD/telematics** gives full-coverage route + accurate per-segment speed (haversine ÷ time) with no plate-reading. |
| State electronic-tracking statutes (CA §637.7 etc.) | Their exception is the **owner/lessee's consent** — which is exactly our gate: verified ownership **plus** recorded driver disclosure. |
| ALPR bans (NH/ME/AR/VT) & retention caps | We're not an ALPR operator. Retention is **configurable per jurisdiction**; the product still works under short-retention regimes because tracking is first-party. |
| App-store stalkerware bans | We fit the **permitted lanes**: parental (verified minor's family vehicle), enterprise/fleet (company-owned vehicle + driver notice), and an **agency tier sold off-store** under legal process. Persistent disclosure to drivers is built in. |
| FTC §5 | Affirmative consent, driver disclosure ledger, sensitive-data minimization, data-retention controls, and no data-broker sale. |
| Stalking liability | **Two independent gates** (see `consent.ts`): proof of control (device pairing / reviewed registration / lienholder record / fleet assignment / lawful process — *typing a plate never verifies*) **and** driver disclosure. One-owner-per-plate; a second claimant hits dispute review. There is **no code path** that returns a location for an unverified vehicle. |
| Fourth Amendment / police | Agency tier is warrant/lawful-process-gated, seat-and-case based, fully audited — never open plate query. |

### Per-segment legality summary

| Segment | Verdict | Condition |
|---|---|---|
| **Dealer / BHPH / lender** | ✅ Strongest | Borrower **signs a GPS/tracking agreement at financing** — statutory consent is built into the transaction. Lienholder verification. |
| **Fleet** | ✅ Yes | Company-owned/leased vehicles + **written driver disclosure**; positioned as telematics/management, not surveillance. |
| **Family** | ✅ Narrow | The family's **own** vehicle; verified minor, or an adult driver with recorded consent. Not "track any plate." |
| **Law enforcement** | ⚠️ Gated | Off-store, lawful-process only, audited, retention-limited. Not a per-random-plate lookup. |
| **"Find any plate you type in"** | ❌ Never | Illegal (DPPA + state) and stalkerware. Not built. |

### Compliance checklist (build gates)

- [ ] Ownership/authority verification **beyond plate entry** (implemented: `consent.ts`).
- [ ] Driver disclosure/consent ledger for non-owner drivers (implemented).
- [ ] One-owner-per-plate + dispute review (implemented).
- [ ] Immutable per-read **audit log** (implemented in the reference API).
- [ ] Per-jurisdiction **retention** configuration.
- [ ] State feature-gating (block/limit where required; e.g. NH/ME/AR/VT posture).
- [ ] No plate→owner directory; owner-resolution only for DPPA permissible-use customers.
- [ ] Agency tier off consumer app stores, warrant/legal-process workflow.
- [ ] Outside privacy counsel review before launch; cyber/E&O insurance.

## Sources (verify current text)

- DPPA: 18 U.S.C. §§2721–2725 (uscode.house.gov); EPIC DPPA page; *Maracich v. Spears*, 570 U.S. 48.
- *Jones*, 565 U.S. 400; *Carpenter*, 138 S. Ct. 2206; *Van Buren*, 141 S. Ct. 1648.
- FTC actions: X-Mode/Outlogic, InMarket, Gravy/Venntel, Mobilewalla, Kochava (May 2026); Support King/SpyFone ban (2021, reaffirmed Dec 8 2025).
- State: CA Penal §637.7; CA Civ. §1798.90.5 (SB 34); TX Penal §16.06; VA §18.2-60.5; FL §934.425; NH RSA 261:75-b; ME 29-A §2117-A; AR §12-12-1803; VT 23 §1607; WA SB 6002; OR/VA/MD retention laws.
- *Schmidt v. City of Norfolk* (E.D. Va., Feb 2026); Google Play Stalkerware policy (2020); Apple App Review Guidelines 5.1.2 / 1.1.6 / 1.2 / 5.6.
