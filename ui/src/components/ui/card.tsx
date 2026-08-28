"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type React from "react";

import { colors, fonts, radii, shadows, spacing } from "../../styles/tokens.stylex";

type CardPartProps = Omit<useRender.ComponentProps<"div">, "className" | "style"> & {
  xstyle?: StyleXStyles;
};

const styles = stylex.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: radii.xl,
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: shadows.card,
    color: colors.textPrimary,
    display: "flex",
    flexDirection: "column",
    minInlineSize: 0,
    position: "relative",
  },
  header: {
    alignItems: "start",
    borderBlockEndColor: colors.borderSubtle,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: "1px",
    columnGap: spacing.space4,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gridTemplateRows: "auto auto",
    paddingBlock: spacing.space5,
    paddingInline: spacing.space6,
    rowGap: spacing.space2,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: "18px",
    fontWeight: 700,
    gridColumn: "1",
    letterSpacing: "-0.015em",
    lineHeight: 1.1,
    overflowWrap: "break-word",
    textWrap: "balance",
  },
  description: {
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    fontSize: "14px",
    gridColumn: "1",
    lineHeight: 1.5,
    overflowWrap: "break-word",
    textWrap: "pretty",
  },
  action: {
    alignItems: "center",
    alignSelf: "center",
    display: "inline-flex",
    gap: spacing.space2,
    gridColumn: "2",
    gridRow: "1 / span 2",
    justifySelf: "end",
  },
  panel: {
    flex: "1 1 auto",
    minInlineSize: 0,
    paddingBlock: spacing.space6,
    paddingInline: spacing.space6,
  },
  footer: {
    alignItems: "center",
    borderBlockStartColor: colors.borderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: "1px",
    display: "flex",
    flexWrap: "wrap",
    gap: spacing.space3,
    paddingBlock: spacing.space4,
    paddingInline: spacing.space6,
  },
});

export type CardProps = CardPartProps;

export function Card({ render, xstyle, ...props }: CardProps): React.ReactElement {
  const defaultProps = {
    ...stylex.props(styles.card, xstyle),
    "data-slot": "card",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export type CardHeaderProps = CardPartProps;

export function CardHeader({ render, xstyle, ...props }: CardHeaderProps): React.ReactElement {
  const defaultProps = {
    ...stylex.props(styles.header, xstyle),
    "data-slot": "card-header",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export type CardTitleProps = CardPartProps;

export function CardTitle({ render, xstyle, ...props }: CardTitleProps): React.ReactElement {
  const defaultProps = {
    ...stylex.props(styles.title, xstyle),
    "data-slot": "card-title",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export type CardDescriptionProps = CardPartProps;

export function CardDescription({ render, xstyle, ...props }: CardDescriptionProps): React.ReactElement {
  const defaultProps = {
    ...stylex.props(styles.description, xstyle),
    "data-slot": "card-description",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export type CardActionProps = CardPartProps;

export function CardAction({ render, xstyle, ...props }: CardActionProps): React.ReactElement {
  const defaultProps = {
    ...stylex.props(styles.action, xstyle),
    "data-slot": "card-action",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export type CardPanelProps = CardPartProps;

export function CardPanel({ render, xstyle, ...props }: CardPanelProps): React.ReactElement {
  const defaultProps = {
    ...stylex.props(styles.panel, xstyle),
    "data-slot": "card-panel",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export const CardContent = CardPanel;

export type CardFooterProps = CardPartProps;

export function CardFooter({ render, xstyle, ...props }: CardFooterProps): React.ReactElement {
  const defaultProps = {
    ...stylex.props(styles.footer, xstyle),
    "data-slot": "card-footer",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}
