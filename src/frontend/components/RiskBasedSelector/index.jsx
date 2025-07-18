import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Stack,
    Heading,
    Button,
    SectionMessage,
    Spinner,
    Text,
    Box,
    Inline,
    Select,
    Lozenge
} from '@forge/react';
import { invoke, requestJira } from '@forge/bridge';
import RequirementNode from '../RequirementNode';

const RiskBasedRequirementSelector = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showSuccessMessage, setShowSuccessMessage] = useState(false);
    const [catalogs, setCatalogs] = useState([]);
    const [requirements, setRequirements] = useState([]);
    const [sprintConfig, setSprintConfig] = useState({
        sprintNumber: 0,
        sprintCapacity: 0,
        puntosHistoriaPorReq: 0,
        factorConfianza: 0,
        competenciaEquipo: 0,
        factorTecnologico: 0,
        teamSize: 0,
        sprintDuration: 0,
        requirements: [],
    });
    const [projectKey, setProjectKey] = useState(null);
    const [isJiraIssuesEnabled, setIsJiraIssuesEnabled] = useState(false);
    const [selectedCatalog, setSelectedCatalog] = useState(null);
    const [activeSprintData, setActiveSprintData] = useState(null);
    const [isActiveSprint, setIsActiveSprint] = useState(true);

    const [areRisksCalculated, setAreRisksCalculated] = useState(false);
    const [selection, setSelection] = useState({
        reqsToAudit: [],
        selectedRequirements: []
    });
    const [currentPoints, setCurrentPoints] = useState(0);

    const catalogOptions = useMemo(() =>
        catalogs.map(c => ({
            label: c.title,
            value: c.id
        })),
        [catalogs]);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                setLoading(true);

                const [config, activeSprint] = await Promise.all([
                    invoke('getSprintConfig'),
                    invoke('getActiveSprint')
                ]);

                setIsActiveSprint(config.isDefault !== true);

                const catalogsData = await invoke('getAllCatalogs');
                setCatalogs(catalogsData || []);

                setSprintConfig(config);
                console.log("Sprint Config:", config);
                setProjectKey(config.projectKey?.value);
                setIsJiraIssuesEnabled(config.createJiraIssues?.value === "yes");
                console.log("Project Key:", config.projectKey?.value);

                if (activeSprint) {
                    setActiveSprintData({
                        sprintNumber: activeSprint.sprintNumber,
                        sprintCapacity: activeSprint.sprintCapacity,
                        puntosHistoriaPorReq: activeSprint.puntosHistoriaPorReq,
                        factorConfianza: activeSprint.factorConfianza,
                        competenciaEquipo: activeSprint.competenciaEquipo,
                        factorTecnologico: activeSprint.factorTecnologico,
                        requirements: activeSprint.requirements || []
                    });
                    calculateCurrentPoints(activeSprint)
                }
            } catch (err) {
                setError(`Error loading initial data: ${err.message || err}`);
            } finally {
                setLoading(false);
            }
        };

        loadInitialData();
    }, []);

    const updateRequirementInTree = useCallback((nodes, updatedReq) => {
        return nodes.map(node => {
            if (node.id === updatedReq.id) {
                return { ...node, ...updatedReq };
            }
            if (node.children) {
                return {
                    ...node,
                    children: updateRequirementInTree(node.children, updatedReq)
                };
            }
            return node;
        });
    }, []);

    const removeRequirementFromTree = useCallback((nodes, requirementId) => {
        return nodes.filter(node => {
            if (node.id === requirementId) {
                return false; // Remove this node
            }
            if (node.children) {
                node.children = removeRequirementFromTree(node.children, requirementId);
            }
            return true;
        });
    }, []);

    const deleteRequirement = async (requirementId) => {
        try {
            setLoading(true);
            await invoke('deleteRequirement', { requirementId, catalogId: selectedCatalog.id });

            setRequirements(prev => removeRequirementFromTree(prev, requirementId));
            setSelection(prev => ({
                ...prev,
                selectedRequirements: prev.selectedRequirements.filter(req => req.id !== requirementId),
                reqsToAudit: prev.reqsToAudit.filter(req => req.id !== requirementId)
            }));

            setShowSuccessMessage(true);
            setTimeout(() => setShowSuccessMessage(false), 3000);
        } catch (err) {
            setError(`Error deleting requirement: ${err.message || err}`);
        } finally {
            setLoading(false);
        }
    };

    const updateRequirement = useCallback(async (updatedReq) => {
        try {
            setLoading(true);
            await invoke('updateRequirement', { id: updatedReq.id, heading: updatedReq.heading, text: updatedReq.text, important: updatedReq.important });
            setRequirements(prev => updateRequirementInTree(prev, updatedReq));
            setSelection(prev => {
                const newSelectedRequirements = prev.selectedRequirements.map(req =>
                    req.id === updatedReq.id ? updatedReq : req
                );
                const newReqsToAudit = prev.reqsToAudit.map(req =>
                    req.id === updatedReq.id ? updatedReq : req
                );
                return {
                    ...prev,
                    selectedRequirements: newSelectedRequirements,
                    reqsToAudit: newReqsToAudit
                };
            });
        } catch (err) {
            setError(`Error updating requirement: ${err.message || err}`);
        } finally {
            setLoading(false);
        }
    }, [updateRequirementInTree]);

    const handleCatalogChange = useCallback(async ({ value }) => {
        const selectedCatalog = catalogs.find(c => c.id === value);
        setSelectedCatalog(selectedCatalog);
        setSelection(prev => ({
            ...prev,
            selectedCatalog,
            selectedRequirements: []
        }));
        const updatedHierarchy = await invoke('getRequirementHierarchy', {
            catalogId: selectedCatalog.id
        });
        setRequirements(updatedHierarchy || []);
    }, [catalogs]);


    const addRequirementToAudit = useCallback((requirement) => {
        setSelection(prev => {
            const isSelected = prev.reqsToAudit.some(req => req.id === requirement.id);
            setCurrentPoints(points =>
                isSelected
                    ? points - sprintConfig.puntosHistoriaPorReq
                    : points + sprintConfig.puntosHistoriaPorReq
            );
            return {
                ...prev,
                reqsToAudit: isSelected
                    ? prev.reqsToAudit.filter(req => req.id !== requirement.id)
                    : [...prev.reqsToAudit, requirement]
            };
        });
    }, [sprintConfig.puntosHistoriaPorReq]);

    const createJiraIssues = async (requirements) => {
        if (!isJiraIssuesEnabled) {
            return [];
        }
        console.log("sprintConfig:", sprintConfig);
        const createdIssues = [];
        const updatedRequirements = [];
        for (const requirement of requirements) {
            try {
                const adfDescription = {
                    version: 1,
                    type: "doc",
                    content: [{
                        type: "paragraph",
                        content: [{
                            type: "text",
                            text: requirement.text || "Requirement selected for risk-based audit."
                        }]
                    }]
                };
                console.log("id del proyecto:", projectKey);
                // 4. Usar ID del proyecto en lugar de la clave
                const response = await requestJira('/rest/api/3/issue', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        fields: {
                            project: {
                                id: projectKey  // Usar ID en lugar de key
                            },
                            summary: requirement.heading,
                            description: adfDescription,
                            issuetype: { name: 'Historia' }
                        }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    createdIssues.push(data.key);
                    console.log("Issue created:", updatedRequirements);
                    // Actualizar el requisito con la clave del issue de Jira
                    requirement.jiraIssueKey = data.key;
                    updatedRequirements.push({ ...requirement, jiraIssueKey: data.key });
                } else {
                    updatedRequirements.push(requirement);
                }
            } catch (error) {
                console.error(`Error creating issue for ${requirement.id}:`, error);
                updatedRequirements.push(requirement);
            }
        }

        return createdIssues;
    };

    const addRequirementToSprint = useCallback(async () => {
        if (!selection.reqsToAudit.length) return;

        try {
            setLoading(true);
            const createdIssues = await createJiraIssues(selection.reqsToAudit);

            const sprint = {
                ...sprintConfig,
                isActive: true,
                requirements: selection.reqsToAudit.map(req => ({
                    id: req.id,
                    jiraIssueKey: req.jiraIssueKey,
                    effort: req.effort || sprintConfig.puntosHistoriaPorReq,
                    risk: req.riesgo || 0,
                    important: req.important || 0,
                    heading: req.heading,
                    text: req.text,
                }))
            };
            console.log("Sprint data to save:", sprint);
            await invoke('saveSprint', sprint);

            setActiveSprintData(sprint);
            setShowSuccessMessage(true);
            setAreRisksCalculated(false);

            setSelection(prev => ({
                ...prev,
                selectedRequirements: [],
                reqsToAudit: []
            }));

            if (createdIssues.length > 0) {
                alert(`Created ${createdIssues.length} issues: ${createdIssues.join(', ')}`);
            }

            setTimeout(() => setShowSuccessMessage(false), 3000);
        } catch (err) {
            setError(`Error saving sprint: ${err.message || err}`);
        } finally {
            setLoading(false);
        }
    }, [sprintConfig, selection.reqsToAudit, createJiraIssues]);

    const calculateRisks = async () => {
        if (!isActiveSprint) return;

        try {
            setLoading(true);
            setError(null);
            console.log('Calculating risks for catalog:', selectedCatalog);
            if (selection.selectedCatalog) {
                console.log('Calculating risks for catalog:', selectedCatalog.id);
                await invoke('calculateRisksByCatalog', {
                    catalogId: selectedCatalog.id,
                    sprintActual: sprintConfig.sprintNumber,
                });

                const updatedHierarchy = await invoke('getRequirementHierarchy', {
                    catalogId: selectedCatalog.id
                });
                console.log('Updated hierarchy:', updatedHierarchy);
                setRequirements(updatedHierarchy || []);
            } else {
                console.log('Calculating risks for all catalogs');
                await invoke('calculateRisksAllCatalogs', {
                    sprintActual: sprintConfig.sprintNumber,
                });
            }
            const catalogsData = await invoke('getAllCatalogs');
            setCatalogs(catalogsData || []);
            setAreRisksCalculated(true);
            setSelection(prev => ({ ...prev, selectedRequirements: [] }));
        } catch (err) {
            setError(`Error calculating risks: ${err.message || err}`);
        } finally {
            setLoading(false);
        }
    };

    const selectForAudit = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const reqsToAvoid = activeSprintData?.requirements?.map(req => req.id) || [];
            const result = selection.selectedCatalog
                ? await invoke('selectRequirementsForAudit', {
                    catalogId: selection.selectedCatalog.id,
                    sprintCapacity: sprintConfig.sprintCapacity,
                    puntosHistoriaPorReq: sprintConfig.puntosHistoriaPorReq,
                    reqsToAvoid
                })
                : await invoke('getAllRequirementsByRisk', { reqsToAvoid });

            setSelection(prev => ({
                ...prev,
                selectedRequirements: result.selectedRequirements || []
            }));
        } catch (err) {
            setError(`Error selecting requirements: ${err.message || err}`);
        } finally {
            setLoading(false);
        }
    }, [selection.selectedCatalog, sprintConfig, activeSprintData]);

    const handleSelectAllRequirements = useCallback(() => {
        setSelection(prev => ({
            ...prev,
            reqsToAudit: prev.reqsToAudit.length === 0
                ? prev.selectedRequirements
                : []
        }));
    }, []);

    const handleShowAllRequirements = useCallback(() => {
        setSelection({
            selectedCatalog: null,
            reqsToAudit: [],
            selectedRequirements: []
        });
        setRequirements([]);
        setError(null);
        setShowSuccessMessage(false);
        setAreRisksCalculated(false);
    }, []);

    const calculateCurrentPoints = useCallback((activeSprint) => {

        invoke('getRequirementsByIds', {
            requirementIds: activeSprint.requirements
        }).then(res => {
            let currentSprintPoints = 0;
            res.forEach(req => {
                if (req && req.effort && req.effort !== undefined && req.effort !== null && req.effort > 0) {
                    currentSprintPoints += req.effort;
                } else {
                    currentSprintPoints += activeSprint.puntosHistoriaPorReq;
                }
            });
            setCurrentPoints(currentSprintPoints);
        });
    }, [sprintConfig.puntosHistoriaPorReq]);

    const capacityPercentage = useMemo(() =>
        sprintConfig.sprintCapacity > 0
            ? currentPoints / sprintConfig.sprintCapacity
            : 0,
        [currentPoints, sprintConfig.sprintCapacity]);

    const capacityBackground = useMemo(() =>
        capacityPercentage > 1
            ? 'var(--ds-background-danger)'
            : 'var(--ds-background-selected)',
        [capacityPercentage]);

    const MemoizedRequirementNode = React.memo(RequirementNode);

    return (
        <Stack space="space.400">
            <Heading level="h800">Risk-based Requirement Selection</Heading>
            <Inline spread="space-between">
                <Text>Current sprint: #{sprintConfig.sprintNumber}</Text>
                <Text>Sprint velocity: {sprintConfig.sprintCapacity} points</Text>
                <Text>Team members: {sprintConfig.teamSize}</Text>
                <Text>Sprint duration: {sprintConfig.sprintDuration}</Text>
            </Inline>

            {error && (
                <SectionMessage appearance="error">
                    <Text>{error}</Text>
                </SectionMessage>
            )}

            <Box padding="space.200" border="1px solid var(--ds-border)" borderRadius="border.radius.200">
                <Inline spread="space-between">
                    <Button
                        appearance="primary"
                        onClick={calculateRisks}
                        isDisabled={loading || !isActiveSprint}
                    >
                        Calculate Risks
                    </Button>

                    <Button
                        appearance="primary"
                        onClick={selectForAudit}
                        isDisabled={loading || !areRisksCalculated}
                    >
                        Create automatic requirement proposal for Audit
                    </Button>
                </Inline>
            </Box>

            {!isActiveSprint && (
                <SectionMessage appearance='error'>
                    <Text>Attention! There is no configuration for the sprint. Please configure it in its corresponding window.</Text>
                </SectionMessage>
            )}

            <Box backgroundColor="var(--ds-background-neutral)" padding="space.200" borderRadius="border.radius.200">
                <Stack space="space.200">
                    <Heading level="h600">Select Catalog</Heading>
                    <Select
                        onChange={handleCatalogChange}
                        placeholder="Select a catalog"
                        options={catalogOptions}
                    />
                </Stack>
            </Box>

            <Button
                isDisabled={selection.selectedCatalog === null}
                appearance="primary"
                onClick={handleShowAllRequirements}
            >
                Select all catalogs for risk calculation
            </Button>

            <Text weight='bold'>
                {selection.selectedCatalog === null
                    ? "All system catalogs are selected for risk calculation"
                    : ""}
            </Text>

            <Text weight='bold'>
                {selection.selectedCatalog === null && areRisksCalculated
                    ? "Risks have been calculated for all system requirements"
                    : ""}
            </Text>

            {loading ? (
                <Box display="flex" justifyContent="center" padding="space.400">
                    <Spinner size="large" />
                </Box>
            ) : requirements.length > 0 && selection.selectedRequirements.length === 0 ? (

                <Box
                    border="1px solid var(--ds-border)"
                    borderRadius="border.radius.200"
                    padding="space.200"
                    maxHeight="600px"
                    overflow="auto"
                >
                    <Stack space="space.200">
                        {requirements.map(req => {
                            const isAdded = selection.reqsToAudit.some(r => r.id === req.id);
                            return (
                                <Box
                                    key={req.id}
                                    backgroundColor={isAdded
                                        ? 'color.background.success' : 'color.background.neutral.subtle'}
                                    padding="space.100"
                                    borderRadius="border.radius.100"
                                >
                                    <MemoizedRequirementNode
                                        requirement={req}
                                        editable={true}
                                        onSave={updateRequirement}
                                        onDelete={deleteRequirement}
                                    />
                                </Box>
                            );
                        })}
                    </Stack>
                </Box>
            ) : null}

            {/* Selected requirements panel */}
            {selection.selectedRequirements.length > 0 && (
                <>
                    <Box backgroundColor={capacityBackground} padding="space.200">
                        <Text>
                            {sprintConfig.sprintCapacity} Sprint Velocity (points) |
                            {sprintConfig.puntosHistoriaPorReq} points per requirement
                        </Text>
                        <Text>
                            Number of selected requirements: <Lozenge>{selection.reqsToAudit.length}</Lozenge> |
                            Points used: <Lozenge>{currentPoints}/{sprintConfig.sprintCapacity}</Lozenge>
                        </Text>
                    </Box>

                    <Button
                        isDisabled={selection.reqsToAudit.length === 0}
                        onClick={addRequirementToSprint}
                        appearance="primary"
                        shouldFitContainer
                    >
                        Confirm requirements for the sprint
                    </Button>

                    <Button
                        onClick={handleSelectAllRequirements}
                        appearance="secondary"
                        shouldFitContainer
                    >
                        <Text>
                            {selection.reqsToAudit.length === 0
                                ? "Select all proposed requirements for audit"
                                : "Deselect all requirements"}
                        </Text>
                    </Button>

                    {showSuccessMessage && (
                        <SectionMessage appearance="success">
                            <Text>Requirements successfully registered</Text>
                        </SectionMessage>
                    )}

                    <Box border="1px solid var(--ds-border)" padding="space.200" borderRadius="border.radius.200">
                        <Heading level="h600">Requirements Selected for Audit</Heading>
                        <Stack space="space.200">
                            {selection.selectedRequirements.map(req => {
                                const isAdded = selection.reqsToAudit.some(r => r.id === req.id);
                                return (
                                    <Box
                                        key={req.id}
                                        backgroundColor={isAdded
                                            ? 'color.background.success' : 'color.background.neutral.subtle'}
                                        padding="space.100"
                                        borderRadius="border.radius.100"
                                    >
                                        <MemoizedRequirementNode
                                            key={req.id}
                                            requirement={req}
                                            editable={areRisksCalculated}
                                            onSave={updateRequirement}
                                            onDelete={deleteRequirement}
                                        />
                                        <Button
                                            shouldFitContainer
                                            onClick={() => addRequirementToAudit(req)}
                                        >
                                            {isAdded ? 'Remove from list' : 'Add to audit requirement list'}
                                        </Button>
                                    </Box>
                                );
                            })}
                        </Stack>
                        <Text weight="bold" marginTop="space.200">
                            Total: {selection.selectedRequirements.length} requirements |
                            Points used: {selection.selectedRequirements.length * sprintConfig.puntosHistoriaPorReq}/
                            {sprintConfig.sprintCapacity}
                        </Text>
                    </Box>
                </>
            )}
        </Stack>
    );
};

export default RiskBasedRequirementSelector;