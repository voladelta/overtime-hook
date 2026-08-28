import * as stylex from "@stylexjs/stylex";

export const colors = stylex.defineVars({
  pageBg: "oklch(0.115 0.025 270)",
  surface: "oklch(0.16 0.03 265)",
  surfaceRaised: "oklch(0.2 0.04 260)",
  surfaceSunken: "oklch(0.13 0.026 267)",
  surfaceHover: "oklch(0.245 0.055 250)",
  textPrimary: "oklch(0.95 0.025 210)",
  textSecondary: "oklch(0.76 0.045 230)",
  textMuted: "oklch(0.64 0.04 240)",
  accentSolid: "oklch(0.82 0.13 195)",
  accentHover: "oklch(0.88 0.14 195)",
  accentSoft: "oklch(0.25 0.04 205)",
  accentText: "oklch(0.86 0.14 195)",
  accentForeground: "oklch(0.14 0.025 260)",
  crown: "oklch(0.82 0.16 330)",
  crownSoft: "oklch(0.25 0.08 330)",
  info: "oklch(0.82 0.09 285)",
  infoSoft: "oklch(0.23 0.065 285)",
  success: "oklch(0.82 0.17 150)",
  successSoft: "oklch(0.22 0.055 150)",
  warning: "oklch(0.88 0.125 85)",
  warningSoft: "oklch(0.25 0.05 85)",
  danger: "oklch(0.72 0.17 22)",
  dangerHover: "oklch(0.78 0.12 22)",
  dangerSoft: "oklch(0.24 0.08 22)",
  dangerForeground: "oklch(0.14 0.025 260)",
  borderSubtle: "oklch(0.32 0.045 250)",
  borderStrong: "oklch(0.5 0.085 215)",
  focus: "oklch(0.86 0.14 195)",
  disabledSurface: "oklch(0.19 0.025 260)",
  disabledText: "oklch(0.6 0.03 245)",
});

export const fonts = stylex.defineVars({
  sans: "var(--font-sans, Inter, ui-sans-serif, system-ui, sans-serif)",
  heading: "var(--font-heading, var(--font-sans, Inter, ui-sans-serif, system-ui, sans-serif))",
  mono: 'var(--font-mono, "SFMono-Regular", Consolas, "Liberation Mono", monospace)',
});

export const radii = stylex.defineVars({
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "18px",
  pill: "999px",
});

export const shadows = stylex.defineVars({
  card: "0 0 0 1px oklch(0.82 0.13 195 / 0.08), 0 18px 50px oklch(0.04 0.02 270 / 0.72), 0 0 28px oklch(0.82 0.13 195 / 0.06)",
  cardHover:
    "0 0 0 1px oklch(0.82 0.13 195 / 0.18), 0 22px 56px oklch(0.04 0.02 270 / 0.78), 0 0 34px oklch(0.82 0.13 195 / 0.12)",
  control: "inset 0 1px 0 oklch(1 0 0 / 0.04), 0 8px 22px oklch(0.04 0.02 270 / 0.32)",
  focus: "0 0 0 3px oklch(0.86 0.14 195 / 0.24), 0 0 24px oklch(0.86 0.14 195 / 0.16)",
  accentGlow: "0 8px 30px oklch(0.82 0.13 195 / 0.24), inset 0 1px 0 oklch(1 0 0 / 0.24)",
  dangerGlow: "0 8px 30px oklch(0.72 0.17 22 / 0.2), inset 0 1px 0 oklch(1 0 0 / 0.18)",
});

export const spacing = stylex.defineVars({
  space0: "0px",
  space1: "4px",
  space2: "8px",
  space3: "12px",
  space4: "16px",
  space5: "20px",
  space6: "24px",
  space8: "32px",
  space10: "40px",
  space12: "48px",
});

export const motion = stylex.defineVars({
  instant: "0ms",
  fast: "120ms",
  normal: "180ms",
  slow: "320ms",
  easing: "cubic-bezier(0.2, 0, 0, 1)",
});
