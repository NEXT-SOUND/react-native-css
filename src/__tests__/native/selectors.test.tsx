import { act, render, screen } from "@testing-library/react-native";
import { View } from "react-native-css/components/View";
import { registerCSS, testID } from "react-native-css/jest";
import { colorScheme } from "react-native-css/runtime";

test("legacy class dark mode configuration is rejected with a migration path", () => {
  expect(() =>
    registerCSS(
      `@cssInterop set darkMode class dark; .my-class:is(.dark *) { color: red; }`,
    ),
  ).toThrow(/prefers-color-scheme/);
});

test.each([
  ':root[class="dark"]',
  ':root[class~="dark"]',
  ".dark:root",
  ":root:not(.dark) .dark",
])(
  "class-qualified root %s is dropped, never made unconditional",
  (selector) => {
    registerCSS(
      `:root { --my-var: blue; } ${selector} { --my-var: red; } .my-class { color: var(--my-var); }`,
    );
    render(<View testID={testID} className="my-class" />);
    expect(screen.getByTestId(testID).props.style).toEqual({ color: "#00f" });
  },
);

test("a class-qualified root keeps the other selectors in its list", () => {
  registerCSS(`.dark:root, .my-class { color: red; }`);
  render(<View testID={testID} className="my-class" />);
  expect(screen.getByTestId(testID).props.style).toEqual({ color: "#f00" });
});

test("explicit ancestor selector follows its actual class and restores when removed", () => {
  registerCSS(
    `.my-class { color: blue; } .my-class:is(.dark *) { color: red; }`,
  );
  const tree = (className: string) => (
    <View className={`will-change-container ${className}`}>
      <View testID={testID} className="my-class" />
    </View>
  );
  render(tree(""));
  expect(screen.getByTestId(testID).props.style).toEqual({ color: "#00f" });
  screen.rerender(tree("dark"));
  expect(screen.getByTestId(testID).props.style).toEqual({ color: "#f00" });
  screen.rerender(tree(""));
  expect(screen.getByTestId(testID).props.style).toEqual({ color: "#00f" });
});

test.each([undefined, false] as const)(
  "root variables track system dark mode with inlineVariables=%s",
  (inlineVariables) => {
    registerCSS(
      `:root { --my-var: blue; } @media (prefers-color-scheme: dark) { :root { --my-var: red; } } .my-class { color: var(--my-var); }`,
      { inlineVariables },
    );
    act(() => {
      colorScheme.set("light");
    });
    render(<View testID={testID} className="my-class" />);
    expect(screen.getByTestId(testID).props.style).toEqual({ color: "blue" });
    act(() => {
      colorScheme.set("dark");
    });
    expect(screen.getByTestId(testID).props.style).toEqual({ color: "red" });
    act(() => {
      colorScheme.set("light");
    });
    expect(screen.getByTestId(testID).props.style).toEqual({ color: "blue" });
  },
);

test("legacy inline compiler options are rejected with their supported replacement", () => {
  expect(() =>
    registerCSS(
      `@react-native config { preserve-variables: --green; } .test { --green: green; }`,
    ),
  ).toThrow(/inlineVariables/);
});
