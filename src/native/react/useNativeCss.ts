/* eslint-disable */
import {
  createElement,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { VariableContext } from "react-native-css/native-internal";

import type { StyledConfiguration } from "../../runtime.types";
import { testGuards, type RenderGuard } from "../conditions/guards";
import {
  cleanupEffect,
  ContainerContext,
  type ContainerContextValue,
  type Effect,
  type Getter,
  type VariableContextValue,
} from "../reactivity";
import { animatedComponentFamily } from "../reanimated";
import { getStyledProps, stylesFamily } from "../styles";
import { layoutGrid } from "./grid";
import { updateRules } from "./rules";

/**
 * Variables a `dark` class token applies to its element and everything under it, like the CSS `.dark`
 * scope (`.dark:root` otherwise compiles to the app-wide color scheme only). Registered by the app.
 */
// Kept on the global object, so every loaded copy of this module (ESM and CommonJS builds) shares it.
const DARK_SCOPE_KEY = "__reactNativeCssDarkScopeVariables";
const scopeRegistry = globalThis as unknown as Record<
  string,
  Record<string, unknown> | undefined
>;
export function setDarkScopeVariables(variables: Record<string, unknown>) {
  // CSS names (`--ds-background`); variables are stored without the leading dashes.
  scopeRegistry[DARK_SCOPE_KEY] = Object.fromEntries(
    Object.entries(variables).map(([name, value]) => [
      name.replace(/^--/, ""),
      value,
    ]),
  );
}
const DARK_SCOPE_TOKEN = /(^|\s)dark(\s|$)/;
const isDarkScope = (props: Record<string, any> | undefined | null) =>
  scopeRegistry[DARK_SCOPE_KEY] !== undefined &&
  typeof props?.className === "string" &&
  DARK_SCOPE_TOKEN.test(props.className);

export type Config = {
  source: string;
  target: string[] | string | false;
  nativeStyleMapping?: Record<string, string>;
};

export type ComponentState = {
  /** The source/target for classNames */
  configs: Config[];

  /** Reactive tracking */
  ruleEffect: Effect;
  ruleEffectGetter: Getter;
  styleEffect: Effect;

  /** The components props */
  currentProps?: Record<string, any> | undefined | null;

  /** An observable of the normal/important props */
  stylesObs?: ReturnType<typeof stylesFamily>;
  guards?: RenderGuard[];

  variables?: VariableContextValue;
  containers?: ContainerContextValue;

  inheritedVariables: VariableContextValue;
  inheritedContainers: ContainerContextValue;

  animated?: boolean;
  pressable?: undefined | boolean;
};

/**
 * useNativeCss is the native implementation of the useCssElement hook.
 */
export function useNativeCss(
  type: ComponentType<any>,
  originalProps: Record<string, any> | undefined | null,
  configs: Config[] = [{ source: "className", target: "style" }],
) {
  const contextVariables = useContext(VariableContext);
  const darkScope = isDarkScope(originalProps);
  const inheritedVariables = useMemo(
    () =>
      darkScope
        ? ({
            ...contextVariables,
            ...scopeRegistry[DARK_SCOPE_KEY],
          } as typeof contextVariables)
        : contextVariables,
    [darkScope, contextVariables],
  );
  const inheritedContainers = useContext(ContainerContext);

  const [state, setState] = useState((): ComponentState => {
    /**
     * When fired, this effect will force the rules to be re-evaluated.
     * This will cause a re-render if there are different rules
     *
     * Use this when a rule condition changes, e.g FastRefresh or media queries
     */
    const ruleEffect: Effect = {
      observers: new Set(),
      run: () => setState((state) => updateRules(state)),
    };

    /**
     * When fired, this effect will force a re-render of the component.
     * This will cause a re-fetch of the styles.
     *
     * Use this when a value changes, e.g vm units or light / dark mode
     */
    const styleEffect: Effect = {
      observers: new Set(),
      run: () => setState((state) => ({ ...state })),
    };

    const initialState = updateRules(
      {
        ruleEffect,
        ruleEffectGetter: (observable) => observable.get(ruleEffect),
        styleEffect,
        configs,
        inheritedContainers,
        inheritedVariables,
        pressable: type === View ? false : undefined,
      },
      originalProps,
      inheritedVariables,
      inheritedContainers,
      false,
      false,
    );
    // State initializers may be discarded by React StrictMode. Subscribe once
    // the component commits instead of retaining an abandoned initializer.
    cleanupEffect(ruleEffect);
    return initialState;
  });

  useEffect(() => {
    // Reconnect subscriptions after React replays an effect setup.
    if (state.ruleEffect.observers.size === 0) {
      state.ruleEffect.run();
      state.styleEffect.run();
    }
    return () => {
      cleanupEffect(state.ruleEffect);
      cleanupEffect(state.styleEffect);
    };
  }, [state.ruleEffect, state.styleEffect]);

  // Check if our derived state has changed (e.g the className prop)
  if (
    testGuards(state, originalProps, inheritedVariables, inheritedContainers)
  ) {
    /**
     * Get the new state
     * Note, this might result in the same styles, but the guards will now be different
     */
    setState(
      updateRules(
        state,
        originalProps,
        inheritedVariables,
        inheritedContainers,
        true,
      ),
    );

    // We can bail on rendering as the result of this render will be discarded
    return createElement(Fragment);
  }

  let props = layoutGrid(
    getStyledProps(
      state,
      originalProps,
      type === Image ? adaptImageProps : undefined,
    ),
  );

  if (type === View && props?.onPress) {
    type = Pressable;
    // A view becomes pressable here only to track its press state for a group or container that styles its children
    // on press (`group-active:`, a `dark` scope). That tracking is not a control: unless the caller made the view
    // pressable or accessible itself, it stays an accessibility container, so VoiceOver does not read the whole
    // subtree as one button.
    if (originalProps?.onPress === undefined && originalProps?.accessible === undefined) {
      props = { ...props, accessible: false };
    }
  }

  if (state.animated) {
    type = animatedComponentFamily(type);
  }

  if (state.variables || darkScope) {
    props = {
      value: state.variables
        ? { ...inheritedVariables, ...state.variables }
        : inheritedVariables,
      children: createElement(type, props),
    };
    type = VariableContext.Provider;
  }

  if (state.containers) {
    // Publish a new props snapshot even when this component's own rules did not
    // change. Descendants can depend on an ancestor attribute through a group.
    const containers = Object.fromEntries(
      Object.entries(state.containers).map(([name, container]) => [
        name,
        container.key === state.ruleEffectGetter
          ? { key: container.key, props: originalProps }
          : (inheritedContainers[name] ?? container),
      ]),
    );
    props = {
      value: containers,
      children: createElement(type, props),
    };
    type = ContainerContext.Provider;
  }

  return createElement(type, props);
}

/**
 * Convert the styled() mapping to a config array
 */
export function mappingToConfig(mapping: StyledConfiguration<any>) {
  return Object.entries(mapping).flatMap(([key, value]): Config => {
    if (value === true) {
      return {
        source: key,
        target: key,
      };
    } else if (value === false) {
      return { source: key, target: false };
    } else if (typeof value === "string") {
      return { source: key, target: value.split(".") };
    } else if (typeof value === "object") {
      // Keep the declared deprecated alias working. The current spelling wins
      // when both are provided, including an intentionally empty mapping.
      const mapping = value.nativeStyleMapping ?? value.nativeStyleToProp;
      const nativeStyleMapping = mapping
        ? Object.fromEntries(
            Object.entries(mapping).map(([k, v]) => [k, v === true ? k : v]),
          )
        : undefined;

      if (Array.isArray(value)) {
        return { source: key, target: value, nativeStyleMapping };
      }

      if ("target" in value) {
        if (value.target === false) {
          return { source: key, target: false, nativeStyleMapping };
        } else if (typeof value.target === "string") {
          const target = value.target.split(".");

          if (target.length === 1) {
            return { source: key, target: target[0]!, nativeStyleMapping };
          } else {
            return { source: key, target, nativeStyleMapping };
          }
        } else if (Array.isArray(value.target)) {
          return { source: key, target: value.target, nativeStyleMapping };
        }
      }
    }

    throw new Error(`styled(): Invalid mapping for ${key}: ${value}`);
  });
}

// Apply native Image fitting before normal, inline, and important props merge.
// The compiler's contentFit mapping remains available to Expo Image adapters.
function adaptImageProps(props: Record<string, any> | undefined) {
  if (!props || !("contentFit" in props)) return props;
  const { contentFit, style, ...rest } = props;
  return {
    ...rest,
    style: { ...StyleSheet.flatten(style), objectFit: contentFit },
  };
}
