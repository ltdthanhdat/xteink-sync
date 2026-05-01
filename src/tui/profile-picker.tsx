import React from "react";
import { Box, Text, useInput } from "ink";
import type { SyncProfile } from "../types.js";

type ProfilePickerProps = {
  profiles: SyncProfile[];
  selectedIndex: number;
  onChange: (index: number) => void;
  onSelectExisting: (profile: SyncProfile) => void;
  onSelectNew: () => void;
  onEditExisting: (profile: SyncProfile) => void;
  onDeleteExisting: (profile: SyncProfile) => void;
};

export const ProfilePicker = ({
  profiles,
  selectedIndex,
  onChange,
  onSelectExisting,
  onSelectNew,
  onEditExisting,
  onDeleteExisting
}: ProfilePickerProps) => {
  const totalItems = profiles.length + 1;

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      onChange((selectedIndex - 1 + totalItems) % totalItems);
      return;
    }

    if (key.downArrow || input === "j") {
      onChange((selectedIndex + 1) % totalItems);
      return;
    }

    if (key.return) {
      if (selectedIndex === profiles.length) {
        onSelectNew();
        return;
      }

      onSelectExisting(profiles[selectedIndex]);
      return;
    }

    if (input.toLowerCase() === "r" && selectedIndex < profiles.length) {
      onEditExisting(profiles[selectedIndex]);
      return;
    }

    if (input.toLowerCase() === "x" && selectedIndex < profiles.length) {
      onDeleteExisting(profiles[selectedIndex]);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="cyan">Select profile</Text>
      {profiles.map((profile, index) => (
        <Text key={profile.name} color={index === selectedIndex ? "green" : undefined}>
          {index === selectedIndex ? "› " : "  "}
          {profile.name}
          <Text color="gray">  ({profile.baseUrl} | {profile.mode})</Text>
        </Text>
      ))}
      <Text color={selectedIndex === profiles.length ? "green" : undefined}>
        {selectedIndex === profiles.length ? "› " : "  "}
        new profile
      </Text>
      <Text color="gray">Use ↑/↓ or j/k, Enter to select, r to edit, x to delete, h to open recent runs.</Text>
    </Box>
  );
};
