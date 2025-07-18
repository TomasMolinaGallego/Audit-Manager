import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stack,
  Heading,
  Button,
  SectionMessage,
  Spinner,
  Tag,
  Text,
  Box,
  Inline,
  Select,
  Pressable
} from '@forge/react';
import { invoke } from '@forge/bridge';

const StoredCSVRequirementsViewer = () => {
  const [catalogs, setCatalogs] = useState([]);
  const [selectedCatalog, setSelectedCatalog] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingRequirements, setLoadingRequirements] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState({});

  useEffect(() => {
    const fetchCatalogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await invoke('getAllCatalogs');
        setCatalogs(data || []);
      } catch (err) {
        setError(`Error al cargar catálogos: ${err.message || err}`);
      } finally {
        setLoading(false);
      }
    };
    fetchCatalogs();
  }, []);

  useEffect(() => {
    if (!selectedCatalog) {
      setRequirements([]);
      return;
    }
    const loadRequirements = async () => {
      setLoadingRequirements(true);
      setError(null);
      setExpandedNodes({});
      try {
        const hierarchy = await invoke('getRequirementHierarchy', {
          catalogId: selectedCatalog.id
        });
        console.log('Loaded requirements:', hierarchy);
        setRequirements(hierarchy || []);
      } catch (err) {
        setError(`Error al cargar requisitos: ${err.message || err}`);
        setRequirements([]);
      } finally {
        setLoadingRequirements(false);
      }
    };
    loadRequirements();
  }, [selectedCatalog]);

  const toggleNode = useCallback((nodeId) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  }, []);

  const RequirementNode = useCallback(({ requirement, depth = 0 }) => {
    const isExpanded = expandedNodes[requirement.id] ?? (depth < 2);
    const hasChildren = Array.isArray(requirement.children) && requirement.children.length > 0;
    const indent = depth * 16;

    return (
      <Box
        padding="space.0"
        marginBottom="space.100"
        style={{
          marginLeft: `${indent}px`,
          borderLeft: depth > 0 ? "2px solid var(--ds-border)" : "none"
        }}
      >
        <Pressable
          onClick={() => hasChildren && toggleNode(requirement.id)}
          padding="space.200"
          borderRadius="border.radius.200"
          backgroundColor={!isExpanded ? "var(--ds-background-neutral)" : "transparent"}
          hoverBackgroundColor={hasChildren ? "var(--ds-background-neutral-hovered)" : undefined}
          style={{
            cursor: hasChildren ? 'pointer' : 'default',
            transition: 'background-color 0.2s'
          }}
        >
          <Stack space="space.100">
            <Inline alignBlock="center" spread="space-between">
              <Box display="flex" alignItems="center" gap="space.100">
                <Text fontWeight="bold" color="var(--ds-text)">
                  {requirement.section}
                </Text>
                <Text fontWeight="bold">
                  {requirement.heading || "Sin título"}
                </Text>
              </Box>
              {hasChildren && (
                <Button
                  appearance="subtle"
                  iconAfter={isExpanded ? "chevron-up" : "chevron-down"}
                  onClick={e => {
                    toggleNode(requirement.id);
                    e.stopPropagation();
                  }}
                />
              )}
            </Inline>
            {requirement.text && (
              <Text color="var(--ds-text-subtle)" whiteSpace="pre-wrap">
                {requirement.text}
              </Text>
            )}
            <Box display="flex" gap="space.100" wrap="wrap">
              <Tag text={`ID: ${requirement.id}`} />
              <Tag text={`Nivel: ${requirement.level}`} />
            </Box>
          </Stack>
        </Pressable>
        {isExpanded && hasChildren && (
          <Stack space="space.100">
            {requirement.children.map(child => (
              <RequirementNode
                key={child.id}
                requirement={child}
                depth={depth + 1}
              />
            ))}
          </Stack>
        )}
      </Box>
    );
  }, [expandedNodes, toggleNode, selectedCatalog]);

  const catalogOptions = useMemo(() =>
    catalogs.map(c => ({
      label: `${c.title}`,
      value: c.id
    })), [catalogs]);

  const handleCatalogChange = useCallback((option) => {
    const catalog = catalogs.find(c => c.id === option.value);
    console.log('Selected catalog:', catalog);
    setSelectedCatalog(catalog || null);
  }, [catalogs]);

  if (loading) {
    return (
      <Box padding="space.400" display="flex" justifyContent="center">
        <Spinner size="large" />
      </Box>
    );
  }

  return (
    <Box padding="space.400">
      <Stack space="space.300">
        <Heading size="large">Catálogo de Requisitos</Heading>
        {error && (
          <SectionMessage appearance="error" title="Error">
            {error}
          </SectionMessage>
        )}
        <Select
          options={catalogOptions}
          placeholder="Selecciona un catálogo"
          onChange={handleCatalogChange}
          value={selectedCatalog ? { label: `${selectedCatalog.title}`, value: selectedCatalog.id } : null}
        />
        {loadingRequirements ? (
          <Box padding="space.400" display="flex" justifyContent="center">
            <Spinner />
          </Box>
        ) : (
          <Stack space="space.200">
            {requirements.length === 0 && selectedCatalog && (
              <SectionMessage appearance="info">
                No hay requisitos para este catálogo.
              </SectionMessage>
            )}
            {requirements.map(req => (
              <RequirementNode key={req.id} requirement={req} />
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
};

export default StoredCSVRequirementsViewer;