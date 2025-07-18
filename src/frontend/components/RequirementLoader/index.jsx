import React, { useState, useCallback } from 'react';
import {
  Stack,
  Heading,
  Button,
  SectionMessage,
  SectionMessageAction,
  Spinner,
  Tag,
  Text,
  Box,
  TextArea,
} from '@forge/react';
import { invoke } from '@forge/bridge';

// --- Headers de CSV ---
const REQUIRED_HEADERS = ['id', 'level', 'section', 'heading', 'text', 'important', 'dependencies'];

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ';' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must contain at least 2 lines (headers + data)');
  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`);

  return lines.slice(1).reduce((items, line, idx) => {
    if (!line.trim()) return items;
    const values = parseCSVLine(line.trim());
    if (values.length !== headers.length)
      throw new Error(`Line ${idx + 2}: Incorrect number of fields`);
    const item = Object.fromEntries(headers.map((h, i) => [h, values[i].trim()]));
    const level = parseInt(item.level, 10);
    if (isNaN(level)) throw new Error(`Line ${idx + 2}: 'level' must be a number`);
    items.push({
      id: item.id,
      level,
      section: item.section,
      heading: item.heading,
      text: item.text,
      dependencies: item.dependencies ? item.dependencies.split(',').map(d => d.trim()) : [],
      children: [],
      important: parseInt(item.important, 10),
    });
    return items;
  }, []);
}

function buildHierarchy(items) {
  const map = new Map();
  items.forEach(item => map.set(item.section, { ...item }));
  const roots = [];
  map.forEach((item, section) => {
    const parentSection = section.split('.').slice(0, -1).join('.');
    if (parentSection && map.has(parentSection)) {
      map.get(parentSection).children.push(item);
    } else {
      roots.push(item);
    }
  });
  const sortBySection = (a, b) => a.section.localeCompare(b.section);
  const sortTree = nodes => nodes.sort(sortBySection).forEach(n => sortTree(n.children));
  sortTree(roots);
  return roots;
}

function countRequirements(nodes) {
  return nodes.reduce((count, node) => count + 1 + countRequirements(node.children), 0);
}

const RequirementNode = ({ requirement, depth = 0 }) => (
  <Box padding="space.0" marginBottom="space.100">
    <Box
      padding="space.200"
      borderRadius="border.radius.200"
      backgroundColor="color.background.neutral"
      style={{
        marginLeft: depth ? `${depth * 20}px` : 0,
        borderLeft: depth ? '2px solid var(--ds-border)' : 'none',
      }}
    >
      <Stack space="space.100">
        <Box display="flex" alignItems="center" gap="space.100">
          <Tag text={requirement.section} appearance="primary" />
          <Text fontWeight="bold">{requirement.heading || "Untitled"}</Text>
        </Box>
        {requirement.text && (
          <Text color="color.text.subtle" whiteSpace="pre-wrap">{requirement.text}</Text>
        )}
        <Box display="flex" gap="space.100" wrap="wrap">
          <Tag text={`ID: ${requirement.id}`} />
          <Tag text={`Level: ${requirement.level}`} />
          {requirement.dependencies.length > 0 && (
            <Tag text={`Dependencies: ${requirement.dependencies.join(', ')}`} />
          )}
        </Box>
      </Stack>
    </Box>
    <Stack space="space.100">
      {requirement.children.map(child => (
        <RequirementNode key={child.id} requirement={child} depth={depth + 1} />
      ))}
    </Stack>
  </Box>
);

const CSVRequirementsLoader = ({ catalogId, onSuccess }) => {
  const [requirements, setRequirements] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [catalogName, setCatalogName] = useState('');

  const handleProcessCSV = useCallback(() => {
    setError(null);
    setSaveStatus(null);
    setLoading(true);
    try {
      const items = parseCSV(csvText);
      const hierarchy = buildHierarchy(items);
      setRequirements(hierarchy);
      setShowPreview(true);
    } catch (err) {
      setError(`Error processing CSV: ${err.message}`);
      setRequirements([]);
      setShowPreview(false);
    } finally {
      setLoading(false);
    }
  }, [csvText]);

  const handleSaveRequirements = useCallback(async () => {
    if (!requirements.length) {
      setError('There are no valid requirements to save');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      console.log('Saving requirements:', requirements);
      const result = await invoke('importRequirementsFromCustomCSV', {
        catalogId,
        catalogName,
        requirements,
      });
      setSaveStatus({
        success: result.success > 0,
        message: result.success > 0
          ? `${result.success} requirements imported successfully!`
          : 'Error importing requirements',
      });
      if (result.success > 0 && onSuccess) onSuccess();
    } catch (err) {
      setError(`Connection error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [catalogId, catalogName, requirements, onSuccess]);

  const resetState = () => {
    setCsvText('');
    setRequirements([]);
    setShowPreview(false);
    setError(null);
    setSaveStatus(null);
    setCatalogName('');
  };

  const totalRequirements = countRequirements(requirements);

  return (
    <Stack space="space.400">
      <Heading level="h600">Import Requirements from CSV</Heading>
      <Text>
        Required format: Semicolon (;) separated with columns: id, level, section, heading, text, important.
      </Text>
      <Box border="1px solid" borderColor="color.border" borderRadius="border.radius.200" padding="space.200">
        <Stack space="space.200">
          <TextArea
            value={catalogName}
            onChange={e => setCatalogName(e.target.value)}
            placeholder="Catalog name..."
            resize="vertical"
            appearance="standard"
            isMonospaced
            rows={1}
          />
          <TextArea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            placeholder="Paste your CSV here..."
            resize="vertical"
            appearance="standard"
            isMonospaced
            rows={10}
          />
          <Box display="flex" gap="space.200">
            <Button
              iconBefore="code"
              appearance="primary"
              onClick={handleProcessCSV}
              isDisabled={loading || !csvText.trim() || !catalogName.trim()}
            >
              {loading ? 'Processing...' : 'Process CSV'}
            </Button>
            <Button appearance="subtle" onClick={resetState}>Reset</Button>
          </Box>
        </Stack>
      </Box>
      {loading && (
        <Box display="flex" alignItems="center" gap="space.200">
          <Spinner size="medium" />
          <Text>Processing CSV content...</Text>
        </Box>
      )}
      {error && (
        <SectionMessage appearance="error" title="CSV Error">
          <Text>{error}</Text>
          <SectionMessageAction>
            <Button appearance="link" onClick={() => setError(null)}>OK</Button>
          </SectionMessageAction>
        </SectionMessage>
      )}
      {saveStatus && (
        <SectionMessage
          appearance={saveStatus.success ? "success" : "error"}
          title={saveStatus.success ? "Import Successful" : "Import Error"}
        >
          <Text>{saveStatus.message}</Text>
          {saveStatus.success && (
            <SectionMessageAction>
              <Button appearance="link" onClick={resetState}>Continue</Button>
            </SectionMessageAction>
          )}
        </SectionMessage>
      )}
      {showPreview && requirements.length > 0 && (
        <Box
          border="1px solid"
          borderColor="color.border"
          borderRadius="border.radius.200"
          padding="space.200"
          overflow="auto"
          maxHeight="500px"
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom="space.200">
            <Heading level="h500">Requirements Preview</Heading>
            <Tag
              text={`${totalRequirements} requirements`}
              appearance={totalRequirements > 0 ? "success" : "removed"}
            />
          </Box>
          <Box marginTop="space.300" display="flex" justifyContent="flex-end">
            <Button
              appearance="primary"
              onClick={handleSaveRequirements}
              isDisabled={loading || totalRequirements === 0}
            >
              {loading ? 'Saving...' : 'Import to Catalog'}
            </Button>
          </Box>
          <Stack space="space.200">
            {requirements.map(req => (
              <RequirementNode key={req.id} requirement={req} />
            ))}
          </Stack>
        </Box>
      )}
      {showPreview && requirements.length === 0 && !loading && (
        <SectionMessage appearance="info" title="No requirements processed">
          <Text>The CSV does not contain valid requirements to display</Text>
        </SectionMessage>
      )}
    </Stack>
  );
};

export default CSVRequirementsLoader;
