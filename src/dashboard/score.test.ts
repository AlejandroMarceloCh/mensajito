import { expect, test } from "bun:test";
import { scoreVisual } from "./score";

test("traffic light uses the same 1–5 thresholds everywhere", () => {
  expect([1,2,3,4,5].map(n => scoreVisual(n).tone)).toEqual(["low","low","medium","high","high"]);
  for (const missing of [null, undefined, 0, -1, 6, 2.5, NaN]) expect(scoreVisual(missing)).toEqual({ tone:"none", label:"Sin evaluar" });
});
