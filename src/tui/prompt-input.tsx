import React from "react";
import { Box, Text, useInput } from "ink";
import { KeyHints, ScreenFrame, getContentWidth, truncateMiddle } from "./ui-kit.js";

type PromptInputDetail = {
  label: string;
  value: string;
};

type PromptInputProps = {
  label: string;
  description?: string;
  value: string;
  details?: PromptInputDetail[];
  onChange: (value: string) => void;
  onSubmit: () => void;
  onBack?: () => void;
};

export const PromptInput = ({ label, description, value, details = [], onChange, onSubmit, onBack }: PromptInputProps) => {
  const contentWidth = getContentWidth();
  const paneWidth = details.length > 0 ? Math.max(24, Math.floor((contentWidth - 3) / 2)) : contentWidth;

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
    <ScreenFrame
      title="Xteink Sync"
      subtitle="Configuration"
      footer={<KeyHints items={["Enter continue", "Backspace delete", "Ctrl+U clear", onBack ? "Esc back" : ""].filter(Boolean)} />}
    >
      <Box width="100%" flexGrow={1} flexDirection={details.length > 0 ? "row" : "column"} justifyContent="flex-start" alignItems="stretch">
        <Box width={paneWidth} paddingLeft={1} paddingRight={details.length > 0 ? 1 : 1} flexDirection="column">
          <Box flexDirection="column">
            <Text color="cyan">{label}</Text>
            {description ? <Text color="gray">{description}</Text> : null}
            <Box flexDirection="column">
              <Text color="gray">Current value</Text>
              <Box>
                <Text color="gray">› </Text>
                <Text color="greenBright">{value || "_"}</Text>
              </Box>
            </Box>
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
