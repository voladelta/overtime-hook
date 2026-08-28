import { expect, test } from "bun:test";

import { invalidateGameQueries } from "../src/use-game-data.js";

test("a new block invalidates both authoritative game queries", async () => {
  const invalidated: string[][] = [];

  await invalidateGameQueries({
    async invalidateQueries(filters) {
      invalidated.push([...filters.queryKey]);
    },
  });

  expect(invalidated).toEqual([
    ["overtime", "snapshot"],
    ["overtime", "quote"],
  ]);
});
