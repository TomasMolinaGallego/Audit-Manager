import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ForgeUI, {
    DynamicTable,
    Text,
    Button,
    Spinner,
    Lozenge,
    Stack,
    ButtonGroup,
    Box,
    Modal,
    ModalTransition,
    ModalHeader,
    ModalBody,
    ModalFooter,
    SectionMessage,
    Link,
    Textfield 
} from '@forge/react';
import { invoke } from '@forge/bridge';

const AuditRequirementsList = () => {
    const [state, setState] = useState({
        requirements: [],
        loading: true,
        error: null,
        activeSprint: null,
        showModal: false,
        showSuccessMessage: false
    });
    const [storyPointsModal, setStoryPointsModal] = useState({
        show: false,
        requirement: null,
        newPoints: '',
        loading: false,
        error: null
    });

    const [selected, setSelected] = useState({
        toAudit: [],
        toDelete: null
    });

    const [reqsAuditStatus, setReqsAuditStatus] = useState({
        alreadyAudited: []
    });

    const updateState = useCallback((updates) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    const fetchActiveSprint = useCallback(async () => {
        try {
            updateState({ loading: true, error: null });

            const sprint = await invoke('getActiveSprint');

            if (!sprint?.requirements) {
                updateState({ requirements: [] });
                return;
            }

            const requirements = await invoke('getRequirementsByIds', {
                requirementIds: sprint.requirements
            });

            const alreadyAudited = requirements.filter(
                req => req.nAudit > 0 && req.lastAuditSprint === sprint.sprintNumber
            );

            setReqsAuditStatus({ alreadyAudited });
            updateState({
                requirements,
                activeSprint: sprint,
                error: null
            });

        } catch (err) {
            updateState({ error: 'Error loading requirements' });
            console.error('Error in fetchActiveSprint:', err);
        } finally {
            updateState({ loading: false });
        }
    }, [updateState]);

    useEffect(() => {
        fetchActiveSprint();
    }, [fetchActiveSprint]);

    const handleRemoveRequirement = useCallback(async () => {
        if (!selected.toDelete || !state.activeSprint) return;

        try {
            const { id } = selected.toDelete;

            await invoke('removeRequirementFromSprint', {
                sprintNumber: state.activeSprint.sprintNumber,
                requirementId: id
            });

            updateState(prev => ({
                requirements: prev.requirements.filter(req => req.id !== id)
            }));

            setReqsAuditStatus(prev => ({
                alreadyAudited: prev.alreadyAudited.filter(req => req.id !== id)
            }));

            setSelected(prev => ({ ...prev, toDelete: null }));
            updateState({ showModal: false });

        } catch (err) {
            updateState({ error: `Error removing requirement: ${err.message}` });
        }
    }, [selected.toDelete, state.activeSprint, updateState]);

    const handleSelectReq = useCallback((req) => {
        if (reqsAuditStatus.alreadyAudited.some(r => r.id === req.id)) {
            return;
        }

        setSelected(prev => {
            const isSelected = prev.toAudit.some(r => r.id === req.id);
            return {
                ...prev,
                toAudit: isSelected
                    ? prev.toAudit.filter(r => r.id !== req.id)
                    : [...prev.toAudit, req]
            };
        });
    }, [reqsAuditStatus.alreadyAudited]);

    const handleOpenStoryPointsModal = useCallback((req) => {
        setStoryPointsModal({
            show: true,
            requirement: req,
            newPoints: req.storyPoints?.toString() || '0',
            loading: false,
            error: null
        });
    }, []);

    const handleCloseStoryPointsModal = useCallback(() => {
        setStoryPointsModal({
            show: false,
            requirement: null,
            newPoints: '',
            loading: false,
            error: null
        });
    }, []);

    const handleSaveStoryPoints = useCallback(async (newPoints) => {
        if (!storyPointsModal.requirement) return;

        try {
            setStoryPointsModal(prev => ({ ...prev, loading: true, error: null }));

            const pointsValue = parseInt(newPoints);
            if (isNaN(pointsValue)) {
                throw new Error('Invalid value');
            }

            await invoke('updateRequirementStoryPoints', {
                requirementId: storyPointsModal.requirement.id,
                newStoryPoints: pointsValue
            });

            const requirements = await invoke('getRequirementsByIds', {
                requirementIds: state.activeSprint.requirements
            });
            updateState({ requirements });


            handleCloseStoryPointsModal();
        } catch (err) {
            setStoryPointsModal(prev => ({
                ...prev,
                error: `Error updating: ${err.message || 'Please try again'}`
            }));
        } finally {
            setStoryPointsModal(prev => ({ ...prev, loading: false }));
        }
    }, [storyPointsModal.requirement, updateState, handleCloseStoryPointsModal]);

    const handleConfirmAudit = useCallback(async () => {
        if (!selected.toAudit.length || !state.activeSprint) return;

        try {
            await invoke('markAsAudited', {
                requirementIds: selected.toAudit.map(req => req.id),
                sprintNumber: state.activeSprint.sprintNumber
            });

            setReqsAuditStatus(prev => ({
                alreadyAudited: [...prev.alreadyAudited, ...selected.toAudit]
            }));

            setSelected(prev => ({ ...prev, toAudit: [] }));
            updateState({ showSuccessMessage: true });

        } catch (err) {
            updateState({ error: 'Error confirming audit: ' + err.message });
        }
    }, [selected.toAudit, state.activeSprint, updateState]);

    const HEADERS = useMemo(() => ({
        requirements: {
            cells: [
                { key: "id", content: "ID", isSortable: true },
                { key: "heading", content: "Heading", isSortable: false },
                { key: "text", content: "Text", shouldTruncate: true },
                { key: "type", content: "Importance", shouldTruncate: true },
                { key: "riesgo", content: "Risk", isSortable: true },
                { key: "storyPoints", content: "Story Points", shouldTruncate: true },
                { key: "audited", content: "Mark as audited" },
                { key: "changeStoryPoints", content: "Update story points", shouldTruncate: true },
                { key: "jiraIssueKey", content: "Jira Issue" },
                { key: "deleteFromSprint", content: "Remove from sprint" }
            ]
        }
    }), []);

    const reqRows = useMemo(() => {
        return state.requirements.map(req => {
            const isAudited = reqsAuditStatus.alreadyAudited.some(r => r.id === req.id);
            const isSelected = selected.toAudit.some(r => r.id === req.id);
            const jiraIssueId = state.activeSprint?.requirements
                ?.find(r => (r.id === req.id))?.jiraIssueKey || 'N/A';
            return {
                cells: [
                    { content: req.id },
                    { content: <Text weight="medium">{req.heading}</Text> },
                    { content: req.text },
                    { content: <Lozenge>{req.important}</Lozenge> },
                    { content: <Lozenge>{Math.round(req.riesgo)}</Lozenge> },
                    { content: req.effort || state.activeSprint.puntosHistoriaPorReq + "(Default)" },
                    {
                        content: isAudited
                            ? <Lozenge appearance='success'>Already audited</Lozenge>
                            : <Button
                                appearance={isSelected ? 'primary' : 'default'}
                                onClick={() => handleSelectReq(req)}
                            >
                                {isSelected ? 'Selected as audited' : 'Mark as audited'}
                            </Button>
                    },
                    {
                        content: <Button
                            appearance="default"
                            onClick={() => handleOpenStoryPointsModal(req)}
                        >
                            Update points
                        </Button>
                    }
                    ,
                    {
                        content: (
                            <Text color="subtlest" size="small">
                                <Link href={`${window.location.ancestorOrigins?.[0]}/browse/${jiraIssueId}`} target="_blank">
                                    {jiraIssueId}
                                </Link>
                            </Text>
                        )
                    },
                    {
                        content: isAudited
                            ? <Box></Box>
                            : <Button
                                onClick={() => {
                                    updateState({ showModal: true });
                                    setSelected(prev => ({ ...prev, toDelete: req }));
                                }}
                            >
                                Remove from sprint
                            </Button>
                    }
                ],
                ...(isSelected && { className: 'selected-row' })
            };
        });
    }, [state.requirements, reqsAuditStatus.alreadyAudited, selected.toAudit, handleSelectReq, updateState]);

    const highlightedRowIndex = useMemo(() => {
        return state.requirements.reduce((indexes, req, index) => {
            if (selected.toAudit.some(r => r.id === req.id)) {
                indexes.push(index);
            }
            return indexes;
        }, []);
    }, [state.requirements, selected.toAudit]);

    if (state.loading) {
        return (
            <Stack align="center">
                <Spinner label="Loading requirements..." />
            </Stack>
        );
    }

    if (state.error) {
        return (
            <Lozenge appearance="removed">
                {state.error}
            </Lozenge>
        );
    }

    if (state.requirements.length === 0) {
        return (
            <Text>
                No requirements selected for audit in this sprint
            </Text>
        );
    }

    return (
        <>
            <Box marginBottom="xlarge">
                <DynamicTable
                    head={HEADERS.requirements}
                    rows={reqRows}
                    emptyView={<Text>No requirements found</Text>}
                    highlightedRowIndex={highlightedRowIndex} />

                    <Text>
                        Total points: {
                            state.requirements.reduce(
                                (sum, req) => sum + (parseInt(req.effort || state.activeSprint.puntosHistoriaPorReq || 0, 10)),
                                0
                            )
                        }
                    </Text>

                <ButtonGroup label="Button group">
                    <Button
                        appearance="primary"
                        onClick={handleConfirmAudit}
                        isDisabled={selected.toAudit.length === 0}
                    >
                        Confirm audited requirements
                    </Button>
                </ButtonGroup>

                {state.showModal && (
                    <DeleteRequirementModal
                        requirement={selected.toDelete}
                        onSave={handleRemoveRequirement}
                        onClose={() => {
                            updateState({ showModal: false });
                            setSelected(prev => ({ ...prev, toDelete: null }));
                        }}
                    />
                )}

                {state.showSuccessMessage && (
                    <SectionMessage appearance="success">
                        <Text>Successfully registered audited requirements</Text>
                    </SectionMessage>
                )}
            </Box>
            {storyPointsModal.show && (
                <UpdateStoryPointsModal
                    requirement={storyPointsModal.requirement}
                    onClose={handleCloseStoryPointsModal}
                    onSave={handleSaveStoryPoints}
                    loading={storyPointsModal.loading}
                    error={storyPointsModal.error}
                />
            )}
        </>
    );
};

const DeleteRequirementModal = ({ requirement, onClose, onSave }) => {
    return (
        <ModalTransition>
            <Modal onClose={onClose}>
                <ModalHeader>
                    <Text color="subtlest" weight="bold">
                        Are you sure you want to remove this requirement from the current sprint?
                    </Text>
                </ModalHeader>
                <ModalBody>
                    <Text size="xlarge" weight="bold">
                        {requirement?.id} {requirement?.heading} - {requirement?.text}
                    </Text>
                </ModalBody>
                <ModalFooter>
                    <ButtonGroup label="Button group">
                        <Button appearance="primary" onClick={onSave}>
                            Confirm
                        </Button>
                        <Button onClick={onClose}>Cancel</Button>
                    </ButtonGroup>
                </ModalFooter>
            </Modal>
        </ModalTransition>
    );
};

export default AuditRequirementsList;

const UpdateStoryPointsModal = ({ requirement, onClose, onSave, loading, error }) => {
    const [points, setPoints] = useState(requirement?.storyPoints?.toString() || '0');

    return (
        <ModalTransition>
            <Modal onClose={onClose}>
                <ModalHeader>
                    Update story points
                </ModalHeader>
                <ModalBody>
                    <Text>ID: {requirement?.id}</Text>
                    <Text>Requirement: {requirement?.heading}</Text>

                    <Box paddingTop="large">
                        <Text>New story points:</Text>
                        <Textfield
                            type="number"
                            value={points}
                            onChange={(e) => setPoints(e.target.value)}
                        />
                    </Box>

                    {error && (
                        <SectionMessage appearance="error">
                            <Text>{error}</Text>
                        </SectionMessage>
                    )}
                </ModalBody>
                <ModalFooter>
                    <ButtonGroup>
                        <Button
                            appearance="primary"
                            onClick={() => onSave(points)}
                            loading={loading}
                            disabled={loading}
                        >
                            Save
                        </Button>
                        <Button onClick={onClose} disabled={loading}>
                            Cancel
                        </Button>
                    </ButtonGroup>
                </ModalFooter>
            </Modal>
        </ModalTransition>
    );
};