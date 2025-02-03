import { Indicator, Menu } from "@mantine/core";
import { type PropsWithChildren, useContext } from "react";

import { MenuWithIndicatorContext } from "./MenuWithIndicatorContext";

export const MenuTargetWithIndicator = (props: PropsWithChildren) => {
  const { showIndicator } = useContext(MenuWithIndicatorContext);

  return (
    <Menu.Target>
      <Indicator disabled={!showIndicator} size={6}>
        {props.children}
      </Indicator>
    </Menu.Target>
  );
};
