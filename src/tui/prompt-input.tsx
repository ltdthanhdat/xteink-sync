import React from "react";
import { Box, Text, useInput } from "ink";

type PromptInputProps = {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onBack?: () => void;
};

export const PromptInput = ({ label, description, value, onChange, onSubmit, onBack }: PromptInputProps) => {
  useInput((input, key) => {
    if (key.escape && onBack) {
      onBack();
      return;
    }

    if (key.return) {
      onSubmit();
      return;
    }

    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }

    if (key.ctrl && input === "u") {
      onChange("");
      return;
    }

    if (!key.ctrl && !key.meta && input) {
      onChange(value + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="cyan">{label}</Text>
      {description ? <Text color="gray">{description}</Text> : null}
      <Text>
        {"> "}
        <Text color="green">{value || "_"}</Text>
      </Text>
      <Text color="gray">
        Press Enter to continue, Backspace to delete, Ctrl+U to clear{onBack ? ", Esc to go back." : "."}
      </Text>
    </Box>
  );
};
