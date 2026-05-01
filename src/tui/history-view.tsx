import React from "react";
import { Box, Text, useInput } from "ink";
import type { SyncRunRecord } from "../types.js";

type HistoryViewProps = {
  runs: SyncRunRecord[];
  selectedIndex: number;
  onChange: (index: number) => void;
  onSelect: (run: SyncRunRecord) => void;
  onBack: () => void;
};

export const HistoryView = ({ runs, selectedIndex, onChange, onSelect, onBack }: HistoryViewProps) => {
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
    <Box flexDirection="column">
      <Text color="cyan">Recent runs</Text>
      {runs.length === 0 ? <Text color="gray">No sync runs have been recorded yet.</Text> : null}
      {runs.map((run, index) => (
        <Box key={run.id} flexDirection="column" marginBottom={1}>
          <Text color={index === selectedIndex ? "cyan" : run.status === "success" ? "green" : "red"}>
            {index === selectedIndex ? "› " : "  "}
            {run.status}  {run.profileName}
          </Text>
          <Text color="gray">
            {run.startedAt} {"->"} {run.finishedAt}
          </Text>
          <Text color="gray">
            upload={run.summary.plan.upload}, download={run.summary.plan.download}, soft-delete=
            {(run.summary.plan.localSoftDelete ?? 0) + (run.summary.plan.remoteSoftDelete ?? 0)}, delete-candidate=
            {run.summary.plan.deleteCandidate ?? 0}, conflict={run.summary.plan.conflict}, skip={run.summary.plan.skip}
          </Text>
        </Box>
      ))}
      <Text color="gray">Use ↑/↓ or j/k to choose, Enter to open details, b or q to go back.</Text>
    </Box>
  );
};
