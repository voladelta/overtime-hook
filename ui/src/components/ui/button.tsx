"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type React from "react";

import { colors, fonts, motion, radii, shadows, spacing } from "../../styles/tokens.stylex";
import { Spinner } from "./spinner";

export type ButtonVariant =
  | "default"
  | "destructive"
  | "destructive-outline"
  | "ghost"
  | "link"
  | "outline"
  | "secondary";

export type ButtonSize =
  | "default"
  | "icon"
  | "icon-lg"
  | "icon-sm"
  | "icon-xl"
  | "icon-xs"
  | "lg"
  | "sm"
  | "xl"
  | "xs";

const styles = stylex.create({
  root: {
    alignItems: "center",
    borderStyle: "solid",
    borderWidth: "1px",
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: fonts.sans,
    fontSize: "14px",
    fontWeight: 650,
    gap: spacing.space2,
    justifyContent: "center",
    letterSpacing: "0.01em",
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
    textDecorationLine: "none",
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
      "@media (prefers-reduced-motion: no-preference)":
        "background-color, border-color, box-shadow, color, opacity, transform",
    },
    transitionTimingFunction: motion.easing,
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  focusGlow: {
    boxShadow: {
      default: null,
      ":focus-visible": shadows.focus,
    },
  },
  disabled: {
    backgroundColor: colors.disabledSurface,
    borderColor: colors.borderSubtle,
    boxShadow: "none",
    color: colors.disabledText,
    cursor: "not-allowed",
    pointerEvents: "none",
    transform: "none",
  },
  loading: {
    cursor: "progress",
  },
  label: {
    alignItems: "center",
    display: "inline-flex",
    gap: "inherit",
    justifyContent: "center",
    pointerEvents: "none",
  },
  labelLoading: {
    opacity: 0,
  },
  loadingIndicator: {
    insetBlockStart: "50%",
    insetInlineStart: "50%",
    pointerEvents: "none",
    position: "absolute",
    transform: "translate(-50%, -50%)",
  },
});

const variants = stylex.create({
  default: {
    backgroundColor: {
      default: colors.accentSolid,
      ":hover": {
        "@media (hover: hover)": colors.accentHover,
      },
    },
    borderColor: colors.accentSolid,
    boxShadow: shadows.accentGlow,
    color: colors.accentForeground,
  },
  destructive: {
    backgroundColor: {
      default: colors.danger,
      ":hover": {
        "@media (hover: hover)": colors.dangerHover,
      },
    },
    borderColor: colors.danger,
    boxShadow: shadows.dangerGlow,
    color: colors.dangerForeground,
  },
  destructiveOutline: {
    backgroundColor: {
      default: colors.surface,
      ":hover": {
        "@media (hover: hover)": colors.dangerSoft,
      },
    },
    borderColor: colors.danger,
    boxShadow: shadows.control,
    color: colors.danger,
  },
  ghost: {
    backgroundColor: {
      default: "transparent",
      ":hover": {
        "@media (hover: hover)": colors.surfaceHover,
      },
    },
    borderColor: "transparent",
    boxShadow: "none",
    color: colors.textPrimary,
  },
  link: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    boxShadow: "none",
    color: colors.accentText,
    textDecorationLine: {
      default: "none",
      ":hover": {
        "@media (hover: hover)": "underline",
      },
    },
    textDecorationSkipInk: "auto",
    textDecorationThickness: "from-font",
    textUnderlineOffset: "4px",
    textUnderlinePosition: "from-font",
  },
  outline: {
    backgroundColor: {
      default: colors.surface,
      ":hover": {
        "@media (hover: hover)": colors.surfaceHover,
      },
    },
    borderColor: colors.borderStrong,
    boxShadow: shadows.control,
    color: colors.textPrimary,
  },
  secondary: {
    backgroundColor: {
      default: colors.surfaceRaised,
      ":hover": {
        "@media (hover: hover)": colors.surfaceHover,
      },
    },
    borderColor: colors.borderSubtle,
    boxShadow: shadows.control,
    color: colors.textPrimary,
  },
});

const sizes = stylex.create({
  default: {
    borderRadius: radii.md,
    minBlockSize: "44px",
    paddingInline: spacing.space4,
  },
  icon: {
    blockSize: "44px",
    borderRadius: radii.md,
    inlineSize: "44px",
    paddingInline: spacing.space0,
  },
  iconLg: {
    blockSize: "48px",
    borderRadius: radii.lg,
    inlineSize: "48px",
    paddingInline: spacing.space0,
  },
  iconSm: {
    blockSize: {
      default: "36px",
      "@media (pointer: coarse)": "44px",
    },
    borderRadius: radii.md,
    inlineSize: {
      default: "36px",
      "@media (pointer: coarse)": "44px",
    },
    paddingInline: spacing.space0,
  },
  iconXl: {
    blockSize: "52px",
    borderRadius: radii.lg,
    inlineSize: "52px",
    paddingInline: spacing.space0,
  },
  iconXs: {
    blockSize: {
      default: "32px",
      "@media (pointer: coarse)": "44px",
    },
    borderRadius: radii.sm,
    inlineSize: {
      default: "32px",
      "@media (pointer: coarse)": "44px",
    },
    paddingInline: spacing.space0,
  },
  lg: {
    borderRadius: radii.lg,
    minBlockSize: "48px",
    paddingInline: spacing.space5,
  },
  sm: {
    borderRadius: radii.md,
    minBlockSize: {
      default: "36px",
      "@media (pointer: coarse)": "44px",
    },
    paddingInline: spacing.space3,
  },
  xl: {
    borderRadius: radii.lg,
    fontSize: "16px",
    minBlockSize: "52px",
    paddingInline: spacing.space6,
  },
  xs: {
    borderRadius: radii.sm,
    fontSize: "13px",
    minBlockSize: {
      default: "32px",
      "@media (pointer: coarse)": "44px",
    },
    paddingInline: "10px",
  },
});

const variantStyles = {
  default: variants.default,
  destructive: variants.destructive,
  "destructive-outline": variants.destructiveOutline,
  ghost: variants.ghost,
  link: variants.link,
  outline: variants.outline,
  secondary: variants.secondary,
} as const;

const sizeStyles = {
  default: sizes.default,
  icon: sizes.icon,
  "icon-lg": sizes.iconLg,
  "icon-sm": sizes.iconSm,
  "icon-xl": sizes.iconXl,
  "icon-xs": sizes.iconXs,
  lg: sizes.lg,
  sm: sizes.sm,
  xl: sizes.xl,
  xs: sizes.xs,
} as const;

export interface ButtonProps extends Omit<useRender.ComponentProps<"button">, "className" | "style"> {
  loading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
  xstyle?: StyleXStyles;
}

export function Button({
  children,
  disabled: disabledProp,
  loading = false,
  render,
  size = "default",
  type,
  variant = "default",
  xstyle,
  ...props
}: ButtonProps): React.ReactElement {
  const isDisabled = Boolean(disabledProp || loading);
  const defaultProps = {
    ...stylex.props(
      styles.root,
      styles.focusGlow,
      variantStyles[variant],
      sizeStyles[size],
      isDisabled && styles.disabled,
      loading && styles.loading,
      xstyle,
    ),
    "aria-busy": loading || undefined,
    "aria-disabled": isDisabled || undefined,
    children: (
      <>
        <span {...stylex.props(styles.label, loading && styles.labelLoading)} data-slot="button-label">
          {children}
        </span>
        {loading ? (
          <span {...stylex.props(styles.loadingIndicator)} data-slot="button-loading-indicator">
            <Spinner aria-hidden="true" />
          </span>
        ) : null}
      </>
    ),
    "data-loading": loading ? "" : undefined,
    "data-slot": "button",
    disabled: isDisabled,
    type: render ? undefined : (type ?? "button"),
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}
