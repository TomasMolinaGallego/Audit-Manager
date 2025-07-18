import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { requestJira } from '@forge/bridge';
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Text,
  Form,
  Stack,
  Box,
  Textfield,
  Button,
  SectionMessage,
  Select,
} from '@forge/react';

const FIELD_DEFS = [
  {
    label: "Sprint number",
    name: "sprintNumber",
    min: 1,
    type: "number",
    validate: v => Number(v) >= 1,
    getValue: v => Number(v) || 0,
  },
  {
    label: "Sprint duration (days)",
    name: "sprintDuration",
    min: 1,
    type: "number",
    validate: v => Number(v) >= 1,
    getValue: v => Number(v) || 0,
  },
  {
    label: "Team size",
    name: "teamSize",
    min: 1,
    max: 10,
    type: "number",
    validate: v => Number(v) >= 1 && Number(v) <= 10,
    getValue: v => Number(v) || 0,
  },
  {
    label: "Sprint Velocity (points)",
    name: "sprintCapacity",
    min: 1,
    type: "number",
    validate: v => Number(v) >= 1,
    getValue: v => Number(v) || 0,
  },
  {
    label: "Points per requirement",
    name: "puntosHistoriaPorReq",
    min: 1,
    type: "number",
    validate: v => Number(v) >= 1,
    getValue: v => Number(v) || 0,
  }
];

// New field for creating Jira issues
const JIRA_ISSUE_OPTIONS = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" }
];

const SprintConfigModal = React.memo(({ initialConfig, onSave, onClose }) => {
  const [localConfig, setLocalConfig] = useState({
    createJiraIssues: "no", // Default value for the new field
    ...initialConfig
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState('');

  // Load Jira projects when opening the modal
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await requestJira('/rest/api/3/project');
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to load projects: ${errorText}`);
        }
        
        const projectsData = await response.json();
        setProjects(projectsData);
        // Select the first project by default if none is selected
        if (!localConfig.projectKey && projectsData.length > 0) {
          setLocalConfig(prev => ({
            ...prev,
            projectKey: projectsData[0].key
          }));
        }
      } catch (error) {
        setProjectError(error.message);
      } finally {
        setLoadingProjects(false);
      }
    };

    fetchProjects();
  }, []);

  useEffect(() => {
    setLocalConfig({
      createJiraIssues: "no", // Keep default value
      ...initialConfig
    });
    setErrors({});
    setFormError('');
  }, [initialConfig]);

  const handleFieldChange = useCallback((name, getValue) => (value) => {
    setLocalConfig(prev => ({
      ...prev,
      [name]: getValue(value)
    }));
    setErrors(prev => {
      const { [name]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const handleProjectChange = useCallback((value) => {
    setLocalConfig(prev => ({
      ...prev,
      projectKey: value
    }));
    setErrors(prev => {
      const { projectKey: _, ...rest } = prev;
      return rest;
    });
  }, []);

  // New handler for the create issues option
  const handleJiraIssueOptionChange = useCallback((value) => {
    setLocalConfig(prev => ({
      ...prev,
      createJiraIssues: value
    }));
  }, []);

  const fields = useMemo(() =>
    FIELD_DEFS.map(field => ({
      ...field,
      value: localConfig[field.name] ?? '',
      onChange: handleFieldChange(field.name, field.getValue),
      error: errors[field.name] || ''
    })), [localConfig, errors, handleFieldChange]
  );

  const validateForm = useCallback(() => {
    const newErrors = {};
    
    // Validate that a project has been selected
    if (!localConfig.projectKey) {
      newErrors.projectKey = 'Please select a project';
    }

    // Validate other fields
    FIELD_DEFS.forEach(field => {
      if (!field.validate(localConfig[field.name])) {
        newErrors[field.name] = `Invalid value for ${field.label}`;
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [localConfig]);

  
  const projectsOptions = useMemo(() =>
    projects.map(c => ({
      label: c.name,
      value: c.id
    })),
    [projects]);

  const handleSave = useCallback(async () => {
    setFormError('');
    if (!validateForm()) {
      setFormError('Please correct the errors in the form');
      return;
    }
    
    try {
      await onSave(localConfig);
    } catch (error) {
      setFormError(`Error saving: ${error.message || error}`);
    }
  }, [localConfig, onSave, validateForm]);

  return (
    <Modal>
      <ModalHeader>
        <Text size="xlarge">Sprint Configuration</Text>
      </ModalHeader>
      <ModalBody>
        {formError && (
          <Box marginBottom="space.200">
            <SectionMessage appearance="error">
              <Text>{formError}</Text>
            </SectionMessage>
          </Box>
        )}
        
        {projectError && (
          <Box marginBottom="space.200">
            <SectionMessage appearance="error">
              <Text>Error loading projects: {projectError}</Text>
            </SectionMessage>
          </Box>
        )}
        
        <Form>
          <Stack space="space.300">
            {/* Project selector (existing field) */}
            <Box>
              <Text size="medium" weight="bold">Select Jira Project</Text>
              
              {loadingProjects ? (
                <Text>Loading projects...</Text>
              ) : (
                <Select
                  onChange={handleProjectChange}
                  placeholder="Select a project"
                  options={projectsOptions}
                  value={localConfig.projectKey || ''}
                />
              )}
              
              {errors.projectKey && (
                <Box marginTop="space.100">
                  <Text color="danger">{errors.projectKey}</Text>
                </Box>
              )}
            </Box>

            {/* New field: Create Jira issues */}
            <Box>
              <Text size="medium" weight="bold">
                Create Jira issues for selected requirements?
              </Text>
              <Select
                onChange={handleJiraIssueOptionChange}
                placeholder="Select an option"
                options={JIRA_ISSUE_OPTIONS}
                value={localConfig.createJiraIssues || 'no'}
              />
              <Text color="subtlest" marginTop="xsmall">
                If you select "Yes", issues will be created in Jira automatically
              </Text>
            </Box>

            {/* Existing fields - UNCHANGED */}
            {fields.map(field => (
              <Box key={field.name}>
                <Text size="medium" weight="bold">{field.label}</Text>
                <Textfield
                  label={field.label}
                  name={field.name}
                  type={field.type}
                  min={field.min}
                  max={field.max}
                  value={field.value}
                  onChange={e => field.onChange(e.target.value)}
                  isInvalid={!!field.error}
                />
                {field.error && (
                  <Box marginTop="space.100">
                    <Text color="danger">{field.error}</Text>
                  </Box>
                )}
              </Box>
            ))}
          </Stack>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button appearance="primary" onClick={handleSave}>
          Save Configuration
        </Button>
      </ModalFooter>
    </Modal>
  );
});

export default SprintConfigModal;
