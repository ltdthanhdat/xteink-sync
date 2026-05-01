import React, { useEffect, useMemo, useState } from "react";
import os from "node:os";
import path from "node:path";
import { Box, Newline, Text, useApp, useInput } from "ink";
import { appConfig, featureFlags } from "./config/feature-flags.js";
import { SyncEngine } from "./sync/sync-engine.js";
import { SqliteStateStore } from "./state/sqlite-store.js";
import { HistoryView } from "./tui/history-view.js";
import { ModeSelect } from "./tui/mode-select.js";
import { ProfilePicker } from "./tui/profile-picker.js";
import { PromptInput } from "./tui/prompt-input.js";
import { SettingsMenu } from "./tui/settings-menu.js";
import { Badge, KeyHints, Meter, Panel, ScreenFrame, getContentWidth, truncateMiddle } from "./tui/ui-kit.js";
import type { ExecutionProgress, RunProgress, SyncMode, SyncProfile, SyncRunRecord, SyncRunSummary, TombstoneSide } from "./types.js";

type Step =
  | "profile-picker"
  | "profile-delete-confirm"
  | "history"
  | "history-detail"
  | "profile-name"
  | "settings"
  | "settings-base-url"
  | "settings-local-root"
  | "settings-remote-root"
  | "settings-mode"
  | "running"
  | "executing"
  | "done"
  | "error";

const legacyDefaultBaseUrl = "http://192.168.1.38";
const defaultBaseUrl = "http://crosspoint.local";
const defaultLocalRoot = path.join(os.homedir(), "xteink-files");
const scanPhases: RunProgress["phase"][] = [
  "validating-local-root",
  "probing-device",
  "scanning-local",
  "scanning-remote",
  "building-plan",
  "completed"
];
const scanPhaseLabels: Record<RunProgress["phase"], string> = {
  "validating-local-root": "Validate local root",
  "probing-device": "Connect to device",
  "scanning-local": "Scan local files",
  "scanning-remote": "Scan remote files",
  "building-plan": "Build sync plan",
  completed: "Ready"
};
const normalizeStoredBaseUrl = (value: string | undefined): string => (!value || value === legacyDefaultBaseUrl ? defaultBaseUrl : value);
const normalizeStoredLocalRoot = (value: string | undefined): string => value?.trim() || defaultLocalRoot;
const actionColor = (kind: string): "green" | "yellow" | "red" | "gray" | "cyan" => {
  if (kind === "upload" || kind === "download") {
    return "yellow";
  }

  if (kind === "conflict") {
    return "red";
  }

  if (kind === "skip") {
    return "gray";
  }

  if (kind === "local-delete" || kind === "remote-delete") {
    return "cyan";
  }

  return "yellow";
};
const actionLabel = (kind: string): string => {
  if (kind === "upload") {
    return "upload";
  }

  if (kind === "download") {
    return "download";
  }

  if (kind === "local-delete" || kind === "remote-delete" || kind === "delete-candidate") {
    return "delete";
  }

  if (kind === "conflict") {
    return "conflict";
  }

  if (kind === "skip") {
    return "skip";
  }

  return kind;
};

const DetailRow = ({ label, value, valueColor = "white" }: { label: string; value: string; valueColor?: "white" | "gray" | "cyan" | "cyanBright" | "green" | "greenBright" | "yellow" | "red" }) => (
  <Box>
    <Box width={18}>
      <Text color="gray">{label}</Text>
    </Box>
    <Text color={valueColor}>{value}</Text>
  </Box>
);

const StatusStep = ({
  label,
  state
}: {
  label: string;
  state: "done" | "active" | "pending";
}) => (
  <Box>
    <Text color={state === "done" ? "green" : state === "active" ? "yellow" : "gray"}>
      {state === "done" ? "done" : state === "active" ? "live" : "wait"}
    </Text>
    <Text color="gray">  </Text>
    <Text color={state === "pending" ? "gray" : "white"}>{label}</Text>
  </Box>
);

const buildSessionDetails = ({
  profileName,
  localRoot
}: {
  profileName: string;
  localRoot: string;
}) => [
  { label: "Profile", value: profileName },
  { label: "Local", value: localRoot || "_" }
];

const SummaryStat = ({
  label,
  value,
  color = "white"
}: {
  label: string;
  value: string;
  color?: "white" | "gray" | "cyan" | "cyanBright" | "green" | "greenBright" | "yellow" | "red";
}) => (
  <Box flexDirection="column" width={14} marginRight={1}>
    <Text color="gray">{label}</Text>
    <Text color={color}>{value}</Text>
  </Box>
);

export const App = () => {
  const { exit } = useApp();
  const stateStore = useMemo(() => new SqliteStateStore(), []);
  const syncEngine = useMemo(() => new SyncEngine(), []);
  const storedProfiles = stateStore.listProfiles();
  const singleProfile = storedProfiles.find((profile) => profile.name === appConfig.singleProfileName) ?? storedProfiles[0];
  const [profiles, setProfiles] = useState<SyncProfile[]>(() => storedProfiles);
  const [recentRuns, setRecentRuns] = useState<SyncRunRecord[]>(() => stateStore.listRecentRuns());
  const [selectedRunIndex, setSelectedRunIndex] = useState(0);
  const [selectedRun, setSelectedRun] = useState<SyncRunRecord | null>(null);
  const [showRunAllActions, setShowRunAllActions] = useState(false);

  const [step, setStep] = useState<Step>(() => {
    if (featureFlags.enableProfileManagement) {
      return storedProfiles.length > 0 ? "profile-picker" : "profile-name";
    }

    return "running";
  });
  const [selectedProfileIndex, setSelectedProfileIndex] = useState(0);
  const [selectedSettingIndex, setSelectedSettingIndex] = useState(0);
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<SyncProfile | null>(null);
  const [profileName, setProfileName] = useState(
    featureFlags.enableProfileManagement ? (singleProfile?.name ?? appConfig.singleProfileName) : appConfig.singleProfileName
  );
  const [baseUrl, setBaseUrl] = useState(
    featureFlags.enableProfileManagement ? normalizeStoredBaseUrl(singleProfile?.baseUrl) : normalizeStoredBaseUrl(singleProfile?.baseUrl ?? defaultBaseUrl)
  );
  const [localRoot, setLocalRoot] = useState(normalizeStoredLocalRoot(singleProfile?.localRoot));
  const [remoteRoot, setRemoteRoot] = useState(featureFlags.enableRemoteRootEditing ? (singleProfile?.remoteRoot ?? "/") : "/");
  const [mode, setMode] = useState<SyncMode>(singleProfile?.mode ?? "bidirectional");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [result, setResult] = useState<SyncRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showConflictDetails, setShowConflictDetails] = useState(false);
  const [previewOffset, setPreviewOffset] = useState(0);
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgress>({
    phase: "planning",
    totalActions: 0,
    completedActions: 0
  });
  const [runProgress, setRunProgress] = useState<RunProgress>({
    phase: "validating-local-root"
  });
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [timeNow, setTimeNow] = useState(() => Date.now());
  const [executionEvents, setExecutionEvents] = useState<string[]>([]);
  const panelWidth = getContentWidth();
  const narrowWidth = getContentWidth(18);
  const wideWidth = getContentWidth(8);
  const leftColumnWidth = Math.max(34, Math.floor(panelWidth * 0.36));
  const rightColumnWidth = Math.max(42, panelWidth - leftColumnWidth - 4);
  const activeProfileName = featureFlags.enableProfileManagement ? profileName.trim() : appConfig.singleProfileName;
  const persistProfile = (overrides: Partial<SyncProfile> = {}) => {
    const profile: SyncProfile = {
      name: overrides.name ?? activeProfileName,
      baseUrl: (overrides.baseUrl ?? baseUrl).trim() || defaultBaseUrl,
      localRoot: (overrides.localRoot ?? localRoot).trim() || defaultLocalRoot,
      remoteRoot: featureFlags.enableRemoteRootEditing ? ((overrides.remoteRoot ?? remoteRoot).trim() || "/") : "/",
      mode: overrides.mode ?? mode
    };

    stateStore.upsertProfile(profile);
    setProfiles(stateStore.listProfiles());
    return profile;
  };
  const settingsItems = [
    {
      label: "Sync mode",
      value: mode,
      description: "Default sync mode. The main flow now runs directly with this saved value."
    },
    {
      label: "Device URL",
      value: baseUrl,
      description: "Base URL used to probe and scan the device."
    },
    {
      label: "Local root",
      value: localRoot,
      description: "Local folder scanned and synced."
    }
  ];

  if (featureFlags.enableRemoteRootEditing) {
    settingsItems.push({
      label: "Remote root",
      value: remoteRoot || "/",
      description: "Remote folder path on the device."
    });
  }

  useEffect(() => {
    if (featureFlags.enableProfileManagement) {
      return;
    }

    const persistedProfile = stateStore.listProfiles().find((profile) => profile.name === appConfig.singleProfileName);
    if (!persistedProfile) {
      stateStore.upsertProfile({
        name: activeProfileName,
        baseUrl: baseUrl.trim() || defaultBaseUrl,
        localRoot: localRoot.trim() || defaultLocalRoot,
        remoteRoot: featureFlags.enableRemoteRootEditing ? (remoteRoot.trim() || "/") : "/",
        mode
      });
      setProfiles(stateStore.listProfiles());
      return;
    }

    const normalizedBaseUrl = normalizeStoredBaseUrl(persistedProfile.baseUrl);
    const normalizedLocalRoot = normalizeStoredLocalRoot(persistedProfile.localRoot);
    if (normalizedBaseUrl === persistedProfile.baseUrl && normalizedLocalRoot === persistedProfile.localRoot) {
      return;
    }

    setBaseUrl(normalizedBaseUrl);
    setLocalRoot(normalizedLocalRoot);
    stateStore.upsertProfile({
      ...persistedProfile,
      baseUrl: normalizedBaseUrl,
      localRoot: normalizedLocalRoot
    });
    setProfiles(stateStore.listProfiles());
  }, [activeProfileName, baseUrl, localRoot, mode, remoteRoot, stateStore]);

  useInput((input, key) => {
    if (step === "profile-picker" && input.toLowerCase() === "h") {
      setRecentRuns(stateStore.listRecentRuns());
      setSelectedRunIndex(0);
      setStep("history");
      return;
    }

    if (step === "profile-delete-confirm" && input.toLowerCase() === "y" && pendingDeleteProfile) {
      stateStore.deleteProfile(pendingDeleteProfile.name);
      const updatedProfiles = stateStore.listProfiles();
      setProfiles(updatedProfiles);
      setRecentRuns(stateStore.listRecentRuns());
      setSelectedProfileIndex(0);
      setPendingDeleteProfile(null);
      setInfoMessage(`Deleted profile ${pendingDeleteProfile.name}. Run history was kept.`);
      setStep(updatedProfiles.length > 0 ? "profile-picker" : "profile-name");
      return;
    }

    if (step === "profile-delete-confirm" && (input.toLowerCase() === "b" || input.toLowerCase() === "q")) {
      setPendingDeleteProfile(null);
      setStep("profile-picker");
      return;
    }

    if (step === "history-detail" && (input.toLowerCase() === "b" || input.toLowerCase() === "q")) {
      setShowRunAllActions(false);
      setStep("history");
      return;
    }

    if (step === "history-detail" && input.toLowerCase() === "a") {
      setShowRunAllActions((current) => !current);
      return;
    }

    if (step === "done" && (input.toLowerCase() === "j" || input.toLowerCase() === "k" || key.downArrow || key.upArrow)) {
      const previewItems =
        showConflictDetails && result
          ? result.actions.filter((item) => item.kind === "conflict")
          : (result?.actions ?? []);
      const previewViewportRows = Math.max(8, (process.stdout.rows ?? 40) - 16);
      const previewHeaderRows = showConflictDetails ? 4 : 1;
      const visibleItems = Math.max(3, Math.ceil((previewViewportRows - previewHeaderRows) / 3));
      const maxOffset = Math.max(0, previewItems.length - visibleItems);

      setPreviewOffset((current) => (input.toLowerCase() === "j" || key.downArrow ? Math.min(maxOffset, current + 1) : Math.max(0, current - 1)));
      return;
    }

    if ((step === "done" || step === "error" || step === "running" || step === "executing") && input.toLowerCase() === "b") {
      setInfoMessage(null);
      setShowConflictDetails(false);
      setError(null);
      setRecentRuns(stateStore.listRecentRuns());
      setProfiles(stateStore.listProfiles());
      setSelectedSettingIndex(0);
      setStep(featureFlags.enableProfileManagement ? "profile-picker" : "settings");
      return;
    }

    if ((step === "done" || step === "error" || ((step === "running" || step === "executing") && error)) && input.toLowerCase() === "q") {
      exit();
    }

    if (step === "done" && (input.toLowerCase() === "e" || key.return)) {
      setInfoMessage(null);
      setExecutionProgress({
        phase: "planning",
        totalActions: 0,
        completedActions: 0
      });
      setExecutionEvents([]);
      setStep("executing");
    }

    if (step === "done" && input.toLowerCase() === "c") {
      setPreviewOffset(0);
      setShowConflictDetails((current) => !current);
    }
  });

  useEffect(() => {
    if (step !== "running") {
      return;
    }

    setRunStartedAt(Date.now());
    setRunProgress({ phase: "validating-local-root" });
    const startedAt = new Date().toISOString();
    const profile: SyncProfile = {
      name: activeProfileName,
      baseUrl: baseUrl.trim() || defaultBaseUrl,
      localRoot: localRoot.trim() || defaultLocalRoot,
      remoteRoot: featureFlags.enableRemoteRootEditing ? (remoteRoot.trim() || "/") : "/",
      mode
    };

    let cancelled = false;
    void (async () => {
      try {
        setError(null);
        stateStore.upsertProfile(profile);
        setProfiles(stateStore.listProfiles());
        const baselineEntries = stateStore.listBaselineEntries(profile.name);
        const pendingTombstones = stateStore.listPendingTombstones(profile.name);
        const summary = await syncEngine.run(profile, baselineEntries, pendingTombstones, setRunProgress, () => cancelled);
        if (cancelled) {
          return;
        }
        stateStore.recordRun(profile.name, "success", summary, startedAt);
        setRecentRuns(stateStore.listRecentRuns());
        setResult(summary);
        setInfoMessage(null);
        setShowConflictDetails(false);
        setPreviewOffset(0);
        setStep("done");
      } catch (runError) {
        if (cancelled || (runError instanceof Error && runError.message === "SYNC_CANCELLED")) {
          return;
        }
        const message = runError instanceof Error ? runError.message : String(runError);
        setError(message);
        if (result) {
          stateStore.recordRun(profile.name, "failed", result, startedAt);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeProfileName, baseUrl, localRoot, mode, remoteRoot, result, stateStore, step, syncEngine]);

  useEffect(() => {
    if (step !== "running" && step !== "executing") {
      return;
    }

    if (runStartedAt === null) {
      setTimeNow(Date.now());
    }

    const timer = setInterval(() => setTimeNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [runStartedAt, step]);

  useEffect(() => {
    if (step !== "executing") {
      return;
    }

    setRunStartedAt(Date.now());
    const startedAt = new Date().toISOString();
    const profile: SyncProfile = {
      name: activeProfileName,
      baseUrl: baseUrl.trim() || defaultBaseUrl,
      localRoot: localRoot.trim() || defaultLocalRoot,
      remoteRoot: featureFlags.enableRemoteRootEditing ? (remoteRoot.trim() || "/") : "/",
      mode
    };

    const execute = async () => {
      try {
        setError(null);
        const baselineEntries = stateStore.listBaselineEntries(profile.name);
        const pendingTombstones = stateStore.listPendingTombstones(profile.name);
        const previewTombstones =
          result?.actions
            .filter((action) => (action.kind === "local-delete" || action.kind === "remote-delete") && action.tombstoneSide !== undefined)
            .map((action) => ({
              relativePath: action.path,
              deletedOn: action.tombstoneSide as TombstoneSide
            })) ?? [];

        stateStore.upsertPendingTombstones(profile.name, previewTombstones);
        const summary = await syncEngine.execute(
          profile,
          baselineEntries,
          stateStore.listPendingTombstones(profile.name),
          setExecutionProgress
        );
        if (summary.plan.conflict === 0 && summary.plan.deleteCandidate === 0) {
          stateStore.replaceBaselineEntries(profile.name, summary.currentEntries);
        }
        const resolvedTombstonePaths = [...new Set(
          summary.actions
            .filter((action) => action.tombstoneSide !== undefined)
            .map((action) => action.path)
        )];
        stateStore.resolveTombstones(
          profile.name,
          resolvedTombstonePaths
        );
        stateStore.recordRun(profile.name, "success", summary, startedAt);
        setRecentRuns(stateStore.listRecentRuns());
        setResult(summary);
        setInfoMessage(
          summary.plan.conflict === 0 && summary.plan.deleteCandidate === 0
            ? `Executed ${summary.plan.upload} uploads, ${summary.plan.download} downloads, and ${summary.plan.localDelete + summary.plan.remoteDelete} deletes. Baseline was updated.`
            : `Executed ${summary.plan.upload} uploads, ${summary.plan.download} downloads, and ${summary.plan.localDelete + summary.plan.remoteDelete} deletes, but ${summary.plan.conflict} conflicts / ${summary.plan.deleteCandidate} delete candidates remain, so baseline was not updated automatically.`
        );
        setShowConflictDetails(summary.plan.conflict > 0 || summary.plan.deleteCandidate > 0);
        setPreviewOffset(0);
        setStep("done");
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : String(runError);
        setError(message);
        setExecutionProgress((current) => ({
          ...current,
          phase: "failed",
          errorMessage: message
        }));
      }
    };

    void execute();
  }, [activeProfileName, baseUrl, localRoot, mode, remoteRoot, stateStore, step, syncEngine]);

  useEffect(() => {
    if (step !== "executing") {
      return;
    }

    const eventText = executionProgress.errorMessage
      ? `Error: ${executionProgress.errorMessage}`
      : executionProgress.currentAction
        ? `Running ${actionLabel(executionProgress.currentAction.kind)} ${executionProgress.currentAction.path}`
        : executionProgress.lastCompletedAction
          ? `Completed ${actionLabel(executionProgress.lastCompletedAction.kind)} ${executionProgress.lastCompletedAction.path}`
          : executionProgress.phase === "completed"
            ? "Execution completed"
            : executionProgress.phase === "running" && executionProgress.totalActions > 0
              ? `Started execution for ${executionProgress.totalActions} actions`
              : "";

    if (!eventText) {
      return;
    }

    setExecutionEvents((current) => {
      if (current[0] === eventText) {
        return current;
      }

      return [eventText, ...current].slice(0, 8);
    });
  }, [executionProgress, step]);

  if (step === "profile-picker") {
    return (
      <ProfilePicker
        profiles={profiles}
        selectedIndex={selectedProfileIndex}
        onChange={setSelectedProfileIndex}
        onSelectExisting={(profile) => {
          setIsEditingProfile(false);
          setProfileName(profile.name);
          setBaseUrl(normalizeStoredBaseUrl(profile.baseUrl));
          setLocalRoot(normalizeStoredLocalRoot(profile.localRoot));
          setRemoteRoot(featureFlags.enableRemoteRootEditing ? profile.remoteRoot : "/");
          setMode(profile.mode);
          setInfoMessage(null);
          setShowConflictDetails(false);
          setStep("running");
        }}
        onSelectNew={() => {
          setIsEditingProfile(false);
          setProfileName(`profile-${profiles.length + 1}`);
          setBaseUrl(defaultBaseUrl);
          setLocalRoot(defaultLocalRoot);
          setRemoteRoot("/");
          setMode("bidirectional");
          setInfoMessage(null);
          setShowConflictDetails(false);
          setStep("profile-name");
        }}
        onEditExisting={(profile) => {
          setIsEditingProfile(true);
          setProfileName(profile.name);
          setBaseUrl(profile.baseUrl);
          setLocalRoot(profile.localRoot);
          setRemoteRoot(featureFlags.enableRemoteRootEditing ? profile.remoteRoot : "/");
          setMode(profile.mode);
          setInfoMessage(null);
          setShowConflictDetails(false);
          setStep("profile-name");
        }}
        onDeleteExisting={(profile) => {
          setPendingDeleteProfile(profile);
          setStep("profile-delete-confirm");
        }}
      />
    );
  }

  if (step === "profile-delete-confirm" && pendingDeleteProfile) {
    return (
      <ScreenFrame
        title="Xteink Sync"
        subtitle="Delete profile"
        badges={<Badge label="danger" color="red" />}
        footer={<KeyHints items={["y confirm", "b cancel", "q cancel"]} />}
      >
        <Panel title="Delete profile" titleColor="red">
          <Text color="white">{pendingDeleteProfile.name}</Text>
          <Text color="gray">{truncateMiddle(pendingDeleteProfile.baseUrl, narrowWidth)}</Text>
          <Text color="gray">Local: {truncateMiddle(pendingDeleteProfile.localRoot, narrowWidth - 7)}</Text>
          <Newline />
          <Text color="gray">This deletes the profile and its baseline entries. Run history stays intact.</Text>
        </Panel>
      </ScreenFrame>
    );
  }

  if (step === "history") {
    return (
      <HistoryView
        runs={recentRuns}
        selectedIndex={selectedRunIndex}
        onChange={setSelectedRunIndex}
        onSelect={(run) => {
          setSelectedRun(run);
          setShowRunAllActions(false);
          setStep("history-detail");
        }}
        onBack={() => setStep("profile-picker")}
      />
    );
  }

  if (step === "history-detail" && selectedRun) {
    const detailConflicts = selectedRun.summary.actions.filter((item) => item.kind === "conflict");
    const detailActions = showRunAllActions ? selectedRun.summary.actions : detailConflicts;

    return (
      <ScreenFrame
        title="Xteink Sync"
        subtitle="Run detail"
        badges={<Badge label={selectedRun.status} color={selectedRun.status === "success" ? "green" : "red"} />}
        footer={<KeyHints items={["a toggle actions", "b back", "q back"]} />}
      >
        <Box width="100%" flexDirection="row" justifyContent="flex-start" alignItems="flex-start">
          <Box width={leftColumnWidth} marginRight={1}>
            <Panel title="Summary">
              <Text color="white">{selectedRun.profileName}</Text>
              <Text color="gray">{truncateMiddle(`${selectedRun.startedAt} -> ${selectedRun.finishedAt}`, narrowWidth)}</Text>
              <Text color="gray">Mode: {selectedRun.summary.mode}</Text>
              <Text color="gray">
                Local {selectedRun.summary.scan.localFiles}f/{selectedRun.summary.scan.localDirs}d
              </Text>
              <Text color="gray">
                Remote {selectedRun.summary.scan.remoteFiles}f/{selectedRun.summary.scan.remoteDirs}d
              </Text>
              <Text color="gray">
                U {selectedRun.summary.plan.upload}  D {selectedRun.summary.plan.download}
              </Text>
              <Text color="gray">
                DEL {(selectedRun.summary.plan.localDelete ?? 0) + (selectedRun.summary.plan.remoteDelete ?? 0)}  DC {selectedRun.summary.plan.deleteCandidate ?? 0}
              </Text>
              <Text color="gray">
                C {selectedRun.summary.plan.conflict}  S {selectedRun.summary.plan.skip}
              </Text>
            </Panel>
          </Box>
          <Box width={rightColumnWidth}>
            <Panel title={showRunAllActions ? "All actions" : "Conflicts"} titleColor={showRunAllActions ? "cyan" : "red"}>
              {detailActions.length === 0 ? (
                <Text color="gray">{showRunAllActions ? "No actions in this run." : "No conflicts in this run."}</Text>
              ) : null}
              {detailActions.slice(0, 20).map((item) => (
                <Box key={`detail:${selectedRun.id}:${item.kind}:${item.path}`} flexDirection="column" marginBottom={1}>
                  <Box>
                    <Badge label={actionLabel(item.kind)} color={actionColor(item.kind)} />
                    <Text> </Text>
                    <Text color="white">{truncateMiddle(item.path, rightColumnWidth - 12)}</Text>
                  </Box>
                  <Text color="gray">{truncateMiddle(item.reason, rightColumnWidth - 4)}</Text>
                </Box>
              ))}
              {detailActions.length > 20 ? <Text color="gray">... and {detailActions.length - 20} more actions</Text> : null}
            </Panel>
          </Box>
        </Box>
      </ScreenFrame>
    );
  }

  if (step === "profile-name") {
    return (
      <PromptInput
        label="Profile name"
        description={isEditingProfile ? "Editing the existing profile stored in SQLite." : "Used to store the current sync configuration in SQLite."}
        value={profileName}
        details={buildSessionDetails({
          profileName,
          localRoot
        })}
        onChange={setProfileName}
        onSubmit={() => setStep("settings")}
        onBack={
          featureFlags.enableProfileManagement ? () => setStep(profiles.length > 0 ? "profile-picker" : "profile-name") : undefined
        }
      />
    );
  }

  if (step === "settings") {
    return (
      <SettingsMenu
        items={settingsItems.map((item) => ({ ...item }))}
        selectedIndex={selectedSettingIndex}
        onChange={setSelectedSettingIndex}
        onSelect={() => {
          setInfoMessage(null);
          setError(null);
          if (selectedSettingIndex === 0) {
            setStep("settings-mode");
            return;
          }

          if (selectedSettingIndex === 1) {
            setStep("settings-base-url");
            return;
          }

          if (selectedSettingIndex === 2) {
            setStep("settings-local-root");
            return;
          }

          if (featureFlags.enableRemoteRootEditing) {
            setStep("settings-remote-root");
          }
        }}
        onRun={() => {
          setInfoMessage(null);
          setError(null);
          setShowConflictDetails(false);
          setPreviewOffset(0);
          setResult(null);
          setExecutionEvents([]);
          setExecutionProgress({
            phase: "planning",
            totalActions: 0,
            completedActions: 0
          });
          setStep("running");
        }}
        onQuit={exit}
      />
    );
  }

  if (step === "settings-mode") {
    return (
      <ModeSelect
        mode={mode}
        subtitle="Settings"
        details={[
          { label: "Profile", value: activeProfileName },
          { label: "Device", value: baseUrl },
          { label: "Local", value: localRoot }
        ]}
        onChange={setMode}
        onSubmit={() => {
          persistProfile({ mode });
          setStep("settings");
        }}
        onBack={() => setStep("settings")}
      />
    );
  }

  if (step === "settings-base-url") {
    return (
      <PromptInput
        label="Device base URL"
        description="Example: http://crosspoint.local"
        value={baseUrl}
        details={[
          { label: "Profile", value: activeProfileName },
          { label: "Local", value: localRoot }
        ]}
        onChange={setBaseUrl}
        onSubmit={() => {
          const nextBaseUrl = baseUrl.trim() || defaultBaseUrl;
          setBaseUrl(nextBaseUrl);
          persistProfile({ baseUrl: nextBaseUrl });
          setStep("settings");
        }}
        onBack={() => setStep("settings")}
      />
    );
  }

  if (step === "settings-local-root") {
    return (
      <PromptInput
        label="Local root"
        description="Absolute path to the local sync folder."
        value={localRoot}
        details={[
          { label: "Profile", value: activeProfileName },
          { label: "Device", value: baseUrl }
        ]}
        onChange={setLocalRoot}
        onSubmit={() => {
          const nextLocalRoot = localRoot.trim() || defaultLocalRoot;
          setLocalRoot(nextLocalRoot);
          persistProfile({ localRoot: nextLocalRoot });
          setStep("settings");
        }}
        onBack={() => setStep("settings")}
      />
    );
  }

  if (step === "settings-remote-root" && featureFlags.enableRemoteRootEditing) {
    return (
      <PromptInput
        label="Remote root"
        description="Remote folder path on the device."
        value={remoteRoot}
        details={[
          { label: "Profile", value: activeProfileName },
          { label: "Device", value: baseUrl },
          { label: "Local", value: localRoot }
        ]}
        onChange={setRemoteRoot}
        onSubmit={() => {
          const nextRemoteRoot = remoteRoot.trim() || "/";
          setRemoteRoot(nextRemoteRoot);
          persistProfile({ remoteRoot: nextRemoteRoot });
          setStep("settings");
        }}
        onBack={() => setStep("settings")}
      />
    );
  }

  const conflicts = result?.actions.filter((item) => item.kind === "conflict") ?? [];
  const deleteCandidates = result?.actions.filter((item) => item.kind === "delete-candidate") ?? [];
  const previewItems = showConflictDetails && conflicts.length > 0 ? conflicts : (result?.actions ?? []);
  const previewViewportRows = Math.max(8, (process.stdout.rows ?? 40) - 16);
  const previewHeaderRows = showConflictDetails && conflicts.length > 0 ? 4 : 1;
  const visiblePreviewCount = Math.max(3, Math.ceil((previewViewportRows - previewHeaderRows) / 3));
  const visiblePreviewItems = previewItems.slice(previewOffset, previewOffset + visiblePreviewCount);
  const deleteCount = (result?.plan.localDelete ?? 0) + (result?.plan.remoteDelete ?? 0);
  const transferCount = (result?.plan.upload ?? 0) + (result?.plan.download ?? 0);
  const plannedChangeCount = transferCount + deleteCount;

  if (step === "running" || step === "executing" || step === "done") {
    const scanPhaseIndex = scanPhases.indexOf(runProgress.phase);
    const visibleScanSteps = scanPhases.slice(0, -1);
    const activeScanIndex = Math.min(Math.max(scanPhaseIndex, 0), visibleScanSteps.length - 1);
    const completedScanSteps = runProgress.phase === "completed" ? visibleScanSteps.length : Math.max(0, activeScanIndex);
    const paneWidth = Math.max(24, Math.floor((panelWidth - 3) / 2));
    const statusBadgeLabel =
      step === "done"
        ? "preview"
        : step === "running"
          ? "scanning"
          : executionProgress.phase;

    return (
      <ScreenFrame
        title="Xteink Sync"
        subtitle="Sync workflow"
        badges={
          <Box>
            <Badge label={mode} color="cyan" />
            <Text> </Text>
            <Badge
              label={statusBadgeLabel}
              color={step === "done" ? "green" : step === "running" ? "cyan" : executionProgress.phase === "failed" ? "red" : "yellow"}
            />
            {result ? (
              <>
                <Text> </Text>
                <Badge label={`${result.plan.upload} up`} color="yellow" />
                <Text> </Text>
                <Badge label={`${result.plan.download} down`} color="yellow" />
                <Text> </Text>
                <Badge label={`${result.plan.conflict} conflicts`} color="red" />
              </>
            ) : null}
          </Box>
        }
        footer={
          <KeyHints
            items={
              step === "done"
                ? ["↑/↓ scroll", "j/k scroll", "Enter execute", "e execute", "c conflicts", "b settings", "q quit"]
                : error
                  ? ["b sync settings", "q quit"]
                  : step === "running"
                    ? ["b settings", "scan in progress", "wait for plan preview", "Ctrl+C quit"]
                    : ["b settings", "execution in progress", "wait for completion", "Ctrl+C quit"]
            }
          />
        }
      >
        <Box width="100%" flexGrow={1} flexDirection="row" justifyContent="flex-start" alignItems="stretch">
          <Box width={paneWidth} paddingLeft={1} paddingRight={1} flexDirection="column">
            <Text color={conflicts.length > 0 ? "red" : "green"}>Decision</Text>
            <Box flexDirection="column">
              <Text color={conflicts.length > 0 ? "red" : "greenBright"}>
                {step === "running"
                  ? "Scanning local and remote files"
                  : step === "executing"
                    ? error
                      ? "Execution stopped with an error"
                      : executionProgress.phase === "completed"
                        ? "Execution completed"
                        : "Applying planned sync actions"
                      : conflicts.length > 0
                        ? `Review ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} before execute`
                      : plannedChangeCount === 0
                        ? "No file changes detected"
                        : `Ready to apply ${plannedChangeCount} change${plannedChangeCount === 1 ? "" : "s"}`}
              </Text>
              <Box marginTop={1} flexWrap="wrap">
                <SummaryStat label="Uploads" value={String(result?.plan.upload ?? 0)} color="yellow" />
                <SummaryStat label="Downloads" value={String(result?.plan.download ?? 0)} color="yellow" />
                <SummaryStat label="Deletes" value={String(deleteCount)} color="cyan" />
                <SummaryStat label="Conflicts" value={String(result?.plan.conflict ?? 0)} color="red" />
              </Box>
              {deleteCandidates.length > 0 ? <Text color="yellow">Delete candidates need manual review: {deleteCandidates.length}</Text> : null}
            </Box>
            <Box marginTop={2} flexDirection="column">
              <Text color="green">Session summary</Text>
              <DetailRow label="Profile" value={activeProfileName} valueColor="cyanBright" />
              <DetailRow label="Mode" value={result?.mode ?? mode} valueColor="gray" />
              <DetailRow label="Local root" value={truncateMiddle(localRoot, paneWidth - 22)} />
              <DetailRow
                label="Baseline entries"
                value={String(result?.baselineEntryCount ?? stateStore.listBaselineEntries(activeProfileName).length)}
                valueColor="gray"
              />
              <DetailRow
                label="Pending deletes"
                value={String(result?.pendingTombstoneCount ?? stateStore.listPendingTombstones(activeProfileName).length)}
                valueColor="gray"
              />
              {result ? (
                <>
                  <DetailRow label="Root entries" value={String(result.probe.rootEntryCount)} valueColor="gray" />
                  <DetailRow label="Local scan" value={`${result.scan.localFiles}f/${result.scan.localDirs}d`} valueColor="gray" />
                  <DetailRow label="Remote scan" value={`${result.scan.remoteFiles}f/${result.scan.remoteDirs}d`} valueColor="gray" />
                </>
              ) : null}
              {infoMessage ? (
                <Box marginTop={1}>
                  <Text color="greenBright">{truncateMiddle(infoMessage, paneWidth - 2)}</Text>
                </Box>
              ) : null}
            </Box>
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
            <Text color={step === "done" ? (showConflictDetails && conflicts.length > 0 ? "red" : "cyan") : step === "running" ? "cyan" : "yellow"}>
              {step === "done" ? (showConflictDetails && conflicts.length > 0 ? "Conflict details" : "Action preview") : step === "running" ? "Scan status" : "Progress"}
            </Text>
            <Box flexDirection="column" flexGrow={1}>
              {step === "done" ? (
                <Box flexDirection="column" flexGrow={1}>
                  {showConflictDetails && conflicts.length > 0 ? (
                    <>
                      <Text color="gray">Rule: keep the local file at the original path, save the remote copy as `*.conflict-remote-&lt;timestamp&gt;`, then upload both copies to remote.</Text>
                      <Newline />
                      {visiblePreviewItems.map((item) => (
                        <Box key={`conflict:${item.path}`} flexDirection="column" marginBottom={1}>
                          <Box>
                            <Badge label="conflict" color="red" />
                            <Text> </Text>
                            <Text color="white">{truncateMiddle(item.path, paneWidth - 12)}</Text>
                          </Box>
                          <Text color="gray">local={item.localSize ?? "?"}, remote={item.remoteSize ?? "?"}</Text>
                        </Box>
                      ))}
                      {previewItems.length > visiblePreviewCount ? (
                        <Text color="gray">
                          Showing {previewOffset + 1}-{Math.min(previewOffset + visiblePreviewItems.length, previewItems.length)} of {previewItems.length}
                        </Text>
                      ) : null}
                      {deleteCandidates.length > 0 ? <Text color="yellow">Delete candidates: {deleteCandidates.length}</Text> : null}
                      <Box flexGrow={1} />
                      <Box width="100%" justifyContent="center">
                        <Text color="greenBright">Press Enter or E to execute this sync plan.</Text>
                      </Box>
                      <Box flexGrow={1} />
                    </>
                  ) : (
                    <>
                      {visiblePreviewItems.map((item) => (
                        <Box key={`${item.kind}:${item.path}`} flexDirection="column" marginBottom={1}>
                          <Box>
                            <Badge label={actionLabel(item.kind)} color={actionColor(item.kind)} />
                            <Text> </Text>
                            <Text color="white">{truncateMiddle(item.path, paneWidth - 12)}</Text>
                          </Box>
                          <Text color="gray">{truncateMiddle(item.reason, paneWidth - 4)}</Text>
                        </Box>
                      ))}
                      {previewItems.length > visiblePreviewCount ? (
                        <Text color="gray">
                          Showing {previewOffset + 1}-{Math.min(previewOffset + visiblePreviewItems.length, previewItems.length)} of {previewItems.length}
                        </Text>
                      ) : null}
                      <Box flexGrow={1} />
                      <Box width="100%" justifyContent="center">
                        <Text color="greenBright">Press Enter or E to execute this sync plan.</Text>
                      </Box>
                      <Box flexGrow={1} />
                    </>
                  )}
                </Box>
              ) : step === "executing" ? (
                <>
                  <Text color={error ? "red" : "yellow"}>
                    {error
                      ? "Execution failed"
                      : executionProgress.phase === "completed"
                        ? "Execution completed"
                        : executionProgress.errorMessage
                          ? "Execution failed"
                          : "Applying sync actions"}
                  </Text>
                  {error ? <Text color="redBright">{truncateMiddle(error, paneWidth - 2)}</Text> : null}
                  <Box marginTop={1}>
                    <DetailRow
                      label="Actions"
                      value={`${executionProgress.completedActions}/${executionProgress.totalActions}`}
                      valueColor={executionProgress.errorMessage ? "red" : "greenBright"}
                    />
                  </Box>
                  <Meter current={executionProgress.completedActions} total={executionProgress.totalActions} width={Math.max(20, Math.min(48, paneWidth - 12))} />
                  {executionProgress.currentAction ? (
                    <Box marginTop={1} flexDirection="column">
                      <Box>
                        <Badge label={actionLabel(executionProgress.currentAction.kind)} color={actionColor(executionProgress.currentAction.kind)} />
                        <Text> </Text>
                        <Text color="white">{truncateMiddle(executionProgress.currentAction.path, paneWidth - 12)}</Text>
                      </Box>
                      <Text color="gray">Current action</Text>
                    </Box>
                  ) : null}
                  {executionProgress.lastCompletedAction ? (
                    <Box marginTop={1} flexDirection="column">
                      <Text color="green">Last completed</Text>
                      <Text color="gray">{truncateMiddle(`${actionLabel(executionProgress.lastCompletedAction.kind)} ${executionProgress.lastCompletedAction.path}`, paneWidth - 4)}</Text>
                    </Box>
                  ) : null}
                  {executionProgress.errorMessage ? <Text color="red">Error: {truncateMiddle(executionProgress.errorMessage, paneWidth - 4)}</Text> : null}
                  <Newline />
                  <Text color="cyan">Latest events</Text>
                  {executionEvents.length === 0 ? <Text color="gray">No events yet.</Text> : null}
                  {executionEvents.map((event) => (
                    <Text key={event} color="gray">
                      • {truncateMiddle(event, paneWidth - 4)}
                    </Text>
                  ))}
                </>
              ) : (
                <>
                  <Text color={error ? "red" : "yellow"}>{error ? "Scan failed" : scanPhaseLabels[runProgress.phase]}</Text>
                  {error ? <Text color="redBright">{truncateMiddle(error, paneWidth - 2)}</Text> : null}
                  <Box marginTop={1}>
                    <DetailRow label="Stage" value={`${completedScanSteps}/${visibleScanSteps.length}`} valueColor="greenBright" />
                  </Box>
                  <Meter current={completedScanSteps} total={visibleScanSteps.length} width={Math.max(20, Math.min(48, paneWidth - 12))} />
                  <Box marginTop={1} flexDirection="column">
                    {visibleScanSteps.map((phase, index) => (
                      <StatusStep
                        key={phase}
                        label={scanPhaseLabels[phase]}
                        state={runProgress.phase === "completed" || index < activeScanIndex ? "done" : index === activeScanIndex ? "active" : "pending"}
                      />
                    ))}
                  </Box>
                  <Newline />
                  <Text color="gray">
                    {runProgress.phase === "building-plan"
                      ? "Comparing baseline, remote, and local files before showing the plan."
                      : "Results will appear automatically after the plan is ready."}
                  </Text>
                </>
              )}
            </Box>
          </Box>
        </Box>
      </ScreenFrame>
    );
  }
};
