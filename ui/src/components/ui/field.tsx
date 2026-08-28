"use client";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type React from "react";

import { colors, fonts, spacing } from "../../styles/tokens.stylex";

type StyleablePrimitiveProps<Props> = Omit<Props, "className" | "style"> & {
  xstyle?: StyleXStyles;
};

const styles = stylex.create({
  root: {
    alignItems: "stretch",
    display: "flex",
    flexDirection: "column",
    gap: spacing.space2,
    inlineSize: "100%",
    minInlineSize: 0,
  },
  label: {
    alignItems: "center",
    color: colors.textPrimary,
    display: "inline-flex",
    fontFamily: fonts.sans,
    fontSize: "14px",
    fontWeight: 650,
    gap: spacing.space2,
    lineHeight: 1.3,
    opacity: {
      default: 1,
      ":is([data-disabled])": 0.64,
    },
  },
  item: {
    alignItems: "center",
    display: "flex",
    gap: spacing.space2,
    minInlineSize: 0,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    fontSize: "13px",
    lineHeight: 1.45,
    overflowWrap: "break-word",
    textWrap: "pretty",
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.sans,
    fontSize: "13px",
    fontWeight: 550,
    lineHeight: 1.45,
    overflowWrap: "break-word",
    textWrap: "pretty",
  },
});

export type FieldProps = StyleablePrimitiveProps<FieldPrimitive.Root.Props>;

export function Field({ xstyle, ...props }: FieldProps): React.ReactElement {
  return <FieldPrimitive.Root {...props} {...stylex.props(styles.root, xstyle)} data-slot="field" />;
}

export type FieldLabelProps = StyleablePrimitiveProps<FieldPrimitive.Label.Props>;

export function FieldLabel({ xstyle, ...props }: FieldLabelProps): React.ReactElement {
  return <FieldPrimitive.Label {...props} {...stylex.props(styles.label, xstyle)} data-slot="field-label" />;
}

export type FieldItemProps = StyleablePrimitiveProps<FieldPrimitive.Item.Props>;

export function FieldItem({ xstyle, ...props }: FieldItemProps): React.ReactElement {
  return <FieldPrimitive.Item {...props} {...stylex.props(styles.item, xstyle)} data-slot="field-item" />;
}

export type FieldDescriptionProps = StyleablePrimitiveProps<FieldPrimitive.Description.Props>;

export function FieldDescription({ xstyle, ...props }: FieldDescriptionProps): React.ReactElement {
  return (
    <FieldPrimitive.Description
      {...props}
      {...stylex.props(styles.description, xstyle)}
      data-slot="field-description"
    />
  );
}

export type FieldErrorProps = StyleablePrimitiveProps<FieldPrimitive.Error.Props>;

export function FieldError({ xstyle, ...props }: FieldErrorProps): React.ReactElement {
  return <FieldPrimitive.Error {...props} {...stylex.props(styles.error, xstyle)} data-slot="field-error" />;
}

export const FieldControl: typeof FieldPrimitive.Control = FieldPrimitive.Control;
export const FieldValidity: typeof FieldPrimitive.Validity = FieldPrimitive.Validity;

export { FieldPrimitive };
