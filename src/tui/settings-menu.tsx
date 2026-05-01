import React from "react";
import { Box, Text, useInput } from "ink";
import { KeyHints, ScreenFrame, getContentWidth, truncateMiddle } from "./ui-kit.js";

type SettingsItem = {
  label: string;
  value: string;
  description: string;
};

type SettingsMenuProps = {
  items: SettingsItem[];
  selectedIndex: number;
  onChange: (index: number) => void;
  onSelect: () => void;
  onRun: () => void;
  onQuit: () => void;
};

export const SettingsMenu = ({ items, selectedIndex, onChange, onSelect, onRun, onQuit }: SettingsMenuProps) => {
  const contentWidth = getContentWidth();
  const paneWidth = Math.max(24, Math.floor((contentWidth - 3) / 2));
  const selectedItem = items[selectedIndex];

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      onChange((selectedIndex - 1 + items.length) % items.length);
      return;
    }

    if (key.downArrow || input === "j") {
      onChange((selectedIndex + 1) % items.length);
      return;
    }

    if (key.return) {
      onSelect();
      return;
    }

    if (input === "r") {
      onRun();
      return;
    }

    if (input === "q") {
      onQuit();
    }
  });

  return (
    <ScreenFrame
      title="Xteink Sync"
      subtitle="Settings"
      footer={<KeyHints items={["↑/↓ move", "j/k move", "Enter edit", "r run sync", "q quit"]} />}
    >
      <Box width="100%" flexGrow={1} flexDirection="row" justifyContent="flex-start" alignItems="stretch">
        <Box width={paneWidth} paddingLeft={1} paddingRight={1} flexDirection="column">
          <Text color="cyan">Options</Text>
          {items.map((item, index) => (
            <Box key={item.label} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={index === selectedIndex ? "greenBright" : "gray"}>{index === selectedIndex ? "› " : "  "}</Text>
                <Text color={index === selectedIndex ? "greenBright" : "white"}>{item.label}</Text>
              </Box>
              <Text color="gray">{truncateMiddle(item.value, paneWidth - 2)}</Text>
            </Box>
          ))}
        </Box>
        <Box
          width={1}
          borderStyle="single"
          borderColor="gray"
          borderTop={false}
          borderRight={false}
          borderBottom={false}
        />
        <Box width={paneWidth} paddingLeft={1} paddingRight={1} flexDirection="column">
          <Text color="cyan">Current setting</Text>
          <Text color="white">{selectedItem.label}</Text>
          <Text color="gray">{truncateMiddle(selectedItem.value, paneWidth - 2)}</Text>
          <Box marginTop={1}>
            <Text color="gray">{selectedItem.description}</Text>
          </Box>
        </Box>
      </Box>
    </ScreenFrame>
  );
};
