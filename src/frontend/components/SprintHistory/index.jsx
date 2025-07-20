import React, { useState, useEffect } from 'react';
import ForgeUI, {
    DynamicTable,
    Text,
    Button,
    Spinner,
    Lozenge,
    Stack,
    Inline,
    Box,
    Link
} from '@forge/react';
import { invoke } from '@forge/bridge';

const HEADERS = {
    requirements: {
        cells: [
            { key: "id", content: "ID", isSortable: true },
            { key: "heading", content: "Heading", isSortable: false },
            { key: "text", content: "Text", shouldTruncate: true },
            { key: "type", content: "Importance", shouldTruncate: true },
            { key: "riesgo", content: "Risk", isSortable: true },
            { key: "storyPoints", content: "Story Points", shouldTruncate: true },
            { key: "audited", content: "Mark Audited" },
            { key: "jiraIssue", content: "Jira Issue" }
        ]
    }
};

const SprintHistory = () => {
    const [requirements, setRequirements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sprintConfig, setSprintConfig] = useState({});
    const [allSprints, setAllSprints] = useState([]);

    const fetchAllSprints = async () => {
        setLoading(true);
        setError(null);
        try {
            const sprints = await invoke('getAllSprints');
            if (!Array.isArray(sprints) || sprints.length === 0) {
                setAllSprints([]);
                setRequirements([]);
                setLoading(false);
                return;
            }

            const sprintsWithRequirements = sprints.map(sprint => ({
                ...sprint,
                requirementsData: sprint.requirements || []
            }));

            setAllSprints(sprintsWithRequirements);

            const lastSprint = sprintsWithRequirements.find(s => s.isActive) || sprintsWithRequirements[sprintsWithRequirements.length - 1];

            setSprintConfig({
                sprintNumber: lastSprint?.sprintNumber,
                sprintCapacity: lastSprint?.sprintCapacity,
                puntosHistoriaPorReq: lastSprint?.puntosHistoriaPorReq,
                teamSize: lastSprint?.teamSize,
                sprintDuration: lastSprint?.sprintDuration
            });

            setRequirements(lastSprint?.requirementsData || []);
        } catch (err) {
            setError('Error loading sprints');
            setAllSprints([]);
            setRequirements([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllSprints();
    }, []);

    const reqRows = requirements.map(req => ({
        cells: [
            { content: req.id },
            { content: <Text weight="medium">{req.heading}</Text> },
            { content: req.text },
            { content: <Lozenge>{req.important}</Lozenge> },
            { content: <Lozenge>{Math.round(req.risk)}</Lozenge> },
            { content: req.effort || `${sprintConfig.puntosHistoriaPorReq} (Default)` },
            {
                content:
                    req.nAudit > 0 && req.lastAuditSprint === sprintConfig.sprintNumber
                        ? <Lozenge appearance="success">Audited</Lozenge>
                        : <Lozenge appearance="removed">Not Audited</Lozenge>
            },
            {
                content: (
                    <Text color="subtlest" size="small">
                        <Link href={`${window.location.ancestorOrigins?.[0]}/browse/${req.jiraIssueKey}`} target="_blank">
                            {req.jiraIssueKey}
                        </Link>
                    </Text>
                )
            }
        ]
    }));

    if (loading) {
        return (
            <Stack align="center">
                <Spinner label="Loading requirements..." />
            </Stack>
        );
    }

    if (error) {
        return (
            <Lozenge appearance="removed">
                {error}
            </Lozenge>
        );
    }

    return (
        <>
            {allSprints.length > 0 && (
                <Box marginBottom="xlarge">
                    <Text size="xlarge" weight="bold">Sprint History</Text>
                    <Stack direction="horizontal" space="space.200">
                        {allSprints.map((sprint) => (
                            <Button
                                key={sprint.sprintNumber}
                                appearance="secondary"
                                onClick={() => {
                                    setRequirements(sprint.requirementsData || []);
                                    setSprintConfig({
                                        sprintNumber: sprint.sprintNumber,
                                        sprintCapacity: sprint.sprintCapacity,
                                        puntosHistoriaPorReq: sprint.puntosHistoriaPorReq,
                                        teamSize: sprint.teamSize,
                                        sprintDuration: sprint.sprintDuration
                                    });
                                }}
                            >
                                Sprint {sprint.sprintNumber}
                            </Button>
                        ))}
                    </Stack>
                </Box>
            )}

            <Box marginBottom="xlarge">
                <Text size="xlarge" weight="bold">Sprint Configuration</Text>
                <Inline space="space.200">
                    <Text>Sprint Number: {sprintConfig.sprintNumber || 'N/A'}</Text>
                    <Text>Sprint Velocity: {sprintConfig.sprintCapacity || 'N/A'} points</Text>
                    <Text>Team Members: {sprintConfig.teamSize || 'N/A'}</Text>
                    <Text>Sprint Duration: {sprintConfig.sprintDuration || 'N/A'}</Text>
                    <Text>
                        Points audited: {
                            requirements.reduce(
                                (sum, req) =>
                                    sum +
                                    ((req.nAudit > 0 && req.lastAuditSprint === sprintConfig.sprintNumber)
                                        ? (req.effort || sprintConfig.puntosHistoriaPorReq || 0)
                                        : 0),
                                0
                            )
                        }
                    </Text>
                </Inline>
                <Text size="xlarge" weight="bold">Selected Sprint Requirements</Text>
                <DynamicTable
                    head={HEADERS.requirements}
                    rows={reqRows}
                    emptyView={<Text>No requirements found</Text>}
                />
            </Box>
        </>
    );
};

export default SprintHistory;
