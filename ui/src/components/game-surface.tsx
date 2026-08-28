import * as stylex from "@stylexjs/stylex";
import {
  ActivityIcon,
  ChevronDownIcon,
  CircleDotIcon,
  CoinsIcon,
  CrownIcon,
  LogOutIcon,
  RadioIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SwordsIcon,
  TimerIcon,
  TrophyIcon,
  WalletIcon,
  WifiIcon,
  WifiOffIcon,
  ZapIcon,
} from "lucide-react";
import type { FormEventHandler, ReactElement } from "react";
import { isAddressEqual, type Address, type Hash } from "viem";

import type { ChallengeQuote, DeploymentManifest } from "../contracts";
import { formatWeth } from "../format";
import type { DataFreshness } from "../freshness";
import {
  ZERO_ADDRESS,
  formatDuration,
  projectedViewerReward,
  remainingSeconds,
  roundLabel,
  shortAddress,
  type ActivityItem,
  type GameSnapshot,
  type RoundPhase,
} from "../game-state";
import { colors, fonts, motion, radii, shadows, spacing } from "../styles/tokens.stylex";
import { Badge, type BadgeVariant } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardPanel, CardTitle } from "./ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue } from "./ui/progress";

export type GameFreshness = DataFreshness;

export type ClaimAction =
  | { kind: "champion"; roundId: bigint }
  | { kind: "crown-time"; roundId: bigint }
  | { kind: "refund" };

export interface GameSurfaceProps {
  deployment: DeploymentManifest;
  snapshot?: GameSnapshot;
  quote?: ChallengeQuote;
  account?: Address;
  phase: RoundPhase;
  now: bigint;
  freshness: GameFreshness;
  snapshotLoading: boolean;
  quoteLoading: boolean;
  refreshing: boolean;
  grossValue: string;
  minimumValue: string;
  grossError?: string;
  minimumError?: string;
  pending: boolean;
  actionStatus?: string;
  actionError?: string;
  transactionHash?: Hash;
  transactionNeedsCheck: boolean;
  transactionCanDismiss: boolean;
  transactionChecking: boolean;
  connected: boolean;
  wrongChain: boolean;
  onGrossChange(value: string): void;
  onMinimumChange(value: string): void;
  onPrimaryAction: FormEventHandler<HTMLFormElement>;
  onFinalize(): void;
  onConnect(): void;
  onSwitch(): void;
  onDisconnect(): void;
  onRefresh(): void;
  onCheckTransaction(): void;
  onDismissTransaction(): void;
  onClaim(action: ClaimAction): void;
}

interface FreshnessPresentation {
  detail: string;
  label: string;
  variant: BadgeVariant;
}

const freshnessPresentation: Record<GameFreshness, FreshnessPresentation> = {
  syncing: {
    detail: "Waiting for the first verified block.",
    label: "Syncing",
    variant: "secondary",
  },
  live: {
    detail: "New blocks update the arena.",
    label: "Live",
    variant: "success",
  },
  polling: {
    detail: "Block watch is unavailable. Timed refresh is active.",
    label: "Polling",
    variant: "info",
  },
  stale: {
    detail: "The last verified state is old. Refresh before you move.",
    label: "Stale",
    variant: "warning",
  },
  offline: {
    detail: "The RPC did not return game state.",
    label: "Offline",
    variant: "error",
  },
};

const crownArrival = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(-10px) scale(0.9)" },
  to: { opacity: 1, transform: "translateY(0) scale(1)" },
});

const styles = stylex.create({
  page: {
    backgroundColor: colors.pageBg,
    color: colors.textPrimary,
    fontFamily: fonts.sans,
    minBlockSize: "100dvh",
    overflowX: "hidden",
    position: "relative",
  },
  circuitField: {
    backgroundImage:
      "linear-gradient(oklch(0.82 0.13 195 / 0.045) 1px, transparent 1px), linear-gradient(90deg, oklch(0.82 0.13 195 / 0.045) 1px, transparent 1px), radial-gradient(circle at 18% 8%, oklch(0.82 0.16 330 / 0.13), transparent 28rem), radial-gradient(circle at 82% 20%, oklch(0.82 0.13 195 / 0.1), transparent 30rem)",
    backgroundPosition: "center",
    backgroundSize: "48px 48px, 48px 48px, auto, auto",
    insetBlockEnd: 0,
    insetBlockStart: 0,
    insetInlineEnd: 0,
    insetInlineStart: 0,
    maskImage: "linear-gradient(to bottom, black 0%, black 72%, transparent 100%)",
    pointerEvents: "none",
    position: "absolute",
  },
  topBeam: {
    backgroundImage:
      "linear-gradient(90deg, transparent, oklch(0.82 0.13 195 / 0.7), oklch(0.82 0.16 330 / 0.75), transparent)",
    blockSize: "1px",
    insetBlockStart: 0,
    insetInlineEnd: "4%",
    insetInlineStart: "4%",
    pointerEvents: "none",
    position: "absolute",
  },
  skipLink: {
    backgroundColor: colors.accentSolid,
    borderRadius: radii.md,
    color: colors.accentForeground,
    fontWeight: 750,
    insetBlockStart: spacing.space3,
    insetInlineStart: spacing.space3,
    minBlockSize: "44px",
    paddingBlock: spacing.space3,
    paddingInline: spacing.space4,
    position: "fixed",
    transform: {
      default: "translateY(-160%)",
      ":focus-visible": "translateY(0)",
    },
    zIndex: 20,
  },
  shell: {
    inlineSize: "min(100% - 32px, 1440px)",
    marginInline: "auto",
    position: "relative",
  },
  header: {
    alignItems: {
      default: "stretch",
      "@media (min-width: 760px)": "center",
    },
    borderBlockEndColor: colors.borderSubtle,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: "1px",
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 760px)": "row",
    },
    gap: spacing.space4,
    justifyContent: "space-between",
    paddingBlock: spacing.space4,
  },
  brandGroup: {
    alignItems: "center",
    display: "flex",
    gap: spacing.space3,
    minInlineSize: 0,
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: colors.crownSoft,
    blockSize: "44px",
    borderColor: colors.crown,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: "0 0 24px oklch(0.82 0.16 330 / 0.2)",
    color: colors.crown,
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: "44px",
    justifyContent: "center",
  },
  brandEyebrow: {
    color: colors.accentText,
    fontFamily: fonts.mono,
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.16em",
    lineHeight: 1.2,
    marginBlock: 0,
    textTransform: "uppercase",
  },
  brandTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: "20px",
    fontWeight: 800,
    letterSpacing: "-0.035em",
    lineHeight: 1.05,
    marginBlock: 0,
  },
  headerControls: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: spacing.space2,
  },
  networkGroup: {
    alignItems: "center",
    display: "inline-flex",
    flex: {
      default: "1 1 auto",
      "@media (min-width: 760px)": "0 1 auto",
    },
    gap: spacing.space2,
    minBlockSize: "44px",
  },
  freshnessCopy: {
    color: colors.textMuted,
    display: {
      default: "none",
      "@media (min-width: 1120px)": "block",
    },
    fontSize: "12px",
    maxInlineSize: "220px",
  },
  icon: {
    blockSize: "18px",
    flexShrink: 0,
    inlineSize: "18px",
    strokeWidth: 1.8,
  },
  iconSmall: {
    blockSize: "15px",
    flexShrink: 0,
    inlineSize: "15px",
    strokeWidth: 1.9,
  },
  main: {
    paddingBlockEnd: spacing.space12,
    paddingBlockStart: spacing.space8,
  },
  heroGrid: {
    alignItems: "start",
    display: "grid",
    gap: spacing.space6,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 1040px)": "minmax(0, 1.45fr) minmax(360px, 0.75fr)",
    },
  },
  sectionGrid: {
    display: "grid",
    gap: spacing.space6,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 800px)": "repeat(2, minmax(0, 1fr))",
      "@media (min-width: 1240px)": "repeat(3, minmax(0, 1fr))",
    },
    marginBlockStart: spacing.space6,
  },
  infoGrid: {
    display: "grid",
    gap: spacing.space4,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 880px)": "repeat(2, minmax(0, 1fr))",
    },
    marginBlockStart: spacing.space6,
  },
  card: {
    backgroundImage: "linear-gradient(145deg, oklch(0.2 0.04 260 / 0.92), oklch(0.13 0.026 267 / 0.96))",
    overflow: "hidden",
  },
  arenaCard: {
    backgroundImage: "linear-gradient(145deg, oklch(0.2 0.04 260 / 0.92), oklch(0.13 0.026 267 / 0.96))",
    borderColor: {
      default: colors.borderStrong,
      ':is([data-phase="urgent"] )': colors.warning,
      ':is([data-phase="expired"] )': colors.crown,
    },
    boxShadow: {
      default: shadows.card,
      ':is([data-phase="urgent"] )':
        "0 0 0 1px oklch(0.88 0.125 85 / 0.12), 0 18px 56px oklch(0.04 0.02 270 / 0.75), 0 0 36px oklch(0.88 0.125 85 / 0.08)",
      ':is([data-phase="expired"] )':
        "0 0 0 1px oklch(0.82 0.16 330 / 0.14), 0 18px 56px oklch(0.04 0.02 270 / 0.75), 0 0 42px oklch(0.82 0.16 330 / 0.1)",
    },
    minBlockSize: "100%",
    overflow: "hidden",
    transitionDuration: {
      default: motion.instant,
      "@media (prefers-reduced-motion: no-preference)": motion.normal,
    },
    transitionProperty: {
      default: "none",
      "@media (prefers-reduced-motion: no-preference)": "border-color, box-shadow",
    },
  },
  cardHeaderCompact: {
    paddingBlock: spacing.space4,
    paddingInline: spacing.space5,
  },
  cardPanel: {
    paddingBlock: spacing.space5,
    paddingInline: spacing.space5,
  },
  cardFooter: {
    paddingBlock: spacing.space4,
    paddingInline: spacing.space5,
  },
  overline: {
    color: colors.accentText,
    fontFamily: fonts.mono,
    fontSize: "11px",
    fontWeight: 750,
    letterSpacing: "0.13em",
    lineHeight: 1.2,
    marginBlockEnd: spacing.space2,
    marginBlockStart: 0,
    textTransform: "uppercase",
  },
  titleRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: spacing.space3,
  },
  cardHeading: {
    color: "inherit",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    letterSpacing: "inherit",
    lineHeight: "inherit",
    marginBlock: 0,
  },
  phaseBadgeActive: {
    boxShadow: "0 0 18px oklch(0.82 0.13 195 / 0.12)",
  },
  arenaPanel: {
    display: "grid",
    gap: spacing.space6,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 680px)": "minmax(0, 1.15fr) minmax(240px, 0.85fr)",
    },
  },
  clockZone: {
    alignItems: "start",
    display: "flex",
    flexDirection: "column",
    minInlineSize: 0,
  },
  clockLabel: {
    alignItems: "center",
    color: colors.textSecondary,
    display: "flex",
    fontSize: "13px",
    fontWeight: 650,
    gap: spacing.space2,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  clock: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: {
      default: "clamp(3.25rem, 18vw, 6rem)",
      "@media (min-width: 680px)": "clamp(4rem, 9vw, 7.25rem)",
    },
    fontVariantNumeric: "tabular-nums",
    fontWeight: 750,
    letterSpacing: "-0.09em",
    lineHeight: 0.9,
    marginBlock: spacing.space4,
    textShadow: "0 0 34px oklch(0.82 0.13 195 / 0.2)",
  },
  clockUrgent: {
    color: colors.warning,
    textShadow: "0 0 34px oklch(0.88 0.125 85 / 0.22)",
  },
  clockExpired: {
    color: colors.crown,
    textShadow: "0 0 34px oklch(0.82 0.16 330 / 0.24)",
  },
  clockIdle: {
    fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
    letterSpacing: "0.08em",
  },
  hardStop: {
    alignItems: "center",
    color: colors.textSecondary,
    display: "flex",
    fontFamily: fonts.mono,
    fontSize: "12px",
    gap: spacing.space2,
    marginBlockStart: spacing.space3,
  },
  progress: {
    inlineSize: "100%",
    maxInlineSize: "620px",
  },
  progressMeta: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },
  crownZone: {
    alignItems: "center",
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.borderSubtle,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: "1px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minBlockSize: "220px",
    overflow: "hidden",
    paddingBlock: spacing.space6,
    paddingInline: spacing.space5,
    position: "relative",
    textAlign: "center",
  },
  crownHalo: {
    backgroundImage: "radial-gradient(circle, oklch(0.82 0.16 330 / 0.2), transparent 68%)",
    blockSize: "220px",
    insetBlockStart: "-80px",
    insetInlineStart: "50%",
    pointerEvents: "none",
    position: "absolute",
    transform: "translateX(-50%)",
    inlineSize: "220px",
  },
  crownOrb: {
    alignItems: "center",
    animationDuration: {
      default: motion.instant,
      "@media (prefers-reduced-motion: no-preference)": "520ms",
    },
    animationFillMode: "both",
    animationIterationCount: "1",
    animationName: {
      default: "none",
      "@media (prefers-reduced-motion: no-preference)": crownArrival,
    },
    animationTimingFunction: motion.easing,
    backgroundColor: colors.crownSoft,
    blockSize: "78px",
    borderColor: colors.crown,
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: "0 0 38px oklch(0.82 0.16 330 / 0.24), inset 0 0 24px oklch(0.82 0.16 330 / 0.12)",
    color: colors.crown,
    display: "inline-flex",
    inlineSize: "78px",
    justifyContent: "center",
    marginBlockEnd: spacing.space4,
    position: "relative",
  },
  crownIcon: {
    blockSize: "34px",
    inlineSize: "34px",
    strokeWidth: 1.7,
  },
  crownCaption: {
    color: colors.textMuted,
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.12em",
    marginBlock: 0,
    textTransform: "uppercase",
  },
  crownAddress: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: "18px",
    fontWeight: 750,
    marginBlockEnd: spacing.space2,
    marginBlockStart: spacing.space2,
  },
  crownTenure: {
    color: colors.textSecondary,
    fontSize: "13px",
    lineHeight: 1.4,
    marginBlock: 0,
  },
  metrics: {
    display: "grid",
    gap: spacing.space3,
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@media (min-width: 560px)": "repeat(3, minmax(0, 1fr))",
    },
    marginBlockStart: spacing.space6,
  },
  metric: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: "1px",
    minInlineSize: 0,
    paddingBlock: spacing.space3,
    paddingInline: spacing.space3,
  },
  metricLabel: {
    color: colors.textMuted,
    display: "block",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    lineHeight: 1.2,
    marginBlockEnd: spacing.space2,
    textTransform: "uppercase",
  },
  metricValue: {
    color: colors.textPrimary,
    display: "block",
    fontFamily: fonts.mono,
    fontSize: "14px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    overflowWrap: "anywhere",
  },
  outcome: {
    alignItems: "center",
    display: "flex",
    flex: "1 1 260px",
    gap: spacing.space3,
    minInlineSize: 0,
  },
  outcomeIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    blockSize: "40px",
    borderRadius: radii.md,
    color: colors.accentText,
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: "40px",
    justifyContent: "center",
  },
  outcomeTitle: {
    color: colors.textPrimary,
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: 1.35,
    marginBlock: 0,
  },
  outcomeCopy: {
    color: colors.textSecondary,
    fontSize: "13px",
    lineHeight: 1.45,
    marginBlockEnd: 0,
    marginBlockStart: spacing.space1,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: spacing.space5,
  },
  quoteGrid: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: "1px",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    overflow: "hidden",
  },
  quoteCell: {
    borderBlockEndColor: colors.borderSubtle,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: "1px",
    minInlineSize: 0,
    paddingBlock: spacing.space3,
    paddingInline: spacing.space3,
  },
  quoteCellRight: {
    borderInlineStartColor: colors.borderSubtle,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: "1px",
  },
  quoteTotal: {
    gridColumn: "1 / -1",
    paddingBlock: spacing.space4,
    paddingInline: spacing.space3,
  },
  quoteTotalValue: {
    color: colors.accentText,
    fontFamily: fonts.mono,
    fontSize: "20px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 750,
  },
  details: {
    borderBlockStartColor: colors.borderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: "1px",
  },
  summary: {
    alignItems: "center",
    color: colors.textSecondary,
    cursor: "pointer",
    display: "flex",
    fontSize: "13px",
    fontWeight: 650,
    gap: spacing.space2,
    justifyContent: "space-between",
    listStyleType: "none",
    minBlockSize: "44px",
    outlineColor: {
      default: "transparent",
      ":focus-visible": colors.focus,
    },
    outlineOffset: "2px",
    outlineStyle: "solid",
    outlineWidth: {
      default: "0px",
      ":focus-visible": "2px",
    },
    "::-webkit-details-marker": {
      display: "none",
    },
  },
  detailsCopy: {
    color: colors.textSecondary,
    fontSize: "13px",
    lineHeight: 1.55,
    marginBlockEnd: spacing.space4,
    marginBlockStart: 0,
  },
  actionStack: {
    display: "flex",
    flexDirection: "column",
    gap: spacing.space2,
  },
  primaryButton: {
    inlineSize: "100%",
  },
  actionHint: {
    color: colors.textSecondary,
    fontSize: "12px",
    lineHeight: 1.45,
    marginBlock: 0,
    textAlign: "center",
  },
  statusRail: {
    display: "grid",
    gap: spacing.space3,
    marginBlockStart: spacing.space4,
  },
  statusMessage: {
    alignItems: "center",
    backgroundColor: colors.infoSoft,
    borderColor: colors.info,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: "1px",
    color: colors.textPrimary,
    display: "flex",
    fontSize: "13px",
    gap: spacing.space3,
    lineHeight: 1.45,
    marginBlock: 0,
    minBlockSize: "44px",
    overflowWrap: "anywhere",
    paddingBlock: spacing.space3,
    paddingInline: spacing.space4,
  },
  errorMessage: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: "1px",
    color: colors.textPrimary,
    display: "flex",
    fontSize: "13px",
    gap: spacing.space3,
    lineHeight: 1.45,
    marginBlock: 0,
    minBlockSize: "44px",
    overflowWrap: "anywhere",
    paddingBlock: spacing.space3,
    paddingInline: spacing.space4,
  },
  transactionRecovery: {
    alignItems: {
      default: "stretch",
      "@media (min-width: 620px)": "center",
    },
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 620px)": "row",
    },
    gap: spacing.space3,
  },
  transactionHash: {
    color: colors.textMuted,
    flex: "1 1 auto",
    fontFamily: fonts.mono,
    fontSize: "11px",
    lineHeight: 1.5,
    marginBlock: 0,
    overflowWrap: "anywhere",
  },
  transactionActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: spacing.space2,
  },
  emptyState: {
    alignItems: "center",
    color: colors.textSecondary,
    display: "flex",
    flexDirection: "column",
    gap: spacing.space3,
    justifyContent: "center",
    minBlockSize: "160px",
    paddingBlock: spacing.space6,
    textAlign: "center",
  },
  emptyIcon: {
    blockSize: "28px",
    color: colors.textMuted,
    inlineSize: "28px",
    strokeWidth: 1.5,
  },
  emptyCopy: {
    color: colors.textSecondary,
    fontSize: "14px",
    lineHeight: 1.5,
    marginBlock: 0,
  },
  playerStats: {
    display: "grid",
    gap: spacing.space3,
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  rewardHero: {
    backgroundColor: colors.crownSoft,
    borderColor: colors.crown,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: "1px",
    gridColumn: "1 / -1",
    paddingBlock: spacing.space4,
    paddingInline: spacing.space4,
  },
  rewardValue: {
    color: colors.crown,
    display: "block",
    fontFamily: fonts.mono,
    fontSize: "24px",
    fontWeight: 750,
    marginBlockStart: spacing.space2,
  },
  subheading: {
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: "14px",
    fontWeight: 750,
    letterSpacing: "-0.01em",
    marginBlockEnd: spacing.space3,
    marginBlockStart: spacing.space6,
  },
  claimList: {
    display: "flex",
    flexDirection: "column",
    gap: spacing.space2,
  },
  claimRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: "1px",
    display: "flex",
    gap: spacing.space3,
    justifyContent: "space-between",
    minBlockSize: "60px",
    paddingBlock: spacing.space2,
    paddingInline: spacing.space3,
  },
  claimTitle: {
    color: colors.textSecondary,
    fontSize: "12px",
    lineHeight: 1.35,
    marginBlock: 0,
  },
  claimValue: {
    color: colors.textPrimary,
    display: "block",
    fontFamily: fonts.mono,
    fontSize: "13px",
    marginBlockStart: spacing.space1,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: spacing.space2,
    listStyleType: "none",
    marginBlock: 0,
    paddingInlineStart: 0,
  },
  standingRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: "1px",
    display: "grid",
    gap: spacing.space3,
    gridTemplateColumns: "32px minmax(0, 1fr) auto",
    minBlockSize: "62px",
    paddingBlock: spacing.space2,
    paddingInline: spacing.space3,
  },
  rank: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: "12px",
    fontWeight: 700,
  },
  identityLine: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: spacing.space2,
  },
  identityAddress: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: "13px",
    fontWeight: 700,
  },
  identityMeta: {
    color: colors.textMuted,
    display: "block",
    fontSize: "11px",
    marginBlockStart: spacing.space1,
  },
  standingReward: {
    color: colors.accentText,
    fontFamily: fonts.mono,
    fontSize: "12px",
    fontWeight: 700,
    textAlign: "end",
  },
  activityRow: {
    alignItems: "start",
    borderBlockEndColor: colors.borderSubtle,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: "1px",
    display: "grid",
    gap: spacing.space3,
    gridTemplateColumns: "32px minmax(0, 1fr) auto",
    paddingBlock: spacing.space3,
  },
  activityMarker: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    blockSize: "32px",
    borderRadius: radii.pill,
    color: colors.accentText,
    display: "inline-flex",
    inlineSize: "32px",
    justifyContent: "center",
  },
  activityTitle: {
    color: colors.textPrimary,
    fontSize: "13px",
    fontWeight: 700,
    lineHeight: 1.35,
    marginBlock: 0,
  },
  activityDetail: {
    color: colors.textSecondary,
    display: "block",
    fontSize: "12px",
    lineHeight: 1.45,
    marginBlockStart: spacing.space1,
  },
  activityTime: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: "10px",
    paddingBlockStart: spacing.space1,
    whiteSpace: "nowrap",
  },
  disclosure: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: shadows.card,
    overflow: "hidden",
  },
  disclosureSummary: {
    alignItems: "center",
    color: colors.textPrimary,
    cursor: "pointer",
    display: "flex",
    fontSize: "14px",
    fontWeight: 700,
    gap: spacing.space3,
    justifyContent: "space-between",
    listStyleType: "none",
    minBlockSize: "56px",
    outlineColor: {
      default: "transparent",
      ":focus-visible": colors.focus,
    },
    outlineOffset: "-3px",
    outlineStyle: "solid",
    outlineWidth: {
      default: "0px",
      ":focus-visible": "2px",
    },
    paddingBlock: spacing.space3,
    paddingInline: spacing.space4,
    "::-webkit-details-marker": {
      display: "none",
    },
  },
  disclosureTitle: {
    alignItems: "center",
    display: "flex",
    gap: spacing.space3,
  },
  disclosurePanel: {
    borderBlockStartColor: colors.borderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: "1px",
    paddingBlock: spacing.space4,
    paddingInline: spacing.space4,
  },
  rulesList: {
    color: colors.textSecondary,
    display: "grid",
    fontSize: "13px",
    gap: spacing.space3,
    lineHeight: 1.55,
    marginBlock: 0,
    paddingInlineStart: spacing.space5,
  },
  contractList: {
    display: "grid",
    gap: spacing.space3,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 560px)": "minmax(120px, 0.3fr) minmax(0, 1fr)",
    },
    marginBlock: 0,
  },
  contractTerm: {
    color: colors.textMuted,
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  contractValue: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: "12px",
    marginInlineStart: 0,
    overflowWrap: "anywhere",
    userSelect: "all",
  },
  footer: {
    alignItems: {
      default: "start",
      "@media (min-width: 720px)": "center",
    },
    borderBlockStartColor: colors.borderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: "1px",
    color: colors.textMuted,
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 720px)": "row",
    },
    fontSize: "12px",
    gap: spacing.space3,
    justifyContent: "space-between",
    lineHeight: 1.5,
    paddingBlock: spacing.space5,
  },
  footerCopy: {
    marginBlock: 0,
  },
  footerTech: {
    alignItems: "center",
    display: "flex",
    fontFamily: fonts.mono,
    gap: spacing.space2,
  },
});

function activityIcon(kind: ActivityItem["kind"]): ReactElement {
  switch (kind) {
    case "start":
      return <ZapIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />;
    case "crown":
      return <CrownIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />;
    case "finalized":
      return <TrophyIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />;
    case "champion-claim":
    case "time-claim":
    case "refund":
      return <CoinsIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />;
  }
}

function freshnessIcon(freshness: GameFreshness): ReactElement {
  if (freshness === "offline") {
    return <WifiOffIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />;
  }
  if (freshness === "live") {
    return <RadioIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />;
  }
  return <WifiIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />;
}

function phaseVariant(phase: RoundPhase): BadgeVariant {
  switch (phase) {
    case "idle":
      return "secondary";
    case "active":
      return "info";
    case "urgent":
      return "warning";
    case "expired":
      return "default";
    case "decision":
      return "destructive";
  }
}

function countdownStyle(phase: RoundPhase) {
  if (phase === "urgent") return styles.clockUrgent;
  if (phase === "expired") return styles.clockExpired;
  return undefined;
}

function countdownProgress(snapshot: GameSnapshot | undefined, now: bigint): number {
  if (!snapshot || snapshot.round.leader === ZERO_ADDRESS) return 0;
  const duration = snapshot.round.softEnd - snapshot.round.leaderSince;
  if (duration <= 0n) return 0;
  const remaining = remainingSeconds(snapshot.round.softEnd, now);
  return Math.max(0, Math.min(100, Number((remaining * 10_000n) / duration) / 100));
}

function claimCount(snapshot: GameSnapshot | undefined): number {
  if (!snapshot) return 0;
  const rewards = snapshot.claims.reduce(
    (count, claim) => count + Number(claim.championReward > 0n) + Number(claim.crownTimeReward > 0n),
    0,
  );
  return rewards + Number(snapshot.refundCredit > 0n);
}

function outcomeCopy(
  snapshot: GameSnapshot | undefined,
  phase: RoundPhase,
): { title: string; detail: string } {
  if (!snapshot || snapshot.round.leader === ZERO_ADDRESS) {
    return {
      title: "The arena is open.",
      detail: "The first challenge starts a 15-minute knockout.",
    };
  }
  if (phase === "expired") {
    return {
      title: "The crown window has closed.",
      detail: "Finalize the round to make rewards claimable.",
    };
  }
  if (snapshot.viewerOutcome.decision) {
    return {
      title: "This round will end by decision.",
      detail: "Crown-time holders share 90% of the pot. There is no champion reward.",
    };
  }
  return {
    title: `${shortAddress(snapshot.round.leader)} wins if nobody responds.`,
    detail: `${formatWeth(snapshot.viewerOutcome.championPool)} champion pool plus crown-time rewards.`,
  };
}

function primaryCopy(props: GameSurfaceProps): { label: string; hint: string } {
  if (!props.connected) {
    return {
      label: "Connect wallet",
      hint: "Connect to preview your position and make a move.",
    };
  }
  if (props.wrongChain) {
    return {
      label: `Switch to ${props.deployment.network}`,
      hint: `Overtime is on chain ${props.deployment.chainId}.`,
    };
  }
  if (props.quoteLoading) {
    return {
      label: "Sync latest move",
      hint: "A new block arrived. The action will use the refreshed crown cost.",
    };
  }
  if (props.quote && props.snapshot && props.snapshot.allowance !== props.quote.totalWeth) {
    return {
      label: "Set exact WETH cap",
      hint: `Approve exactly ${formatWeth(props.quote.totalWeth, 18)} for the latest move price.`,
    };
  }
  if (!props.quote) {
    return {
      label: "Preview move",
      hint: props.quoteLoading
        ? "Calculating the current crown cost."
        : "Enter a valid WETH amount to continue.",
    };
  }
  const isLeader = Boolean(
    props.account && props.snapshot && isAddressEqual(props.account, props.snapshot.round.leader),
  );
  return {
    label: isLeader ? "Hold the crown" : "Take the crown",
    hint: `Current total: ${formatWeth(props.quote.totalWeth, 18)}. A higher cost will revert.`,
  };
}

function formatActivityTime(activity: ActivityItem): { dateTime?: string; label: string } {
  if (activity.timestamp === undefined) return { label: `Block ${activity.blockNumber}` };
  const date = new Date(Number(activity.timestamp) * 1_000);
  return {
    dateTime: date.toISOString(),
    label: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
}

function QuoteValue({ loading, value }: { loading: boolean; value?: bigint }): ReactElement {
  return (
    <span {...stylex.props(styles.metricValue)}>
      {loading ? "Calculating…" : value === undefined ? "—" : formatWeth(value, 6)}
    </span>
  );
}

export function GameSurface(props: GameSurfaceProps): ReactElement {
  const {
    account,
    actionError,
    actionStatus,
    connected,
    deployment,
    freshness,
    grossError,
    grossValue,
    minimumError,
    minimumValue,
    now,
    onClaim,
    onCheckTransaction,
    onConnect,
    onDismissTransaction,
    onDisconnect,
    onFinalize,
    onGrossChange,
    onMinimumChange,
    onPrimaryAction,
    onRefresh,
    onSwitch,
    pending,
    phase,
    quote,
    quoteLoading,
    refreshing,
    snapshot,
    snapshotLoading,
    transactionCanDismiss,
    transactionChecking,
    transactionHash,
    transactionNeedsCheck,
    wrongChain,
  } = props;
  const freshnessMeta = freshnessPresentation[freshness];
  const active = Boolean(snapshot && snapshot.round.leader !== ZERO_ADDRESS);
  const softRemaining = snapshot && active ? remainingSeconds(snapshot.round.softEnd, now) : 0n;
  const hardRemaining = snapshot && active ? remainingSeconds(snapshot.round.hardEnd, now) : 0n;
  const tenure =
    snapshot && active && now > snapshot.round.leaderSince ? now - snapshot.round.leaderSince : 0n;
  const outcome = outcomeCopy(snapshot, phase);
  const primary = primaryCopy(props);
  const totalClaims = claimCount(snapshot);
  const progress = countdownProgress(snapshot, now);

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.circuitField)} aria-hidden="true" />
      <div {...stylex.props(styles.topBeam)} aria-hidden="true" />
      <a {...stylex.props(styles.skipLink)} href="#game-main">
        Skip to arena
      </a>

      <header {...stylex.props(styles.shell, styles.header)}>
        <div {...stylex.props(styles.brandGroup)}>
          <span {...stylex.props(styles.brandMark)} aria-hidden="true">
            <CrownIcon {...stylex.props(styles.icon)} />
          </span>
          <div>
            <p {...stylex.props(styles.brandEyebrow)}>Uniswap v4 leader-time game</p>
            <h1 {...stylex.props(styles.brandTitle)}>OVERTIME // Crown Protocol</h1>
          </div>
        </div>

        <div {...stylex.props(styles.headerControls)}>
          <div {...stylex.props(styles.networkGroup)}>
            <Badge size="lg" variant="outline">
              <CircleDotIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
              {deployment.network} · {deployment.chainId}
            </Badge>
            <Badge size="lg" variant={freshnessMeta.variant}>
              {freshnessIcon(freshness)}
              {freshnessMeta.label}
            </Badge>
            <span {...stylex.props(styles.freshnessCopy)}>{freshnessMeta.detail}</span>
          </div>

          <Button
            aria-label="Refresh game state"
            disabled={pending}
            loading={refreshing}
            onClick={onRefresh}
            size="icon"
            type="button"
            variant="ghost"
          >
            <RefreshCwIcon {...stylex.props(styles.icon)} aria-hidden="true" />
          </Button>
          {!connected ? (
            <Button disabled={pending} onClick={onConnect} type="button" variant="outline">
              <WalletIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
              Connect
            </Button>
          ) : (
            <>
              {wrongChain ? (
                <Button disabled={pending} onClick={onSwitch} type="button" variant="destructive-outline">
                  Switch network
                </Button>
              ) : (
                <Badge size="lg" variant="secondary">
                  <WalletIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
                  <bdi>{account ? shortAddress(account) : "Connected"}</bdi>
                </Badge>
              )}
              <Button
                aria-label="Disconnect wallet"
                disabled={pending}
                onClick={onDisconnect}
                size="icon"
                type="button"
                variant="ghost"
              >
                <LogOutIcon {...stylex.props(styles.icon)} aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </header>

      <main {...stylex.props(styles.shell, styles.main)} id="game-main">
        <div {...stylex.props(styles.heroGrid)}>
          <Card
            aria-busy={snapshotLoading || undefined}
            data-phase={phase}
            render={<section aria-labelledby="arena-title" />}
            xstyle={styles.arenaCard}
          >
            <CardHeader xstyle={styles.cardHeaderCompact}>
              <div>
                <p {...stylex.props(styles.overline)}>
                  {snapshot?.roundId ? `Round ${snapshot.roundId}` : "Arena standby"}
                </p>
                <div {...stylex.props(styles.titleRow)}>
                  <CardTitle>
                    <h2 {...stylex.props(styles.cardHeading)} id="arena-title">
                      {roundLabel(phase)}
                    </h2>
                  </CardTitle>
                  <Badge xstyle={styles.phaseBadgeActive} variant={phaseVariant(phase)}>
                    {phase === "expired" ? "Finalize" : phase}
                  </Badge>
                </div>
              </div>
              <CardAction>
                <Badge variant="outline">
                  <ShieldCheckIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
                  Onchain
                </Badge>
              </CardAction>
            </CardHeader>

            <CardPanel xstyle={styles.cardPanel}>
              <div {...stylex.props(styles.arenaPanel)}>
                <div {...stylex.props(styles.clockZone)}>
                  <span {...stylex.props(styles.clockLabel)}>
                    <TimerIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
                    Crown window
                  </span>
                  {active ? (
                    <time
                      {...stylex.props(styles.clock, countdownStyle(phase))}
                      aria-label={`${softRemaining} seconds remain in the crown window`}
                      dateTime={`PT${softRemaining}S`}
                    >
                      {formatDuration(softRemaining)}
                    </time>
                  ) : (
                    <span
                      {...stylex.props(styles.clock, styles.clockIdle)}
                      aria-label="No active crown window"
                    >
                      READY
                    </span>
                  )}
                  <Progress aria-label="Crown window remaining" value={progress} xstyle={styles.progress}>
                    <span {...stylex.props(styles.progressMeta)}>
                      <ProgressLabel>Window remaining</ProgressLabel>
                      <ProgressValue>{() => `${Math.round(progress)}%`}</ProgressValue>
                    </span>
                    <ProgressTrack>
                      <ProgressIndicator />
                    </ProgressTrack>
                  </Progress>
                  <span {...stylex.props(styles.hardStop)}>
                    <ShieldCheckIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
                    Hard stop {active ? formatDuration(hardRemaining) : "--:--"}
                  </span>
                </div>

                <div {...stylex.props(styles.crownZone)}>
                  <span {...stylex.props(styles.crownHalo)} aria-hidden="true" />
                  <span
                    {...stylex.props(styles.crownOrb)}
                    key={`${snapshot?.roundId ?? 0n}-${snapshot?.round.leader ?? ZERO_ADDRESS}`}
                  >
                    <CrownIcon {...stylex.props(styles.crownIcon)} aria-hidden="true" />
                  </span>
                  <p {...stylex.props(styles.crownCaption)}>Current crown holder</p>
                  <p {...stylex.props(styles.crownAddress)}>
                    <bdi>{active && snapshot ? shortAddress(snapshot.round.leader) : "Unclaimed"}</bdi>
                  </p>
                  <p {...stylex.props(styles.crownTenure)}>
                    {active ? `Holding for ${formatDuration(tenure)}` : "The first move starts the clock."}
                  </p>
                </div>
              </div>

              <div {...stylex.props(styles.metrics)}>
                <div {...stylex.props(styles.metric)}>
                  <span {...stylex.props(styles.metricLabel)}>Active pot</span>
                  <span {...stylex.props(styles.metricValue)}>
                    {snapshot ? formatWeth(snapshot.round.activePot) : "—"}
                  </span>
                </div>
                <div {...stylex.props(styles.metric)}>
                  <span {...stylex.props(styles.metricLabel)}>Champion pool</span>
                  <span {...stylex.props(styles.metricValue)}>
                    {snapshot && active ? formatWeth(snapshot.viewerOutcome.championPool) : "—"}
                  </span>
                </div>
                <div {...stylex.props(styles.metric)}>
                  <span {...stylex.props(styles.metricLabel)}>Crown-time pool</span>
                  <span {...stylex.props(styles.metricValue)}>
                    {snapshot && active ? formatWeth(snapshot.viewerOutcome.crownTimePool) : "—"}
                  </span>
                </div>
              </div>
            </CardPanel>

            <CardFooter xstyle={styles.cardFooter}>
              <div {...stylex.props(styles.outcome)}>
                <span {...stylex.props(styles.outcomeIcon)} aria-hidden="true">
                  <TrophyIcon {...stylex.props(styles.icon)} />
                </span>
                <div>
                  <p {...stylex.props(styles.outcomeTitle)}>{outcome.title}</p>
                  <p {...stylex.props(styles.outcomeCopy)}>{outcome.detail}</p>
                </div>
              </div>
              {phase === "expired" ? (
                <Button
                  disabled={pending}
                  loading={pending}
                  onClick={onFinalize}
                  type="button"
                  variant="default"
                >
                  <TrophyIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
                  {!connected ? "Connect to finalize" : wrongChain ? "Switch to finalize" : "Finalize round"}
                </Button>
              ) : null}
            </CardFooter>
          </Card>

          <Card render={<section aria-labelledby="challenge-title" />} xstyle={styles.card}>
            <CardHeader xstyle={styles.cardHeaderCompact}>
              <CardTitle>
                <h2 {...stylex.props(styles.cardHeading)} id="challenge-title">
                  Challenge console
                </h2>
              </CardTitle>
              <CardDescription>Set your move. The quote reads the production hook.</CardDescription>
              <CardAction>
                <Badge variant="default">
                  <SwordsIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
                  Player move
                </Badge>
              </CardAction>
            </CardHeader>
            <CardPanel xstyle={styles.cardPanel}>
              <form {...stylex.props(styles.form)} noValidate onSubmit={onPrimaryAction}>
                <Field invalid={Boolean(grossError)} name="gross-weth">
                  <FieldLabel htmlFor="gross-weth">Challenge amount</FieldLabel>
                  <Input
                    aria-describedby={`gross-description${grossError ? " gross-error" : ""}`}
                    aria-errormessage={grossError ? "gross-error" : undefined}
                    aria-invalid={grossError ? true : undefined}
                    autoComplete="off"
                    disabled={pending}
                    id="gross-weth"
                    inputMode="decimal"
                    name="gross-weth"
                    onChange={(event) => onGrossChange(event.currentTarget.value)}
                    placeholder="0.10"
                    spellCheck={false}
                    type="text"
                    value={grossValue}
                  />
                  <FieldDescription id="gross-description">
                    Minimum 0.01 WETH. This is the swap input.
                  </FieldDescription>
                  {grossError ? <FieldError id="gross-error">{grossError}</FieldError> : null}
                </Field>

                <Field invalid={Boolean(minimumError)} name="minimum-overtime">
                  <FieldLabel htmlFor="minimum-overtime">Minimum OVERTIME received</FieldLabel>
                  <Input
                    aria-describedby={`minimum-description${minimumError ? " minimum-error" : ""}`}
                    aria-errormessage={minimumError ? "minimum-error" : undefined}
                    aria-invalid={minimumError ? true : undefined}
                    autoComplete="off"
                    disabled={pending}
                    id="minimum-overtime"
                    inputMode="decimal"
                    name="minimum-overtime"
                    onChange={(event) => onMinimumChange(event.currentTarget.value)}
                    placeholder="0"
                    spellCheck={false}
                    type="text"
                    value={minimumValue}
                  />
                  <FieldDescription id="minimum-description">
                    Your slippage floor. Use 0 only for local testing.
                  </FieldDescription>
                  {minimumError ? <FieldError id="minimum-error">{minimumError}</FieldError> : null}
                </Field>

                <div {...stylex.props(styles.quoteGrid)} aria-busy={quoteLoading || undefined}>
                  <div {...stylex.props(styles.quoteCell)}>
                    <span {...stylex.props(styles.metricLabel)}>Game fee</span>
                    <QuoteValue loading={quoteLoading} value={quote?.gameFee} />
                  </div>
                  <div {...stylex.props(styles.quoteCell, styles.quoteCellRight)}>
                    <span {...stylex.props(styles.metricLabel)}>Crown cost</span>
                    <QuoteValue loading={quoteLoading} value={quote?.crownCost} />
                  </div>
                  <div {...stylex.props(styles.quoteTotal)}>
                    <span {...stylex.props(styles.metricLabel)}>Latest WETH total</span>
                    <span {...stylex.props(styles.quoteTotalValue)}>
                      {quoteLoading ? "Calculating…" : quote ? formatWeth(quote.totalWeth, 18) : "—"}
                    </span>
                  </div>
                </div>

                <details {...stylex.props(styles.details)}>
                  <summary {...stylex.props(styles.summary)}>
                    How the quote works
                    <ChevronDownIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
                  </summary>
                  <p {...stylex.props(styles.detailsCopy)}>
                    The hook separates the game fee and current crown cost. Overtime sets your WETH allowance
                    to this latest total. A higher crown cost or OVERTIME output below your minimum makes the
                    move revert.
                  </p>
                </details>

                <div {...stylex.props(styles.actionStack)}>
                  <Button
                    aria-describedby="challenge-action-hint"
                    loading={pending}
                    size="xl"
                    type="submit"
                    xstyle={styles.primaryButton}
                  >
                    <ZapIcon {...stylex.props(styles.icon)} aria-hidden="true" />
                    {primary.label}
                  </Button>
                  <p {...stylex.props(styles.actionHint)} id="challenge-action-hint">
                    {primary.hint}
                  </p>
                </div>
              </form>
            </CardPanel>
          </Card>
        </div>

        <div {...stylex.props(styles.statusRail)}>
          <output {...stylex.props(styles.statusMessage)} aria-live="polite">
            {actionError ? null : (
              <>
                <RadioIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
                {actionStatus ?? "Arena controls ready."}
              </>
            )}
          </output>
          {actionError ? (
            <p {...stylex.props(styles.errorMessage)} role="alert">
              <WifiOffIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
              {actionError}
            </p>
          ) : null}
          {transactionHash && (transactionNeedsCheck || transactionChecking || transactionCanDismiss) ? (
            <div {...stylex.props(styles.transactionRecovery)}>
              <p {...stylex.props(styles.transactionHash)}>
                Locked transaction: <bdi>{transactionHash}</bdi>
              </p>
              <div {...stylex.props(styles.transactionActions)}>
                {transactionNeedsCheck || transactionChecking ? (
                  <Button
                    disabled={transactionChecking}
                    loading={transactionChecking}
                    onClick={onCheckTransaction}
                    type="button"
                    variant="outline"
                  >
                    <RefreshCwIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
                    Check transaction
                  </Button>
                ) : null}
                {transactionCanDismiss ? (
                  <Button onClick={onDismissTransaction} type="button" variant="destructive-outline">
                    Unlock dropped transaction
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div {...stylex.props(styles.sectionGrid)}>
          <Card render={<section aria-labelledby="position-title" />} xstyle={styles.card}>
            <CardHeader xstyle={styles.cardHeaderCompact}>
              <CardTitle>
                <h2 {...stylex.props(styles.cardHeading)} id="position-title">
                  Your position
                </h2>
              </CardTitle>
              <CardDescription>Projected rewards from verified contract state.</CardDescription>
              <CardAction>
                <Badge variant={totalClaims ? "success" : "secondary"}>{totalClaims} claimable</Badge>
              </CardAction>
            </CardHeader>
            <CardPanel xstyle={styles.cardPanel}>
              {!connected || !account ? (
                <div {...stylex.props(styles.emptyState)}>
                  <WalletIcon {...stylex.props(styles.emptyIcon)} aria-hidden="true" />
                  <p {...stylex.props(styles.emptyCopy)}>
                    Connect a wallet to see your crown time and rewards.
                  </p>
                  <Button disabled={pending} onClick={onConnect} type="button" variant="outline">
                    Connect wallet
                  </Button>
                </div>
              ) : snapshot ? (
                <>
                  <div {...stylex.props(styles.playerStats)}>
                    <div {...stylex.props(styles.rewardHero)}>
                      <span {...stylex.props(styles.metricLabel)}>Projected reward</span>
                      <strong {...stylex.props(styles.rewardValue)}>
                        {formatWeth(projectedViewerReward(snapshot.viewerOutcome))}
                      </strong>
                    </div>
                    <div {...stylex.props(styles.metric)}>
                      <span {...stylex.props(styles.metricLabel)}>Crown time</span>
                      <span {...stylex.props(styles.metricValue)}>
                        {formatDuration(snapshot.viewerOutcome.playerCrownSeconds)}
                      </span>
                    </div>
                    <div {...stylex.props(styles.metric)}>
                      <span {...stylex.props(styles.metricLabel)}>Champion share</span>
                      <span {...stylex.props(styles.metricValue)}>
                        {formatWeth(snapshot.viewerOutcome.championReward)}
                      </span>
                    </div>
                  </div>

                  <h3 {...stylex.props(styles.subheading)}>Ready to claim</h3>
                  <div {...stylex.props(styles.claimList)}>
                    {snapshot.claims.flatMap((claim) => {
                      const rows: ReactElement[] = [];
                      if (claim.championReward > 0n) {
                        rows.push(
                          <div {...stylex.props(styles.claimRow)} key={`champion-${claim.roundId}`}>
                            <div>
                              <p {...stylex.props(styles.claimTitle)}>Round {claim.roundId} champion</p>
                              <strong {...stylex.props(styles.claimValue)}>
                                {formatWeth(claim.championReward)}
                              </strong>
                            </div>
                            <Button
                              disabled={pending}
                              onClick={() => onClaim({ kind: "champion", roundId: claim.roundId })}
                              size="sm"
                              type="button"
                              variant="default"
                            >
                              {wrongChain ? "Switch to claim" : "Claim"}
                            </Button>
                          </div>,
                        );
                      }
                      if (claim.crownTimeReward > 0n) {
                        rows.push(
                          <div {...stylex.props(styles.claimRow)} key={`crown-time-${claim.roundId}`}>
                            <div>
                              <p {...stylex.props(styles.claimTitle)}>Round {claim.roundId} crown-time</p>
                              <strong {...stylex.props(styles.claimValue)}>
                                {formatWeth(claim.crownTimeReward)}
                              </strong>
                            </div>
                            <Button
                              disabled={pending}
                              onClick={() => onClaim({ kind: "crown-time", roundId: claim.roundId })}
                              size="sm"
                              type="button"
                              variant="default"
                            >
                              {wrongChain ? "Switch to claim" : "Claim"}
                            </Button>
                          </div>,
                        );
                      }
                      return rows;
                    })}
                    {snapshot.refundCredit > 0n ? (
                      <div {...stylex.props(styles.claimRow)}>
                        <div>
                          <p {...stylex.props(styles.claimTitle)}>Same-block refund</p>
                          <strong {...stylex.props(styles.claimValue)}>
                            {formatWeth(snapshot.refundCredit)}
                          </strong>
                        </div>
                        <Button
                          disabled={pending}
                          onClick={() => onClaim({ kind: "refund" })}
                          size="sm"
                          type="button"
                          variant="default"
                        >
                          {wrongChain ? "Switch to claim" : "Claim"}
                        </Button>
                      </div>
                    ) : null}
                    {totalClaims === 0 ? (
                      <p {...stylex.props(styles.emptyCopy)}>No rewards are ready to claim.</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div {...stylex.props(styles.emptyState)}>
                  <ActivityIcon {...stylex.props(styles.emptyIcon)} aria-hidden="true" />
                  <p {...stylex.props(styles.emptyCopy)}>
                    {snapshotLoading ? "Loading your position…" : "Position unavailable."}
                  </p>
                </div>
              )}
            </CardPanel>
          </Card>

          <Card render={<section aria-labelledby="standings-title" />} xstyle={styles.card}>
            <CardHeader xstyle={styles.cardHeaderCompact}>
              <CardTitle>
                <h2 {...stylex.props(styles.cardHeading)} id="standings-title">
                  Crown standings
                </h2>
              </CardTitle>
              <CardDescription>Projected order if the round ends now.</CardDescription>
              <CardAction>
                <Badge variant="outline">{snapshot?.standings.length ?? 0} players</Badge>
              </CardAction>
            </CardHeader>
            <CardPanel xstyle={styles.cardPanel}>
              {snapshot?.standings.length ? (
                <ol {...stylex.props(styles.list)}>
                  {snapshot.standings.map((standing, index) => {
                    const isViewer = Boolean(account && isAddressEqual(account, standing.address));
                    return (
                      <li {...stylex.props(styles.standingRow)} key={standing.address}>
                        <span {...stylex.props(styles.rank)}>{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <span {...stylex.props(styles.identityLine)}>
                            <bdi {...stylex.props(styles.identityAddress)}>
                              {shortAddress(standing.address)}
                            </bdi>
                            {standing.isLeader ? (
                              <Badge size="sm" variant="default">
                                Crown
                              </Badge>
                            ) : null}
                            {isViewer ? (
                              <Badge size="sm" variant="info">
                                You
                              </Badge>
                            ) : null}
                          </span>
                          <span {...stylex.props(styles.identityMeta)}>
                            {formatDuration(standing.crownSeconds)} crown time
                          </span>
                        </div>
                        <strong {...stylex.props(styles.standingReward)}>
                          {formatWeth(standing.projectedReward)}
                        </strong>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div {...stylex.props(styles.emptyState)}>
                  <TrophyIcon {...stylex.props(styles.emptyIcon)} aria-hidden="true" />
                  <p {...stylex.props(styles.emptyCopy)}>
                    {snapshotLoading ? "Loading standings…" : "The first challenger will take rank one."}
                  </p>
                </div>
              )}
            </CardPanel>
          </Card>

          <Card render={<section aria-labelledby="activity-title" />} xstyle={styles.card}>
            <CardHeader xstyle={styles.cardHeaderCompact}>
              <CardTitle>
                <h2 {...stylex.props(styles.cardHeading)} id="activity-title">
                  Arena feed
                </h2>
              </CardTitle>
              <CardDescription>Recent events from the current round.</CardDescription>
              <CardAction>
                <Badge variant={freshnessMeta.variant}>{freshnessMeta.label}</Badge>
              </CardAction>
            </CardHeader>
            <CardPanel xstyle={styles.cardPanel}>
              {snapshot?.activity.length ? (
                <ol {...stylex.props(styles.list)}>
                  {snapshot.activity.map((activity) => {
                    const time = formatActivityTime(activity);
                    return (
                      <li {...stylex.props(styles.activityRow)} key={activity.key}>
                        <span {...stylex.props(styles.activityMarker)}>{activityIcon(activity.kind)}</span>
                        <div>
                          <p {...stylex.props(styles.activityTitle)}>{activity.title}</p>
                          <span {...stylex.props(styles.activityDetail)}>{activity.detail}</span>
                        </div>
                        <time {...stylex.props(styles.activityTime)} dateTime={time.dateTime}>
                          {time.label}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div {...stylex.props(styles.emptyState)}>
                  <ActivityIcon {...stylex.props(styles.emptyIcon)} aria-hidden="true" />
                  <p {...stylex.props(styles.emptyCopy)}>
                    {snapshotLoading ? "Loading arena events…" : "The first challenge will appear here."}
                  </p>
                </div>
              )}
            </CardPanel>
          </Card>
        </div>

        <div {...stylex.props(styles.infoGrid)}>
          <details {...stylex.props(styles.disclosure)}>
            <summary {...stylex.props(styles.disclosureSummary)}>
              <span {...stylex.props(styles.disclosureTitle)}>
                <SwordsIcon {...stylex.props(styles.icon)} aria-hidden="true" />
                Game rules
              </span>
              <ChevronDownIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
            </summary>
            <div {...stylex.props(styles.disclosurePanel)}>
              <ol {...stylex.props(styles.rulesList)}>
                <li>An exact-input WETH challenge starts the round or takes the crown.</li>
                <li>The first crown window is 15 minutes. A takeover restores a 5-minute response window.</li>
                <li>The hard stop is 60 minutes. Reaching it makes the round a decision.</li>
                <li>
                  A knockout pays 40% to the champion and 50% by crown time. A decision pays 90% by crown
                  time.
                </li>
              </ol>
            </div>
          </details>

          <details {...stylex.props(styles.disclosure)}>
            <summary {...stylex.props(styles.disclosureSummary)}>
              <span {...stylex.props(styles.disclosureTitle)}>
                <ShieldCheckIcon {...stylex.props(styles.icon)} aria-hidden="true" />
                Deployment details
              </span>
              <ChevronDownIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
            </summary>
            <div {...stylex.props(styles.disclosurePanel)}>
              <dl {...stylex.props(styles.contractList)}>
                <dt {...stylex.props(styles.contractTerm)}>Network</dt>
                <dd {...stylex.props(styles.contractValue)}>
                  {deployment.network} · chain {deployment.chainId} · block {deployment.deploymentBlock}
                </dd>
                {Object.entries(deployment.contracts).map(([name, address]) => (
                  <FragmentContract key={name} name={name} address={address} />
                ))}
              </dl>
            </div>
          </details>
        </div>
      </main>

      <footer {...stylex.props(styles.shell, styles.footer)}>
        <p {...stylex.props(styles.footerCopy)}>
          Overtime is unaudited software. This interface reads and writes the configured deployment only.
        </p>
        <span {...stylex.props(styles.footerTech)}>
          <ZapIcon {...stylex.props(styles.iconSmall)} aria-hidden="true" />
          React · Wagmi · Viem · StyleX
        </span>
      </footer>
    </div>
  );
}

function FragmentContract({ address, name }: { address: Address; name: string }): ReactElement {
  return (
    <>
      <dt {...stylex.props(styles.contractTerm)}>{name.replace(/([A-Z])/g, " $1")}</dt>
      <dd {...stylex.props(styles.contractValue)}>
        <bdi>{address}</bdi>
      </dd>
    </>
  );
}
