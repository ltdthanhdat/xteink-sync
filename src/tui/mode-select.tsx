import React from "react";
import { Box, Text, useInput } from "ink";
import type { SyncMode } from "../types.js";
import { Badge, KeyHints, ScreenFrame, getContentWidth, truncateMiddle } from "./ui-kit.js";

const modes: SyncMode[] = ["bidirectional", "pull-only", "push-only"];
const descriptions: Record<SyncMode, string> = {
  bidirectional: "Two-way sync with conflict detection.",
  "pull-only": "Remote is authoritative for updates and deletes.",
  "push-only": "Local is authoritative for updates and deletes."
};

type ModeSelectProps = {
  mode: SyncMode;
  subtitle?: string;
  details?: Array<{ label: string; value: string }>;
  onChange: (mode: SyncMode) => void;
  onSubmit: () => void;
  onBack?: () => void;
};

export const ModeSelect = ({ mode, subtitle = "Mode selection", details = [], onChange, onSubmit, onBack }: ModeSelectProps) => {
  const contentWidth = getContentWidth();
  const paneWidth = details.length > 0 ? Math.max(24, Math.floor((contentWidth - 3) / 2)) : contentWidth;

  useInput((input, key) => {
    const index = modes.indexOf(mode);

    if ((key.escape || input === "b") && onBack) {
      onBack();
      return;
    }

    if (key.upArrow) {
      onChange(modes[(index - 1 + modes.length) % modes.length]);
      return;
    }

    if (key.downArrow) {
      onChange(modes[(index + 1) % modes.length]);
      return;
    }

    if (key.return) {
      onSubmit();
      return;
    }

    if (input === "j") {
      onChange(modes[(index + 1) % modes.length]);
    }

    if (input === "k") {
      onChange(modes[(index - 1 + modes.length) % modes.length]);
    }
  });

  return (
    <ScreenFrame
      title="Xteink Sync"
      subtitle={subtitle}
      footer={<KeyHints items={["↑/↓ move", "j/k move", "Enter continue", "Esc back"]} />}
    >
      <Box width="100%" flexGrow={1} flexDirection={details.length > 0 ? "row" : "column"} justifyContent="flex-start" alignItems="stretch">
        <Box width={paneWidth} paddingLeft={1} paddingRight={details.length > 0 ? 1 : 1} flexDirection="column">
          <Box flexDirection="column">
            <Text color="cyan">Sync mode</Text>
            {modes.map((item) => (
              <Box key={item} flexDirection="column" marginBottom={item === modes[modes.length - 1] ? 0 : 1}>
                <Box>
                  <Text color={item === mode ? "greenBright" : "gray"}>{item === mode ? "› " : "  "}</Text>
                  <Text color={item === mode ? "greenBright" : "white"}>{item}</Text>
                  <Text> </Text>
                  {item === mode ? <Badge label="selected" color="green" /> : null}
                </Box>
                <Text color="gray">{descriptions[item]}</Text>
              </Box>
            ))}
          </Box>
        </Box>
        {details.length > 0 ? (
          <>
            <Box
              width={1}
              borderStyle="single"
              borderColor="gray"
              borderTop={false}
              borderRight={false}
              borderBottom={false}
            />
            <Box width={paneWidth} paddingLeft={1} paddingRight={1} flexDirection="column">
              <Text color="cyan">Session</Text>
              {details.map((detail) => (
                <Box key={detail.label}>
                  <Box width={12}>
                    <Text color="gray">{detail.label}</Text>
                  </Box>
                  <Text color="white">{truncateMiddle(detail.value, paneWidth - 16)}</Text>
                </Box>
              ))}
            </Box>
          </>
        ) : null}
      </Box>
    </ScreenFrame>
  );
};
