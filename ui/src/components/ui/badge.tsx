"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type React from "react";

import { colors, fonts, motion, radii, shadows, spacing } from "../../styles/tokens.stylex";

export type BadgeVariant =
  | "default"
  | "destructive"
  | "error"
  | "info"
  | "outline"
  | "secondary"
  | "success"
  | "warning";

export type BadgeSize = "default" | "sm" | "lg";

const styles = stylex.create({
  root: {
    alignItems: "center",
    borderStyle: "solid",
    borderWidth: "1px",
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: fonts.sans,
    fontWeight: 650,
    gap: spacing.space1,
    justifyContent: "center",
    letterSpacing: "0.025em",
    lineHeight: 1,
    outlineColor: {
      default: "transparent",
      ":focus-visible": colors.focus,
      "@media (forced-colors: active)": "CanvasText",
    },
    outlineOffset: "2px",
    outlineStyle: "solid",
    outlineWidth: {
      default: "0px",
      ":focus-visible": "2px",
    },
    position: "relative",
    whiteSpace: "nowrap",
  },
  interactive: {
    cursor: "pointer",
    filter: {
      default: "brightness(1)",
      ":hover": {
        "@media (hover: hover)": "brightness(1.08)",
      },
    },
    touchAction: "manipulation",
    transform: {
      default: "scale(1)",
      ":active": {
        "@media (prefers-reduced-motion: no-preference)": "scale(0.96)",
      },
    },
    transitionDuration: {
      default: motion.instant,
      "@media (prefers-reduced-motion: no-preference)": motion.fast,
    },
    transitionProperty: {
      default: "none",
      "@media (prefers-reduced-motion: no-preference)": "filter, transform",
    },
    transitionTimingFunction: motion.easing,
  },
  focusGlow: {
    boxShadow: {
      default: null,
      ":focus-visible": shadows.focus,
    },
  },
});

const variants = stylex.create({
  default: {
    backgroundColor: colors.accentSolid,
    borderColor: colors.accentSolid,
    color: colors.accentForeground,
  },
  destructive: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
    color: colors.dangerForeground,
  },
  error: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    color: colors.danger,
  },
  info: {
    backgroundColor: colors.infoSoft,
    borderColor: colors.info,
    color: colors.info,
  },
  outline: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.borderStrong,
    color: colors.textPrimary,
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderSubtle,
    color: colors.textSecondary,
  },
  success: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
    color: colors.success,
  },
  warning: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
    color: colors.warning,
  },
});

const sizes = stylex.create({
  default: {
    borderRadius: radii.sm,
    fontSize: "12px",
    minBlockSize: "24px",
    minInlineSize: "24px",
    paddingInline: spacing.space2,
  },
  sm: {
    borderRadius: radii.sm,
    fontSize: "11px",
    minBlockSize: "20px",
    minInlineSize: "20px",
    paddingInline: "6px",
  },
  lg: {
    borderRadius: radii.md,
    fontSize: "13px",
    minBlockSize: "28px",
    minInlineSize: "28px",
    paddingInline: "10px",
  },
  interactiveTarget: {
    minBlockSize: {
      default: null,
      "@media (pointer: coarse)": "44px",
    },
    minInlineSize: {
      default: null,
      "@media (pointer: coarse)": "44px",
    },
  },
});

const variantStyles = {
  default: variants.default,
  destructive: variants.destructive,
  error: variants.error,
  info: variants.info,
  outline: variants.outline,
  secondary: variants.secondary,
  success: variants.success,
  warning: variants.warning,
} as const;

const sizeStyles = {
  default: sizes.default,
  lg: sizes.lg,
  sm: sizes.sm,
} as const;

export interface BadgeProps extends Omit<useRender.ComponentProps<"span">, "className" | "style"> {
  size?: BadgeSize;
  variant?: BadgeVariant;
  xstyle?: StyleXStyles;
}

export function Badge({
  render,
  size = "default",
  variant = "default",
  xstyle,
  ...props
}: BadgeProps): React.ReactElement {
  const isInteractive = render != null;
  const defaultProps = {
    ...stylex.props(
      styles.root,
      styles.focusGlow,
      variantStyles[variant],
      sizeStyles[size],
      isInteractive && styles.interactive,
      isInteractive && sizes.interactiveTarget,
      xstyle,
    ),
    "data-slot": "badge",
  };

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(defaultProps, props),
    render,
  });
}
