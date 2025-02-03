import { Menu, type MenuProps } from "@mantine/core";
import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useMemo,
  useState,
} from "react";

export const MenuWithIndicatorContext = createContext({});

export const MenuWithIndicatorProvider = (props: PropsWithChildren) => {
  const contextValue = useMenuWithIndicator();

  return (
    <MenuWithIndicatorContext.Provider value={contextValue}>
      {props.children}
    </MenuWithIndicatorContext.Provider>
  );
};

export const FYCMenu = (props: PropsWithChildren<MenuProps>) => {
  return (
    <MenuWithIndicatorProvider>
      <Menu {...props} keepMounted></Menu>
    </MenuWithIndicatorProvider>
  );
};

const useMenuWithIndicator = () => {
  const [badges, setBadges] = useState<[string, boolean][]>([]);

  const upsertBadge = useCallback(
    ({ value, key }: { value: boolean; key: string }) => {
      setBadges(s => [...s.filter(([k]) => k !== key), [key, value]]);
    },
    [],
  );

  const removeBadge = useCallback(({ key }: { key: string }) => {
    setBadges(s => [...s.filter(([k]) => k !== key)]);
  }, []);

  const showIndicator =
    badges.length > 0 && badges.some(([_, v]) => v === false);

  return useMemo(
    () => ({
      upsertBadge,
      removeBadge,
      showIndicator,
    }),
    [showIndicator, upsertBadge, removeBadge],
  );
};
