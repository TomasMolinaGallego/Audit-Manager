import React, { useState } from 'react';
import {
  Box,
  Text,
  Stack,
  Inline,
  Tag,
  Tooltip,
  Lozenge,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textfield
} from '@forge/react';

const getRiskProps = riesgo => {
  if (riesgo > 70) return { appearance: 'danger', label: 'High risk', color: 'removed' };
  if (riesgo > 40) return { appearance: 'warning', label: 'Medium risk', color: 'moved' };
  return { appearance: 'success', label: 'Low risk', color: 'new' };
};

const RequirementChildren = ({
  children,
  section,
  depth,
  isSelected,
  editable,
  onSave,
  onDelete
}) => (
  children?.length > 0 && (
    <Box role="list" aria-label={`Child requirements of ${section}`}>
      {children.map(child => (
        <RequirementNode
          key={child.id}
          requirement={child}
          depth={depth + 1}
          isSelected={isSelected}
          editable={editable}
          onSave={onSave}
          onDelete={onDelete}
        />
      ))}
    </Box>
  )
);

const EditRequirementModal = ({
  isOpen,
  onClose,
  editedTitle,
  setEditedTitle,
  editedText,
  setEditedText,
  editedImportance,
  setEditedImportance,
  onSave
}) => (
  isOpen && (
    <Modal onClose={onClose}>
      <ModalHeader>
        <Text level="h600">Edit Requirement</Text>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          <Text>Edit title</Text>
          <Textfield
            label="Title"
            value={editedTitle}
            onChange={e => setEditedTitle(e.target.value)}
            placeholder="Requirement title"
            isRequired
          />
          <Text>Edit description</Text>
          <Textfield
            label="Description"
            value={editedText}
            onChange={e => setEditedText(e.target.value)}
            placeholder="Requirement description"
            rows={4}
          />
          <Text>Edit importance (1-100)</Text>
          <Textfield
            label="Importance (1-100)"
            value={editedImportance}
            onChange={e => setEditedImportance(Number(e.target.value))}
            placeholder="Requirement importance"
          />
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onSave} appearance="primary">
          Save Changes
        </Button>
        <Button onClick={onClose} appearance="subtle">
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
);

const DeleteRequirementModal = ({
  isOpen,
  onClose,
  onDelete,
  heading,
  text
}) => (
  isOpen && (
    <Modal onClose={onClose}>
      <ModalHeader>
        <Text level="h600">Confirm Deletion</Text>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          <Text>
            Are you sure you want to delete this requirement?
          </Text>
          <Box padding="space.100" backgroundColor="color.background.neutral">
            <Text weight="bold">{heading}</Text>
            {text && (
              <Text size="small" color="color.text.subtle">
                {text}
              </Text>
            )}
          </Box>
          <Text color="color.text.danger">
            This action cannot be undone and will permanently delete the requirement.
          </Text>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onDelete} appearance="danger">
          Delete Permanently
        </Button>
        <Button onClick={onClose} appearance="subtle">
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
);

const RequirementNode = ({
  requirement,
  depth = 0,
  isSelected = false,
  editable = false,
  onSave,
  onDelete
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editedTitle, setEditedTitle] = useState(requirement.heading || '');
  const [editedText, setEditedText] = useState(requirement.text || '');
  const [editedImportance, setEditedImportance] = useState(requirement.important || 5);

  const riskValue = requirement.riesgo;
  const { label, color } = getRiskProps(riskValue);

  const handleEditClick = () => {
    setEditedTitle(requirement.heading || '');
    setEditedText(requirement.text || '');
    setEditedImportance(requirement.important || 5);
    setIsEditing(true);
  };

  const handleSave = () => {
    onSave({
      ...requirement,
      heading: editedTitle,
      text: editedText,
      important: editedImportance
    });
    setIsEditing(false);
  };

  const handleDelete = () => {
    onDelete(requirement.id);
    setShowDeleteModal(false);
  };

  if (requirement.isContainer) {
    return (
      <Box
        padding="space.200"
        xcss={{ backgroundColor: 'color.background.neutral.subtle' }}
        role="listitem"
      >
        <Text weight="bold" size="medium" id={`req-${requirement.id}-title`}>
          {requirement.section} {requirement.heading}
        </Text>
        <RequirementChildren
          children={requirement.children}
          section={requirement.section}
          depth={depth}
          isSelected={isSelected}
          editable={editable}
          onSave={onSave}
          onDelete={onDelete}
        />
      </Box>
    );
  }

  return (
    <Box
      padding="space.200"
      xcss={{ backgroundColor: 'color.background.neutral.subtle' }}
      role="listitem"
    >
      <Stack space="space.100">
        <Inline alignBlock="center" spread="space-between">
          <Box>
            <Text weight="bold" size="medium" id={`req-${requirement.id}-title`}>
              {requirement.catalogTitle} {requirement.id} - {requirement.section} {requirement.heading}
            </Text>
            {requirement.text && (
              <Text
                size="small"
                color="color.text.subtle"
                id={`req-${requirement.id}-desc`}
              >
                {requirement.text}
              </Text>
            )}
          </Box>
          <Box>
            {editable && (
              <Inline space="space.100">
                <Button onClick={handleEditClick} appearance="default">
                  Edit
                </Button>
                <Button onClick={() => setShowDeleteModal(true)} appearance="danger">
                  Delete
                </Button>
              </Inline>
            )}
            <Lozenge appearance={requirement.nAudit > 0 ? "success" : "default"}>
              Audited: {requirement.nAudit || 0}
            </Lozenge>
            {requirement.childrenIds?.length > 0 && (
              <Tooltip content="Number of child requirements">
                <Lozenge>
                  Children: {requirement.childrenIds.length}
                </Lozenge>
              </Tooltip>
            )}
          </Box>
        </Inline>

        <Box role="region">
          <Text
            id={`risk-label-${requirement.id}`}
            size="small"
            weight="bold"
            color='color.text.subtle'
          >
            Risk level:
          </Text>
          <Lozenge appearance={color}>
            {label} ({riskValue.toFixed(1)})
          </Lozenge>
        </Box>

        <Box>
          <Tooltip content="Requirement importance (1-10)">
            <Tag text={`Importance: ${requirement.important}`} />
          </Tooltip>
          {requirement.dependencies.length !== 0 && 
            <Text>{`Dependent requirements: ${requirement.dependencies.join(", ")}`}</Text>}
          {requirement.lastAuditSprint && (
            <Tooltip content="Last audited sprint">
              <Tag text={`Last audited sprint: ${requirement.lastAuditSprint}`} />
            </Tooltip>
          )}
          {requirement.effort && (
            <Tooltip content="Estimated effort in points">
              <Tag text={`Effort: ${requirement.effort}pts`} />
            </Tooltip>
          )}
        </Box>
      </Stack>

      <RequirementChildren
        children={requirement.children}
        section={requirement.section}
        depth={depth}
        isSelected={isSelected}
        editable={editable}
        onSave={onSave}
        onDelete={onDelete}
      />

      <EditRequirementModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        editedTitle={editedTitle}
        setEditedTitle={setEditedTitle}
        editedText={editedText}
        setEditedText={setEditedText}
        editedImportance={editedImportance}
        setEditedImportance={setEditedImportance}
        onSave={handleSave}
      />

      <DeleteRequirementModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDelete={handleDelete}
        heading={requirement.heading}
        text={requirement.text}
      />
    </Box>
  );
};

export default React.memo(RequirementNode);