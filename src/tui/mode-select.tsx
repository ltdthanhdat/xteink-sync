import React from "react";
import { Box, Text, useInput } from "ink";
import type { SyncMode } from "../types.js";

const modes: SyncMode[] = ["bidirectional", "pull-only", "push-only"];

type ModeSelectProps = {
  mode: SyncMode;
  onChange: (mode: SyncMode) => void;
  onSubmit: () => void;
  onBack?: () => void;
};

export const ModeSelect = ({ mode, onChange, onSubmit, onBack }: ModeSelectProps) => {
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
    <Box flexDirection="column">
      <Text color="cyan">Select sync mode</Text>
      {modes.map((item) => (
      <Text key={item} color={item === mode ? "green" : undefined}>
          {item === mode ? "› " : "  "}
          {item}
        </Text>
      ))}
      <Text color="gray">Use ↑/↓ or j/k, Enter to continue, Esc or b to go back.</Text>
    </Box>
  );
};
