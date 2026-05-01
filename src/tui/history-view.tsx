import React from "react";
import { Box, Text, useInput } from "ink";
import type { SyncRunRecord } from "../types.js";
import { Badge, KeyHints, Panel, ScreenFrame, getContentWidth, truncateMiddle } from "./ui-kit.js";

type HistoryViewProps = {
  runs: SyncRunRecord[];
  selectedIndex: number;
  onChange: (index: number) => void;
  onSelect: (run: SyncRunRecord) => void;
  onBack: () => void;
};

export const HistoryView = ({ runs, selectedIndex, onChange, onSelect, onBack }: HistoryViewProps) => {
  const contentWidth = getContentWidth(10);
  const leftWidth = Math.max(42, Math.floor(contentWidth * 0.54));
  const rightWidth = Math.max(28, contentWidth - leftWidth - 2);
  const textWidth = leftWidth - 8;
  const selectedRun = runs.length > 0 ? runs[selectedIndex] : null;

  useInput((input, key) => {
    if (key.upArrow || input.toLowerCase() === "k") {
      if (runs.length > 0) {
        onChange((selectedIndex - 1 + runs.length) % runs.length);
      }
      return;
    }

    if (key.downArrow || input.toLowerCase() === "j") {
      if (runs.length > 0) {
        onChange((selectedIndex + 1) % runs.length);
      }
      return;
    }

    if (key.return && runs.length > 0) {
      onSelect(runs[selectedIndex]);
      return;
    }

    if (input.toLowerCase() === "b" || input.toLowerCase() === "q") {
      onBack();
    }
  });

  return (
    <ScreenFrame
      title="Xteink Sync"
      subtitle="Recent runs"
      footer={<KeyHints items={["↑/↓ choose", "j/k choose", "Enter details", "b back"]} />}
    >
      <Box width="100%" flexDirection="row" justifyContent="flex-start" alignItems="flex-start">
        <Box width={leftWidth} marginRight={1}>
          <Panel title="Recent runs">
            {runs.length === 0 ? <Text color="gray">No sync runs have been recorded yet.</Text> : null}
            {runs.map((run, index) => (
              <Box key={run.id} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={index === selectedIndex ? "cyan" : "gray"}>{index === selectedIndex ? "› " : "  "}</Text>
                  <Badge label={run.status} color={run.status === "success" ? "green" : "red"} />
                  <Text> </Text>
                  <Text color={index === selectedIndex ? "cyan" : "white"}>{run.profileName}</Text>
                </Box>
                <Text color="gray">{truncateMiddle(`${run.startedAt} -> ${run.finishedAt}`, textWidth)}</Text>
                <Text color="gray">
                  u={run.summary.plan.upload} d={run.summary.plan.download} c={run.summary.plan.conflict} del=
                  {(run.summary.plan.localDelete ?? 0) + (run.summary.plan.remoteDelete ?? 0)}
                </Text>
              </Box>
            ))}
          </Panel>
        </Box>
        <Box width={rightWidth}>
          <Panel title="Run summary">
            {selectedRun ? (
              <>
                <Text color="white">{selectedRun.profileName}</Text>
                <Text color="gray">{truncateMiddle(`${selectedRun.startedAt} -> ${selectedRun.finishedAt}`, rightWidth - 4)}</Text>
                <Text color="gray">Mode: {selectedRun.summary.mode}</Text>
                <Text color="gray">Base URL</Text>
                <Text color="white">{truncateMiddle(selectedRun.summary.baseUrl, rightWidth - 4)}</Text>
                <Text color="gray">
                  Local {selectedRun.summary.scan.localFiles}f/{selectedRun.summary.scan.localDirs}d
                </Text>
                <Text color="gray">
                  Remote {selectedRun.summary.scan.remoteFiles}f/{selectedRun.summary.scan.remoteDirs}d
                </Text>
                <Text color="yellow">Transfers {selectedRun.summary.plan.upload + selectedRun.summary.plan.download}</Text>
                <Text color="red">Conflicts {selectedRun.summary.plan.conflict}</Text>
              </>
            ) : (
              <Text color="gray">Select a run to inspect its summary.</Text>
            )}
          </Panel>
        </Box>
      </Box>
    </ScreenFrame>
  );
};
