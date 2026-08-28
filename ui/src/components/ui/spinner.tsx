import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { Loader2Icon } from "lucide-react";
import type React from "react";

import { motion } from "../../styles/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

const styles = stylex.create({
  root: {
    animationDuration: {
      default: motion.instant,
      "@media (prefers-reduced-motion: no-preference)": "640ms",
    },
    animationIterationCount: {
      default: "1",
      "@media (prefers-reduced-motion: no-preference)": "infinite",
    },
    animationName: {
      default: "none",
      "@media (prefers-reduced-motion: no-preference)": spin,
    },
    animationTimingFunction: "linear",
    blockSize: "18px",
    flexShrink: 0,
    inlineSize: "18px",
  },
});

export interface SpinnerProps extends Omit<React.ComponentProps<typeof Loader2Icon>, "className" | "style"> {
  xstyle?: StyleXStyles;
}

export function Spinner({
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  role,
  xstyle,
  ...props
}: SpinnerProps): React.ReactElement {
  const isDecorative = ariaHidden === true || ariaHidden === "true";

  return (
    <Loader2Icon
      {...stylex.props(styles.root, xstyle)}
      {...props}
      aria-hidden={ariaHidden}
      aria-label={isDecorative ? undefined : (ariaLabel ?? "Loading")}
      data-slot="spinner"
      role={isDecorative ? undefined : (role ?? "status")}
    />
  );
}
