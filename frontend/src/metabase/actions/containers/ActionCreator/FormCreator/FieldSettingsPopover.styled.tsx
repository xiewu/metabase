// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const SettingsPopoverBody = styled.div`
  padding: ${space(3)};
`;

export const RequiredToggleLabel = styled.label`
  font-weight: bold;
`;

export const Divider = styled.div`
  border-bottom: 1px solid var(--mb-color-border);
  margin: ${space(2)} 0;
`;

export const ToggleContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${space(1)};
`;

export const SettingsTriggerIcon = styled(Icon)`
  color: var(--mb-color-text-medium);

  &:hover {
    color: var(--mb-color-brand);
  }
`;
