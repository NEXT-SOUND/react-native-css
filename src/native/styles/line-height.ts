import type { StyleFunctionResolver } from "./resolve";

const UNITLESS_LINE_HEIGHT_MAX = 4;

export const lineHeight: StyleFunctionResolver = (resolve, func) => {
  const value = resolve(func[2]);

  if (typeof value !== "number") {
    return;
  }

  // A length that reached here through a variable (Tailwind's `--tw-leading` for `leading-5`) has lost its unit and
  // is already in pixels; only a unitless line height (a small multiplier) scales with the font size.
  if (value > UNITLESS_LINE_HEIGHT_MAX) {
    return value;
  }

  let emValue = resolve([{}, "var", ["__rn-css-em"]]);

  if (typeof emValue !== "number") {
    emValue = resolve([{}, "var", ["__rn-css-rem"]]);
  }

  if (typeof emValue !== "number") {
    return;
  }

  return round(value * emValue);
};

function round(number: number) {
  return Math.round((number + Number.EPSILON) * 100) / 100;
}
