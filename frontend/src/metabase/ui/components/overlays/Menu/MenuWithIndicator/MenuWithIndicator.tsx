import { Indicator, Menu } from "metabase/ui";
import { MenuWithIndicatorContext } from "./MenuWithIndicatorContext";
import { PropsWithChildren, useContext } from "react";

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
