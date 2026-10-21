import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native-css/components/Text";
import { View } from "react-native-css/components/View";
import { registerCSS, testID } from "react-native-css/jest";
import { setDarkScopeVariables } from "react-native-css/native";

const parentID = "parent";

beforeEach(() => {
  setDarkScopeVariables({ "--fg": "white", "--fill": "gray" });
});

afterEach(() => {
  setDarkScopeVariables({});
});

function tree(dark: boolean) {
  return (
    <View testID={parentID} className={dark ? "scope dark" : "scope"}>
      <Text testID={testID} className="label">
        Label
      </Text>
    </View>
  );
}

test("a child styled outside a dark scope restyles when an ancestor turns dark", () => {
  registerCSS(
    `:root { --fg: black; } .scope { --tw-scope: 1; } .label { color: var(--fg); }`,
    { inlineVariables: false },
  );

  render(tree(false));
  expect(screen.getByTestId(testID).props.style).toEqual({ color: "black" });

  screen.rerender(tree(true));
  expect(screen.getByTestId(testID).props.style).toEqual({ color: "white" });

  screen.rerender(tree(false));
  expect(screen.getByTestId(testID).props.style).toEqual({ color: "black" });
});

test("a child of an ancestor without its own variables restyles when the ancestor turns dark", () => {
  registerCSS(`:root { --fg: black; } .label { color: var(--fg); }`, {
    inlineVariables: false,
  });

  render(tree(false));
  expect(screen.getByTestId(testID).props.style).toEqual({ color: "black" });

  screen.rerender(tree(true));
  expect(screen.getByTestId(testID).props.style).toEqual({ color: "white" });
});

test("an opacity-modified fill restyles when an ancestor turns dark", () => {
  registerCSS(
    `:root { --fill: black; } .scope { --tw-scope: 1; } .capsule { background-color: color-mix(in srgb, var(--fill) 10%, transparent); }`,
    { inlineVariables: false },
  );

  const capsule = (dark: boolean) => (
    <View className={dark ? "scope dark" : "scope"}>
      <View testID={testID} className="capsule" />
    </View>
  );

  render(capsule(false));
  const light = screen.getByTestId(testID).props.style;

  screen.rerender(capsule(true));
  expect(screen.getByTestId(testID).props.style).not.toEqual(light);
});
