import { Badge, Menu, type MenuItemProps } from "@mantine/core";
import type React from "react";
import { useContext, useEffect } from "react";

import { useUserAcknowledgement } from "metabase/hooks/use-user-acknowledgement";

import { MenuWithIndicatorContext } from "./MenuWithIndicatorContext";

export const FYCMenuItem = ({
  userAckKey,
  badgeLabel = "New",
  children,
  showBadge = hasSeen => !hasSeen,
  ...rest
}: {
  badgeLabel: React.ReactNode;
  userAckKey: string;
  showBadge: (val: boolean) => boolean;
} & MenuItemProps) => {
  const { upsertBadge, removeBadge } = useContext(MenuWithIndicatorContext);

  const [hasSeen, { ack }] = useUserAcknowledgement(userAckKey, true);

  useEffect(() => {
    upsertBadge({ key: userAckKey, value: !!hasSeen });

    return () => removeBadge({ key: userAckKey });
  }, [userAckKey, upsertBadge, removeBadge, hasSeen]);

  const handleClick = () => {
    ack();
  };

  return (
    <Menu.Item
      {...rest}
      rightSection={
        showBadge(hasSeen) && <Badge variant="light">{badgeLabel}</Badge>
      }
      onClick={handleClick}
    >
      {children}
    </Menu.Item>
  );
};
