"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type React from "react";

import { colors, fonts, motion, radii, shadows, spacing } from "../../styles/tokens.stylex";

export type InputSize = "sm" | "default" | "lg" | number;
export type InputType = NonNullable<React.InputHTMLAttributes<HTMLInputElement>["type"]>;

export type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  "className" | "size" | "style" | "type"
> & {
  nativeInput?: boolean;
  size?: InputSize;
  type: InputType;
  unstyled?: boolean;
  xstyle?: StyleXStyles;
};

const styles = stylex.create({
  control: {
    alignItems: "center",
    display: "inline-flex",
    inlineSize: "100%",
    minInlineSize: 0,
    position: "relative",
  },
  controlStyled: {
    backgroundColor: {
      default: colors.surfaceSunken,
      ":has(:disabled)": colors.disabledSurface,
    },
    borderColor: {
      default: colors.borderSubtle,
      ":hover": {
        "@media (hover: hover)": colors.borderStrong,
      },
      ':has([aria-invalid="true"])': colors.danger,
    },
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: {
      default: shadows.control,
      ":focus-within": shadows.focus,
      ":has(:disabled)": "none",
    },
    outlineColor: {
      default: "transparent",
      ":focus-within": colors.focus,
      "@media (forced-colors: active)": "CanvasText",
    },
    outlineOffset: "2px",
    outlineStyle: "solid",
    outlineWidth: {
      default: "0px",
      ":focus-within": "2px",
    },
    transitionDuration: {
      default: motion.instant,
      "@media (prefers-reduced-motion: no-preference)": motion.fast,
    },
    transitionProperty: {
      default: "none",
      "@media (prefers-reduced-motion: no-preference)": "background-color, border-color, box-shadow",
    },
    transitionTimingFunction: motion.easing,
  },
  input: {
    appearance: "none",
    backgroundColor: "transparent",
    blockSize: "100%",
    borderStyle: "none",
    color: {
      default: colors.textPrimary,
      ":disabled": colors.disabledText,
    },
    cursor: {
      default: "text",
      ":disabled": "not-allowed",
    },
    fontFamily: fonts.sans,
    fontSize: {
      default: "16px",
      "@media (min-width: 640px)": "14px",
    },
    inlineSize: "100%",
    lineHeight: 1.4,
    minBlockSize: "inherit",
    minInlineSize: 0,
    outlineStyle: "none",
    paddingBlock: spacing.space0,
    paddingInline: spacing.space3,
  },
  inputSm: {
    paddingInline: "10px",
  },
  inputLg: {
    paddingInline: spacing.space4,
  },
  controlDefault: {
    minBlockSize: "44px",
  },
  controlSm: {
    minBlockSize: {
      default: "36px",
      "@media (pointer: coarse)": "44px",
    },
  },
  controlLg: {
    minBlockSize: "48px",
  },
  search: {
    "::-webkit-search-cancel-button": {
      appearance: "none",
    },
    "::-webkit-search-decoration": {
      appearance: "none",
    },
    "::-webkit-search-results-button": {
      appearance: "none",
    },
    "::-webkit-search-results-decoration": {
      appearance: "none",
    },
  },
  file: {
    color: colors.textMuted,
    "::file-selector-button": {
      backgroundColor: "transparent",
      borderStyle: "none",
      color: colors.textPrimary,
      cursor: "pointer",
      fontFamily: fonts.sans,
      fontSize: "14px",
      fontWeight: 650,
      marginInlineEnd: spacing.space3,
      padding: spacing.space0,
    },
  },
  placeholder: {
    "::placeholder": {
      color: colors.textMuted,
      opacity: 1,
    },
  },
});

function controlSizeStyle(size: InputSize): StyleXStyles {
  if (size === "sm") {
    return styles.controlSm;
  }

  if (size === "lg") {
    return styles.controlLg;
  }

  return styles.controlDefault;
}

function inputSizeStyle(size: InputSize): StyleXStyles | undefined {
  if (size === "sm") {
    return styles.inputSm;
  }

  if (size === "lg") {
    return styles.inputLg;
  }

  return undefined;
}

export function Input({
  nativeInput = false,
  size = "default",
  type,
  unstyled = false,
  xstyle,
  ...props
}: InputProps): React.ReactElement {
  const inputStyles = stylex.props(
    styles.input,
    styles.placeholder,
    inputSizeStyle(size),
    type === "search" && styles.search,
    type === "file" && styles.file,
  );
  const inputProps = {
    ...inputStyles,
    ...props,
    "data-slot": "input",
    size: typeof size === "number" ? size : undefined,
    type,
  };

  return (
    <span
      {...stylex.props(styles.control, !unstyled && styles.controlStyled, controlSizeStyle(size), xstyle)}
      data-size={size}
      data-slot="input-control"
    >
      {nativeInput ? <input {...inputProps} /> : <InputPrimitive {...inputProps} />}
    </span>
  );
}

export { InputPrimitive };
