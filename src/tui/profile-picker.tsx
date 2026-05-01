import React from "react";
import { Box, Text, useInput } from "ink";
import type { SyncProfile } from "../types.js";
import { Badge, KeyHints, Panel, ScreenFrame, getContentWidth, truncateMiddle } from "./ui-kit.js";

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
  const contentWidth = getContentWidth(10);
  const leftWidth = Math.max(36, Math.floor(contentWidth * 0.48));
  const rightWidth = Math.max(28, contentWidth - leftWidth - 2);
  const textWidth = leftWidth - 8;
  const selectedProfile = selectedIndex < profiles.length ? profiles[selectedIndex] : null;

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
    <ScreenFrame
      title="Xteink Sync"
      subtitle="Profiles"
      footer={<KeyHints items={["↑/↓ choose", "Enter select", "r edit", "x delete", "h history"]} />}
    >
      <Box width="100%" flexDirection="row" justifyContent="flex-start" alignItems="flex-start">
        <Box width={leftWidth} marginRight={1}>
          <Panel title="Profiles">
            {profiles.map((profile, index) => (
              <Box key={profile.name} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={index === selectedIndex ? "greenBright" : "gray"}>{index === selectedIndex ? "› " : "  "}</Text>
                  <Text color={index === selectedIndex ? "greenBright" : "white"}>{profile.name}</Text>
                  <Text> </Text>
                  <Badge label={profile.mode} color="cyan" />
                </Box>
                <Text color="gray">{truncateMiddle(profile.baseUrl, textWidth)}</Text>
              </Box>
            ))}
            <Box>
              <Text color={selectedIndex === profiles.length ? "greenBright" : "gray"}>{selectedIndex === profiles.length ? "› " : "  "}</Text>
              <Text color={selectedIndex === profiles.length ? "greenBright" : "white"}>new profile</Text>
            </Box>
          </Panel>
        </Box>
        <Box width={rightWidth}>
          <Panel title={selectedProfile ? "Selected profile" : "Create profile"}>
            {selectedProfile ? (
              <>
                <Text color="cyanBright">{selectedProfile.name}</Text>
                <Text color="gray">Mode: {selectedProfile.mode}</Text>
                <Text color="gray">Base URL</Text>
                <Text color="white">{truncateMiddle(selectedProfile.baseUrl, rightWidth - 4)}</Text>
                <Text color="gray">Local root</Text>
                <Text color="white">{truncateMiddle(selectedProfile.localRoot, rightWidth - 4)}</Text>
              </>
            ) : (
              <>
                <Text color="white">Create a new sync profile.</Text>
                <Text color="gray">You will set name, device URL, local root, and mode in the next steps.</Text>
              </>
            )}
          </Panel>
        </Box>
      </Box>
    </ScreenFrame>
  );
};
