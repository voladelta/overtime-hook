import { parseEther } from "viem";

export const MINIMUM_CHALLENGE = parseEther("0.01");

export interface ChallengeValues {
  grossWeth: bigint;
  minimumOvertime: bigint;
}

export interface ChallengeErrors {
  grossWeth?: string;
  minimumOvertime?: string;
}

export interface ChallengeParseResult {
  errors: ChallengeErrors;
  values?: ChallengeValues;
}

export function parseChallengeValues(grossInput: string, minimumInput: string): ChallengeParseResult {
  const errors: ChallengeErrors = {};
  let grossWeth: bigint | undefined;
  let minimumOvertime: bigint | undefined;

  try {
    grossWeth = parseEther(grossInput.trim());
    if (grossWeth < MINIMUM_CHALLENGE) errors.grossWeth = "Enter at least 0.01 WETH.";
  } catch {
    errors.grossWeth = "Enter a valid WETH amount.";
  }

  try {
    minimumOvertime = parseEther(minimumInput.trim() || "0");
    if (minimumOvertime < 0n) errors.minimumOvertime = "Enter zero or a positive OVERTIME amount.";
  } catch {
    errors.minimumOvertime = "Enter a valid OVERTIME amount.";
  }

  if (Object.keys(errors).length > 0 || grossWeth === undefined || minimumOvertime === undefined) {
    return { errors };
  }
  return { errors, values: { grossWeth, minimumOvertime } };
}
