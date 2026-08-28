import * as stylex from "@stylexjs/stylex";
import { RadioTower, RefreshCw, TriangleAlert } from "lucide-react";

import { colors, fonts, radii, shadows, spacing } from "../styles/tokens.stylex";
import { Button } from "./ui/button";
import { Card, CardFooter, CardPanel } from "./ui/card";
import { Spinner } from "./ui/spinner";

const styles = stylex.create({
  page: {
    alignItems: "center",
    backgroundColor: colors.pageBg,
    color: colors.textPrimary,
    display: "grid",
    fontFamily: fonts.sans,
    minBlockSize: "100vh",
    overflow: "hidden",
    paddingBlock: spacing.space8,
    paddingInline: spacing.space4,
    placeItems: "center",
    position: "relative",
  },
  glow: {
    backgroundColor: colors.accentSoft,
    blockSize: "28rem",
    borderRadius: radii.pill,
    filter: "blur(100px)",
    inlineSize: "28rem",
    insetBlockStart: "50%",
    insetInlineStart: "50%",
    opacity: 0.55,
    pointerEvents: "none",
    position: "absolute",
    transform: "translate(-50%, -50%)",
  },
  card: {
    inlineSize: "min(100%, 34rem)",
    overflow: "hidden",
    zIndex: 1,
  },
  panel: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: spacing.space5,
    paddingBlock: spacing.space10,
    textAlign: "center",
  },
  signal: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    blockSize: "4rem",
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: shadows.accentGlow,
    color: colors.accentText,
    display: "grid",
    inlineSize: "4rem",
    placeItems: "center",
  },
  signalError: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    boxShadow: shadows.dangerGlow,
    color: colors.danger,
  },
  icon: {
    blockSize: "1.65rem",
    inlineSize: "1.65rem",
    strokeWidth: 1.8,
  },
  spinner: {
    blockSize: "1.5rem",
    inlineSize: "1.5rem",
  },
  eyebrow: {
    color: colors.accentText,
    fontFamily: fonts.mono,
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.18em",
    marginBlock: 0,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: "clamp(2rem, 10vw, 3.2rem)",
    fontWeight: 800,
    letterSpacing: "-0.045em",
    lineHeight: 0.95,
    marginBlock: 0,
    textWrap: "balance",
  },
  copy: {
    color: colors.textSecondary,
    fontSize: "0.95rem",
    lineHeight: 1.65,
    marginBlock: 0,
    maxInlineSize: "28rem",
    textWrap: "pretty",
  },
  footer: {
    justifyContent: "center",
  },
});

export interface BootScreenProps {
  error?: string;
}

export function BootScreen({ error }: BootScreenProps): React.ReactElement {
  const failed = error !== undefined;
  return (
    <main {...stylex.props(styles.page)}>
      <span {...stylex.props(styles.glow)} aria-hidden="true" />
      <Card xstyle={styles.card}>
        <CardPanel xstyle={styles.panel}>
          <span {...stylex.props(styles.signal, failed && styles.signalError)} aria-hidden="true">
            {failed ? (
              <TriangleAlert {...stylex.props(styles.icon)} />
            ) : (
              <RadioTower {...stylex.props(styles.icon)} />
            )}
          </span>
          <p {...stylex.props(styles.eyebrow)}>{failed ? "Link interrupted" : "Opening arena"}</p>
          <h1 {...stylex.props(styles.title)}>{failed ? "Signal lost" : "Overtime"}</h1>
          <p {...stylex.props(styles.copy)} role={failed ? "alert" : undefined}>
            {failed
              ? `${error} Start the local Overtime devnet, then retry the connection.`
              : "Loading the deployment manifest and synchronizing the live crown state."}
          </p>
          {!failed ? <Spinner aria-label="Synchronizing Overtime" xstyle={styles.spinner} /> : null}
        </CardPanel>
        {failed ? (
          <CardFooter xstyle={styles.footer}>
            <Button type="button" size="lg" onClick={() => window.location.reload()}>
              <RefreshCw {...stylex.props(styles.icon)} aria-hidden="true" />
              Retry connection
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </main>
  );
}
