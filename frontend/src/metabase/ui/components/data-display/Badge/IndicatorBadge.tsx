import { Badge, BadgeProps } from "@mantine/core";
import { useUserAcknowledgement } from "metabase/hooks/use-user-acknowledgement";
import { useContext, useEffect } from "react";
import { MenuWithIndicatorContext } from "../../overlays/Menu/MenuWithIndicator/MenuWithIndicatorContext";

export const IndicatorBadge = ({
  userAckKey,
  override = false,
  children,
  ...rest
}: {
  userAckKey: string;
  override?: boolean;
} & BadgeProps) => {
  const { upsertBadge, removeBadge } = useContext(MenuWithIndicatorContext);

  const [hasSeen] = useUserAcknowledgement(userAckKey, true);

  console.log(hasSeen);

  useEffect(() => {
    upsertBadge({ key: userAckKey, value: !!hasSeen });

    return () => removeBadge({ key: userAckKey });
  }, [userAckKey, upsertBadge, removeBadge]);

  if (hasSeen && !override) {
    return null;
  }

  return <Badge {...rest}>{children}</Badge>;
};
