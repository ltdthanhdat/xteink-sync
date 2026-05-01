import React, { useEffect, useMemo, useState } from "react";
import { Box, Newline, Text, useApp, useInput } from "ink";
import { appConfig, featureFlags } from "./config/feature-flags.js";
import { SyncEngine } from "./sync/sync-engine.js";
import { SqliteStateStore } from "./state/sqlite-store.js";
import { HistoryView } from "./tui/history-view.js";
import { ModeSelect } from "./tui/mode-select.js";
import { ProfilePicker } from "./tui/profile-picker.js";
import { PromptInput } from "./tui/prompt-input.js";
import type { ExecutionProgress, SyncMode, SyncProfile, SyncRunRecord, SyncRunSummary, TombstoneSide } from "./types.js";

type Step = "profile-picker" | "profile-delete-confirm" | "history" | "history-detail" | "profile-name" | "base-url" | "local-root" | "remote-root" | "mode" | "running" | "executing" | "done" | "error";

const defaultLocalRoot = process.cwd();

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

    return "base-url";
  });
  const [selectedProfileIndex, setSelectedProfileIndex] = useState(0);
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<SyncProfile | null>(null);
  const [profileName, setProfileName] = useState(
    featureFlags.enableProfileManagement ? (singleProfile?.name ?? appConfig.singleProfileName) : appConfig.singleProfileName
  );
  const [baseUrl, setBaseUrl] = useState(singleProfile?.baseUrl ?? "http://192.168.1.34");
  const [localRoot, setLocalRoot] = useState(singleProfile?.localRoot ?? defaultLocalRoot);
  const [remoteRoot, setRemoteRoot] = useState(singleProfile?.remoteRoot ?? "/");
  const [mode, setMode] = useState<SyncMode>(singleProfile?.mode ?? "bidirectional");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [result, setResult] = useState<SyncRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showConflictDetails, setShowConflictDetails] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgress>({
    phase: "planning",
    totalActions: 0,
    completedActions: 0
  });

  useInput((input) => {
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
      setInfoMessage(`Đã xóa profile ${pendingDeleteProfile.name}. History runs được giữ lại.`);
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

    if ((step === "done" || step === "error") && input.toLowerCase() === "b") {
      setInfoMessage(null);
      setShowConflictDetails(false);
      setRecentRuns(stateStore.listRecentRuns());
      setProfiles(stateStore.listProfiles());
      setStep(featureFlags.enableProfileManagement ? "profile-picker" : "base-url");
      return;
    }

    if ((step === "done" || step === "error") && input.toLowerCase() === "q") {
      exit();
    }

    if (step === "done" && input.toLowerCase() === "e") {
      setInfoMessage(null);
      setExecutionProgress({
        phase: "planning",
        totalActions: 0,
        completedActions: 0
      });
      setStep("executing");
    }

    if (step === "done" && input.toLowerCase() === "c") {
      setShowConflictDetails((current) => !current);
    }
  });

  useEffect(() => {
    if (step !== "running") {
      return;
    }

    const startedAt = new Date().toISOString();
    const profile: SyncProfile = {
      name: featureFlags.enableProfileManagement ? profileName.trim() : appConfig.singleProfileName,
      baseUrl: baseUrl.trim(),
      localRoot: localRoot.trim(),
      remoteRoot: remoteRoot.trim() || "/",
      mode
    };

    const run = async () => {
      try {
        stateStore.upsertProfile(profile);
        setProfiles(stateStore.listProfiles());
        const baselineEntries = stateStore.listBaselineEntries(profile.name);
        const pendingTombstones = stateStore.listPendingTombstones(profile.name);
        const summary = await syncEngine.run(profile, baselineEntries, pendingTombstones);
        stateStore.recordRun(profile.name, "success", summary, startedAt);
        setRecentRuns(stateStore.listRecentRuns());
        setResult(summary);
        setInfoMessage(null);
        setShowConflictDetails(false);
        setStep("done");
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : String(runError);
        setError(message);
        if (result) {
          stateStore.recordRun(profile.name, "failed", result, startedAt);
        }
        setStep("error");
      }
    };

    void run();
  }, [baseUrl, localRoot, mode, profileName, remoteRoot, result, stateStore, step, syncEngine]);

  useEffect(() => {
    if (step !== "executing") {
      return;
    }

    const startedAt = new Date().toISOString();
    const profile: SyncProfile = {
      name: featureFlags.enableProfileManagement ? profileName.trim() : appConfig.singleProfileName,
      baseUrl: baseUrl.trim(),
      localRoot: localRoot.trim(),
      remoteRoot: remoteRoot.trim() || "/",
      mode
    };

    const execute = async () => {
      try {
        const baselineEntries = stateStore.listBaselineEntries(profile.name);
        const pendingTombstones = stateStore.listPendingTombstones(profile.name);
        const previewTombstones =
          result?.actions
            .filter((action) => (action.kind === "local-soft-delete" || action.kind === "remote-soft-delete") && action.tombstoneSide !== undefined)
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
        stateStore.resolveTombstones(
          profile.name,
          previewTombstones.map((item) => item.relativePath)
        );
        stateStore.recordRun(profile.name, "success", summary, startedAt);
        setRecentRuns(stateStore.listRecentRuns());
        setResult(summary);
        setInfoMessage(
          summary.plan.conflict === 0 && summary.plan.deleteCandidate === 0
            ? `Đã thực thi ${summary.plan.upload} upload, ${summary.plan.download} download và ${summary.plan.localSoftDelete + summary.plan.remoteSoftDelete} soft delete. Baseline đã được cập nhật.`
            : `Đã thực thi ${summary.plan.upload} upload, ${summary.plan.download} download và ${summary.plan.localSoftDelete + summary.plan.remoteSoftDelete} soft delete, nhưng còn ${summary.plan.conflict} conflict / ${summary.plan.deleteCandidate} delete-candidate nên baseline chưa được cập nhật tự động.`
        );
        setShowConflictDetails(summary.plan.conflict > 0 || summary.plan.deleteCandidate > 0);
        setStep("done");
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : String(runError);
        setError(message);
        setExecutionProgress((current) => ({
          ...current,
          phase: "failed",
          errorMessage: message
        }));
        setStep("error");
      }
    };

    void execute();
  }, [baseUrl, localRoot, mode, profileName, remoteRoot, stateStore, step, syncEngine]);

  if (step === "profile-picker") {
    return (
      <ProfilePicker
        profiles={profiles}
        selectedIndex={selectedProfileIndex}
        onChange={setSelectedProfileIndex}
        onSelectExisting={(profile) => {
          setIsEditingProfile(false);
          setProfileName(profile.name);
          setBaseUrl(profile.baseUrl);
          setLocalRoot(profile.localRoot);
          setRemoteRoot(profile.remoteRoot);
          setMode(profile.mode);
          setInfoMessage(null);
          setShowConflictDetails(false);
          setStep("mode");
        }}
        onSelectNew={() => {
          setIsEditingProfile(false);
          setProfileName(`profile-${profiles.length + 1}`);
          setBaseUrl("http://192.168.1.34");
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
          setRemoteRoot(profile.remoteRoot);
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
      <Box flexDirection="column">
        <Text color="red">Xóa profile?</Text>
        <Text>{pendingDeleteProfile.name}</Text>
        <Text color="gray">{pendingDeleteProfile.baseUrl}</Text>
        <Text color="gray">
          Local: {pendingDeleteProfile.localRoot}
        </Text>
        <Text color="gray">
          Remote: {pendingDeleteProfile.remoteRoot}
        </Text>
        <Newline />
        <Text color="gray">Sẽ xóa profile và baseline entries của profile này. Recent runs vẫn được giữ lại.</Text>
        <Text color="gray">Nhấn y để xác nhận, b hoặc q để hủy.</Text>
      </Box>
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
      <Box flexDirection="column">
        <Text color="cyan">Run detail</Text>
        <Text>
          {selectedRun.status}  {selectedRun.profileName}
        </Text>
        <Text color="gray">
          {selectedRun.startedAt} {"->"} {selectedRun.finishedAt}
        </Text>
        <Text>Mode: {selectedRun.summary.mode}</Text>
        <Text>
          Local: {selectedRun.summary.scan.localFiles} files / {selectedRun.summary.scan.localDirs} dirs
        </Text>
        <Text>
          Remote: {selectedRun.summary.scan.remoteFiles} files / {selectedRun.summary.scan.remoteDirs} dirs
        </Text>
        <Text>
          Plan: {selectedRun.summary.plan.upload} upload / {selectedRun.summary.plan.download} download /{" "}
          {(selectedRun.summary.plan.localSoftDelete ?? 0) + (selectedRun.summary.plan.remoteSoftDelete ?? 0)} soft-delete /{" "}
          {selectedRun.summary.plan.deleteCandidate ?? 0} delete-candidate / {selectedRun.summary.plan.conflict} conflict /{" "}
          {selectedRun.summary.plan.skip} skip
        </Text>
        <Newline />
        <Text color={showRunAllActions ? "cyan" : "red"}>{showRunAllActions ? "All actions:" : "Conflicts:"}</Text>
        {detailActions.length === 0 ? (
          <Text color="gray">{showRunAllActions ? "Không có action nào trong run này." : "Không có conflict trong run này."}</Text>
        ) : null}
        {detailActions.slice(0, 20).map((item) => (
          <Text key={`detail:${selectedRun.id}:${item.kind}:${item.path}`}>
            <Text color={item.kind === "conflict" ? "red" : item.kind === "skip" ? "gray" : "yellow"}>{item.kind}</Text>
            {"  "}
            {item.path}
            {"  "}
            <Text color="gray">
              ({item.reason}; local={item.localSize ?? "?"}, remote={item.remoteSize ?? "?"})
            </Text>
          </Text>
        ))}
        {detailActions.length > 20 ? <Text color="gray">... và còn {detailActions.length - 20} action khác</Text> : null}
        <Newline />
        <Text color="gray">Nhấn a để bật/tắt all actions. Nhấn b hoặc q để quay lại history.</Text>
      </Box>
    );
  }

  if (step === "profile-name") {
    return (
      <PromptInput
        label="Tên profile"
        description={isEditingProfile ? "Đang chỉnh profile hiện có trong SQLite." : "Dùng để lưu cấu hình sync hiện tại vào SQLite."}
        value={profileName}
        onChange={setProfileName}
        onSubmit={() => setStep("base-url")}
        onBack={
          featureFlags.enableProfileManagement ? () => setStep(profiles.length > 0 ? "profile-picker" : "profile-name") : undefined
        }
      />
    );
  }

  if (step === "base-url") {
    return (
      <PromptInput
        label="Base URL thiết bị"
        description="Ví dụ: http://192.168.1.34"
        value={baseUrl}
        onChange={setBaseUrl}
        onSubmit={() => setStep("local-root")}
        onBack={featureFlags.enableProfileManagement ? () => setStep("profile-name") : undefined}
      />
    );
  }

  if (step === "local-root") {
    return (
      <PromptInput
        label="Local root"
        description="Thư mục local sẽ được scan trong lượt chạy đầu tiên."
        value={localRoot}
        onChange={setLocalRoot}
        onSubmit={() => setStep("remote-root")}
        onBack={() => setStep("base-url")}
      />
    );
  }

  if (step === "remote-root") {
    return (
      <PromptInput
        label="Remote root"
        description="Dùng / nếu muốn scan từ root của thiết bị."
        value={remoteRoot}
        onChange={setRemoteRoot}
        onSubmit={() => setStep("mode")}
        onBack={() => setStep("local-root")}
      />
    );
  }

  if (step === "mode") {
    return <ModeSelect mode={mode} onChange={setMode} onSubmit={() => setStep("running")} onBack={() => setStep("remote-root")} />;
  }

  if (step === "running" || step === "executing") {
    return (
      <Box flexDirection="column">
        <Text color="cyan">{step === "running" ? "Đang probe và scan thiết bị..." : "Đang thực thi sync plan..."}</Text>
        <Text>Profile: {profileName}</Text>
        <Text>Base URL: {baseUrl}</Text>
        <Text>Local root: {localRoot}</Text>
        <Text>Remote root: {remoteRoot}</Text>
        <Text>Mode: {mode}</Text>
        {step === "executing" ? (
          <>
            <Newline />
            <Text>
              Progress: {executionProgress.completedActions}/{executionProgress.totalActions}
            </Text>
            {executionProgress.currentAction ? (
              <Text color="yellow">
                Current: {executionProgress.currentAction.kind} {executionProgress.currentAction.path}
              </Text>
            ) : null}
            {executionProgress.lastCompletedAction ? (
              <Text color="green">
                Last done: {executionProgress.lastCompletedAction.kind} {executionProgress.lastCompletedAction.path}
              </Text>
            ) : null}
            {executionProgress.errorMessage ? <Text color="red">Error: {executionProgress.errorMessage}</Text> : null}
          </>
        ) : null}
      </Box>
    );
  }

  if (step === "error") {
    return (
      <Box flexDirection="column">
        <Text color="red">Lượt chạy thất bại</Text>
        <Text>{error}</Text>
        <Newline />
        <Text color="gray">Nhấn b để về cấu hình sync, hoặc q để thoát.</Text>
      </Box>
    );
  }

  const conflicts = result?.actions.filter((item) => item.kind === "conflict") ?? [];
  const deleteCandidates = result?.actions.filter((item) => item.kind === "delete-candidate") ?? [];

  return (
    <Box flexDirection="column">
      <Text color="green">Preview sync plan đã sẵn sàng</Text>
      <Text>Profile: {result?.profileName}</Text>
      <Text>Base URL: {result?.baseUrl}</Text>
      <Text>Mode: {result?.mode}</Text>
      <Text>Root entries: {result?.probe.rootEntryCount}</Text>
      <Text>Baseline entries: {result?.baselineEntryCount}</Text>
      <Text>Pending tombstones: {result?.pendingTombstoneCount}</Text>
      <Text>
        Local: {result?.scan.localFiles} files / {result?.scan.localDirs} dirs
      </Text>
      <Text>
        Remote: {result?.scan.remoteFiles} files / {result?.scan.remoteDirs} dirs
      </Text>
      <Newline />
      <Text color="cyan">
        Plan: {result?.plan.upload} upload / {result?.plan.download} download /{" "}
        {(result?.plan.localSoftDelete ?? 0) + (result?.plan.remoteSoftDelete ?? 0)} soft-delete / {result?.plan.deleteCandidate} delete-candidate /{" "}
        {result?.plan.conflict} conflict / {result?.plan.skip} skip
      </Text>
      {showConflictDetails && conflicts.length > 0 ? (
        <>
          <Text color="red">Conflict details:</Text>
          <Text color="gray">
            Rule hiện tại: giữ local ở path gốc, lưu bản remote thành `*.conflict-remote-&lt;timestamp&gt;` rồi upload cả hai bản lên remote.
          </Text>
          {conflicts.slice(0, 10).map((item) => (
            <Text key={`conflict:${item.path}`}>
              <Text color="red">conflict</Text>
              {"  "}
              {item.path}
              {"  "}
              <Text color="gray">
                (local={item.localSize ?? "?"}, remote={item.remoteSize ?? "?"})
              </Text>
            </Text>
          ))}
          {conflicts.length > 10 ? <Text color="gray">... và còn {conflicts.length - 10} conflict khác</Text> : null}
          {deleteCandidates.length > 0 ? <Text color="yellow">Delete candidates: {deleteCandidates.length}</Text> : null}
        </>
      ) : (
        <>
          <Text color="gray">Sample actions:</Text>
          {result?.plan.sample.map((item) => (
            <Text key={`${item.kind}:${item.path}`}>
              <Text color={item.kind === "conflict" ? "red" : item.kind === "skip" ? "gray" : "yellow"}>{item.kind}</Text>
              {"  "}
              {item.path}
              {"  "}
              <Text color="gray">({item.reason})</Text>
            </Text>
          ))}
        </>
      )}
      <Newline />
      {infoMessage ? <Text color="green">{infoMessage}</Text> : null}
      <Text color="gray">Nhấn c để bật/tắt conflict details. Nhấn e để thực thi. Nhấn b để về cấu hình sync. Nhấn q để thoát.</Text>
    </Box>
  );
};
