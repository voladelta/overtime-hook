"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type React from "react";

import { colors, fonts, motion, radii, shadows, spacing } from "../../styles/tokens.stylex";

type StyleablePrimitiveProps<Props> = Omit<Props, "className" | "style"> & {
  xstyle?: StyleXStyles;
};

const scan = stylex.keyframes({
  from: { transform: "translateX(-110%)" },
  to: { transform: "translateX(240%)" },
});

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: spacing.space2,
    inlineSize: "100%",
    minInlineSize: 0,
  },
  label: {
    color: colors.textPrimary,
    fontFamily: fonts.sans,
    fontSize: "14px",
    fontWeight: 650,
    lineHeight: 1.3,
  },
  track: {
    backgroundColor: colors.surfaceSunken,
    blockSize: "8px",
    borderColor: colors.borderSubtle,
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: shadows.control,
    display: "block",
    inlineSize: "100%",
    overflow: "hidden",
  },
  indicator: {
    backgroundColor: {
      default: colors.accentSolid,
      ":is([data-complete])": colors.success,
    },
    blockSize: "100%",
    borderRadius: radii.pill,
    boxShadow: shadows.accentGlow,
    inlineSize: {
      default: null,
      ":is([data-indeterminate])": "45%",
    },
    transitionDuration: {
      default: motion.instant,
      "@media (prefers-reduced-motion: no-preference)": motion.slow,
    },
    transitionProperty: {
      default: "none",
      "@media (prefers-reduced-motion: no-preference)": "width",
    },
    transitionTimingFunction: motion.easing,
  },
  indicatorIndeterminate: {
    animationDuration: {
      default: motion.instant,
      ":is([data-indeterminate])": {
        "@media (prefers-reduced-motion: no-preference)": "1100ms",
      },
    },
    animationIterationCount: {
      default: "1",
      ":is([data-indeterminate])": {
        "@media (prefers-reduced-motion: no-preference)": "infinite",
      },
    },
    animationName: {
      default: "none",
      ":is([data-indeterminate])": {
        "@media (prefers-reduced-motion: no-preference)": scan,
      },
    },
    animationTimingFunction: motion.easing,
  },
  value: {
    color: colors.accentText,
    fontFamily: fonts.mono,
    fontSize: "13px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 650,
    lineHeight: 1.3,
  },
});

export type ProgressProps = StyleablePrimitiveProps<ProgressPrimitive.Root.Props>;

export function Progress({ children, xstyle, ...props }: ProgressProps): React.ReactElement {
  return (
    <ProgressPrimitive.Root {...props} {...stylex.props(styles.root, xstyle)} data-slot="progress">
      {children ?? (
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      )}
    </ProgressPrimitive.Root>
  );
}

export type ProgressLabelProps = StyleablePrimitiveProps<ProgressPrimitive.Label.Props>;

export function ProgressLabel({ xstyle, ...props }: ProgressLabelProps): React.ReactElement {
  return (
    <ProgressPrimitive.Label {...props} {...stylex.props(styles.label, xstyle)} data-slot="progress-label" />
  );
}

export type ProgressTrackProps = StyleablePrimitiveProps<ProgressPrimitive.Track.Props>;

export function ProgressTrack({ xstyle, ...props }: ProgressTrackProps): React.ReactElement {
  return (
    <ProgressPrimitive.Track {...props} {...stylex.props(styles.track, xstyle)} data-slot="progress-track" />
  );
}

export type ProgressIndicatorProps = StyleablePrimitiveProps<ProgressPrimitive.Indicator.Props>;

export function ProgressIndicator({ xstyle, ...props }: ProgressIndicatorProps): React.ReactElement {
  return (
    <ProgressPrimitive.Indicator
      {...props}
      {...stylex.props(styles.indicator, styles.indicatorIndeterminate, xstyle)}
      data-slot="progress-indicator"
    />
  );
}

export type ProgressValueProps = StyleablePrimitiveProps<ProgressPrimitive.Value.Props>;

export function ProgressValue({ xstyle, ...props }: ProgressValueProps): React.ReactElement {
  return (
    <ProgressPrimitive.Value {...props} {...stylex.props(styles.value, xstyle)} data-slot="progress-value" />
  );
}

export { ProgressPrimitive };
