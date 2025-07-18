import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Text,
  Stack,
  Box,
  Button,
  Spinner,
  Inline,
  ButtonGroup,
  Checkbox
} from '@forge/react';
import { invoke } from '@forge/bridge';
import SprintConfigModal from '../SprintConfigModal';

const DEFAULT_CONFIG = {
  sprintNumber: 1,
  sprintCapacity: 0,
  puntosHistoriaPorReq: 0,
  teamSize: 0,
  sprintDuration: 0
};

const SprintConfigViewer = () => {
  const [config, setConfig] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPassingSprint, setIsPassingSprint] = useState(false);

  const previousConfigRef = useRef(null);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const configuration = await invoke('getSprintConfig');
      setConfig(configuration);
      previousConfigRef.current = configuration;
    } catch (err) {
      setError(`Error loading configuration: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const prepareNextSprint = useCallback(() => {
    if (!config) return;
    previousConfigRef.current = config;
    setIsPassingSprint(true);
    setIsModalOpen(true);
  }, [config]);

  const handleSaveAfterSprintPass = useCallback(async (newConfig) => {
    setIsLoading(true);
    setError(null);
    try {
      await invoke('endActualSprint', { sprintNumber: config.sprintNumber });
      await invoke('saveSprint', newConfig);
      await invoke('saveSprintConfig', { config: newConfig });
      setConfig(newConfig);
      setIsModalOpen(false);
      setIsPassingSprint(false);
    } catch (err) {
      setConfig(previousConfigRef.current);
      setError(`Error saving new configuration: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const handleSaveConfig = useCallback(async (newConfig) => {
    setIsLoading(true);
    setError(null);
    try {
      await invoke('saveSprint', newConfig);
      await invoke('saveSprintConfig', { config: newConfig });
      setConfig(newConfig);
      setIsModalOpen(false);
    } catch (err) {
      setError(`Error saving configuration: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCancelSprintPass = useCallback(() => {
    setConfig(previousConfigRef.current);
    setIsModalOpen(false);
    setIsPassingSprint(false);
  }, []);

  const mainButtonText = useMemo(() => {
    if (!config || config.sprintNumber === 0) return "Create first sprint";
    return "Edit current sprint configuration";
  }, [config]);

  const renderConfigValue = (value, suffix = "") =>
    value !== undefined && value !== null ? `${value}${suffix}` : "Not configured";

  if (isLoading) {
    return (
      <Box padding="medium" display="flex" justifyContent="center">
        <Spinner size="large" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding="medium">
        <Text color="danger">{error}</Text>
        <Button appearance="primary" onClick={fetchConfig}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box padding="medium">
      <Stack space="space.300">
        <Text size="large" weight="bold">Current Sprint Configuration</Text>
        {config ? (
          <>
          
            <ConfigItem label="Project:" value={renderConfigValue(config.projectKey?.label)} />
            <ConfigItem label="Autamated Jira Issues:" value={<Checkbox isDisabled={true} isChecked={config.createJiraIssues?.value === "yes"}></Checkbox>} />
            <ConfigItem label="Sprint Number" value={renderConfigValue("#", config.sprintNumber)} />
            <ConfigItem label="Sprint Velocity" value={renderConfigValue(config.sprintCapacity, " points")} />
            <ConfigItem label="Default points per requirement" value={renderConfigValue(config.puntosHistoriaPorReq, " points")} />
            <ConfigItem label="Team members" value={renderConfigValue(config.teamSize, " members")} />
            <ConfigItem label="Sprint duration" value={renderConfigValue(config.sprintDuration, " days")} />
            <ButtonGroup>
              <Button appearance="primary" onClick={() => setIsModalOpen(true)}>
                {mainButtonText}
              </Button>
              <Button
                appearance="primary"
                onClick={prepareNextSprint}
                isDisabled={!config || config.sprintNumber === 0}
              >
                Move to next sprint
              </Button>
            </ButtonGroup>
          </>
        ) : (
          <Button appearance="primary" onClick={() => setIsModalOpen(true)}>
            Create first configuration
          </Button>
        )}
      </Stack>
      {isModalOpen && (
        <SprintConfigModal
          initialConfig={
            isPassingSprint
              ? { ...config, sprintNumber: (config?.sprintNumber || 0) + 1 }
              : config || DEFAULT_CONFIG
          }
          onSave={isPassingSprint ? handleSaveAfterSprintPass : handleSaveConfig}
          onClose={isPassingSprint ? handleCancelSprintPass : () => setIsModalOpen(false)}
        />
      )}
    </Box>
  );
};

const ConfigItem = ({ label, value }) => (
  <Box border="1px solid var(--ds-border)" padding="space.100" borderRadius="border.radius.100">
    <Inline spread="space-between">
      <Text weight="medium">{label}:</Text>
      <Text>{value}</Text>
    </Inline>
  </Box>
);

export default SprintConfigViewer;
