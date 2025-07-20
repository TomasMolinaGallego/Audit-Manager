import Resolver from '@forge/resolver';
import { storage } from '@forge/api';

// ==============================
// Tipos y Helpers
// ==============================

interface Requirement {
  id: string;
  level: number;
  section: string;
  heading: string;
  text: string;
  children: Requirement[];
  parentId?: string | null;
  childrenIds?: string[];
  isContainer?: boolean;
  important: number;
  nAudit: number;
  lastAuditSprint?: number;
  nDep: number;
  dependencies?: string[];
  nHijos?: number;
  riesgo?: number;
  effort?: number;
  catalogTitle?: string;
  siblingCount: number;
}

type Catalog = {
  id: string;
  userId: string;
  dateCreation: string;
  dateUpdate: string;
  title: string;
  description: string;
  prefix: string;
  requirements: Requirement[];
  [key: string]: any;
};

const resolver = new Resolver();

const getFormattedDateTime = (): string => {
  const now = new Date();
  return `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()} @ ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
};

const createNewCatalog = (
  userId: string,
  title: string,
  description: string,
  prefix: string
): Catalog => ({
  id: `catalog-${Date.now()}`,
  userId,
  dateCreation: getFormattedDateTime(),
  dateUpdate: getFormattedDateTime(),
  title,
  description,
  prefix,
  requirements: []
});

const saveCatalog = async (catalog: Catalog) => {
  catalog.dateUpdate = getFormattedDateTime();
  await storage.set(catalog.id, catalog);
  return catalog;
};

const getCatalog = async (catalogId: string): Promise<Catalog> => {
  const catalog = await storage.get(catalogId);
  if (!catalog) throw new Error('Catálogo no encontrado');
  return catalog;
};

const flattenRequirements = (
  requirements: any[],
  parentId: string | null = null,
  catalogName?: string
): Requirement[] => {
  return requirements.reduce((acc: Requirement[], req) => {
    const childrenIds = req.children?.map((c: any) => c.id) || [];
    const flatReq: Requirement = {
      id: req.id,
      level: req.level,
      section: req.section,
      heading: req.heading,
      text: req.text,
      parentId,
      childrenIds,
      important: req.important,
      nAudit: 0,
      nDep: req.nDep || 0,
      effort: req.effort,
      children: [],
      riesgo: 0,
      dependencies: req.dependencies || [],
      isContainer: !req.text || req.text.trim() === "",
      catalogTitle: catalogName || '',
      siblingCount: 0
    };
    acc.push(flatReq);
    if (req.children?.length) {
      acc.push(...flattenRequirements(req.children, req.id, catalogName));
    }
    return acc;
  }, []);
};

const buildHierarchy = (
  requirements: Requirement[],
  parentId: string | null = null
): Requirement[] => {
  return requirements
    .filter(req => (parentId === null
      ? req.section.split('.').length === 1
      : requirements.find(r => r.id === parentId)?.childrenIds?.includes(req.id)))
    .map(req => ({
      ...req,
      children: buildHierarchy(requirements, req.id)
    }));
};

function calculateSiblingCount(requirements: Requirement[]) {
  const reqById: Record<string, Requirement> = {};
  requirements.forEach(req => { reqById[req.id] = req; });
  const parentChildrenMap: Record<string, number> = {};
  requirements.forEach(req => {
    if (req.parentId) {
      const parent = reqById[req.parentId];
      if (parent && !parent.isContainer) {
        parentChildrenMap[req.parentId] = (parentChildrenMap[req.parentId] || 0) + 1;
      }
    }
  });
  requirements.forEach(req => {
    const parent = req.parentId ? reqById[req.parentId] : undefined;
    req.siblingCount = (parent && !parent.isContainer)
      ? parentChildrenMap[req.parentId!] || 0
      : 0;
  });
}

function calculateAllRisks(requirements: Requirement[], currentSprint: number) {
  calculateSiblingCount(requirements);
  const rootRequirements = requirements.filter(req => !req.parentId);
  rootRequirements.forEach(rootReq => updateRisks(rootReq, currentSprint, requirements));
}

const updateRisks = (
  req: Requirement,
  currentSprint: number,
  requirements: Requirement[],
  depth: number = 0
): void => {
  if (req.isContainer) {
    req.riesgo = 0;
    req.childrenIds?.forEach(child =>
      updateRisks(requirements.find(r => r.id === child)!, currentSprint, requirements, depth + 1)
    );
    return;
  }
  req.riesgo = calculateRisk(req, currentSprint, depth);
  req.childrenIds?.forEach(child =>
    updateRisks(requirements.find(r => r.id === child)!, currentSprint, requirements, depth + 1)
  );
};

const calculateRisk = (
  req: Requirement,
  currentSprint: number,
  depth: number
): number => {
  const MAX_SIBLINGS = 50, MAX_DEPTH = 8, MAX_DEPENDENCIES = 15, MAX_CYCLES = 20;
  const normalizedImportance = req.important / 100;
  const normalizedSiblings = Math.min((req.siblingCount || 0) / MAX_SIBLINGS, 1);
  const normalizedDepth = Math.min(depth / MAX_DEPTH, 1);
  const normalizedDependencies = Math.min((req.dependencies?.length || 0) / MAX_DEPENDENCIES, 1);

  const importanceFactor = 0.50 * normalizedImportance;
  const siblingsFactor = 0.20 * Math.log10(normalizedSiblings * 99 + 1);
  const depthFactor = 0.20 * (normalizedDepth ** 1.5);
  const dependenciesFactor = 0.10 * normalizedDependencies;

  let cycles = 0;
  cycles = Math.min(currentSprint - (req.lastAuditSprint == undefined ? 0 : req.lastAuditSprint), MAX_CYCLES);
  const freshnessFactor = (0.15 * (cycles)) + 1;
  let risk = (importanceFactor + siblingsFactor + depthFactor + dependenciesFactor) * freshnessFactor;
  const auditPenalty = (req.nAudit || 0) > 0 ? 0.5 : 1;
  let finalRisk = risk * auditPenalty * 100;
  return Math.min(Math.max(finalRisk, 0), 100);
};

const updateChildrenCount = (req: Requirement): number => {
  if (!req.children || req.children.length === 0) {
    req.nHijos = 0;
    return 0;
  }
  let totalChildren = req.children.length;
  req.children.forEach(child => { totalChildren += updateChildrenCount(child); });
  req.nHijos = totalChildren;
  return totalChildren;
};

resolver.define('createCatalog', async ({ payload }) => {
  const newCatalog = createNewCatalog(
    payload.userId,
    payload.title,
    payload.description,
    payload.prefix
  );
  await saveCatalog(newCatalog);
  return newCatalog.id;
});

resolver.define('getAllCatalogs', async () => {
  const result = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: 'catalog-' })
    .getMany();
  return result.results.map((item: any) => ({
    id: item.key,
    title: item.value?.title || '',
    description: item.value?.description || '',
    requirements: item.value?.requirements || [],
    prefix: item.value?.prefix || ''
  }));
});

resolver.define('getCatalogById', async ({ payload }) => {
  try {
    const catalog = await getCatalog(payload.id);
    return { ...catalog, requirements: catalog.requirements || [] };
  } catch (error: any) {
    return { error: error.message };
  }
});

resolver.define('deleteAllCatalogs', async () => {
  const result = await storage.query().getMany();
  await Promise.all(result.results.map(item => storage.delete(item.key)));
});

resolver.define('deleteCatalog', async ({ payload }) => {
  await storage.delete(payload.catalogId);
  const issueResults = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: 'issue-' })
    .getMany();
  await Promise.all(issueResults.results.map(async (item) => {
    const updatedIssue = Array.isArray(item.value)
      ? item.value.filter((entry: any) => entry.catalogId !== payload.catalogId)
      : [];
    if (updatedIssue.length === 0) {
      await storage.delete(item.key);
    } else {
      await storage.set(item.key, updatedIssue);
    }
  }));
});

resolver.define('importRequirementsFromCustomCSV', async ({ payload }) => {
  const { requirements, catalogName } = payload;
  const results = { total: requirements.length, success: 0, errors: [] as { message: string }[] };
  try {
    const flatReqs = flattenRequirements(requirements, null, catalogName);
    const newCatalog = {
      ...createNewCatalog('system', catalogName, 'Automatically generated', 'IMP'),
      requirements: flatReqs
    };
    await saveCatalog(newCatalog);
    results.success = flatReqs.length;
    return results;
  } catch (error: any) {
    results.errors.push({ message: `Error al importar requisitos: ${error.message}` });
    return results;
  }
});

resolver.define('getCatalogRequirements', async ({ payload }) => {
  const catalog = await getCatalog(payload.catalogId);
  return catalog.requirements || [];
});

resolver.define('getRequirementHierarchy', async ({ payload }) => {
  const catalog = await getCatalog(payload.catalogId);
  return buildHierarchy(catalog.requirements || []);
});

resolver.define('calculateRisksByCatalog', async ({ payload }) => {
  const { catalogId, sprintActual } = payload;
  const catalog = await getCatalog(catalogId);
  catalog.requirements.forEach(root => updateChildrenCount(root));
  calculateAllRisks(catalog.requirements, sprintActual);
  await saveCatalog(catalog);
  return { success: true, catalog };
});

resolver.define('calculateRisksAllCatalogs', async ({ payload }) => {
  const { sprintActual } = payload;
  const catalogs = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: 'catalog-' })
    .getMany();
  const results: { id: string; title: string }[] = [];
  for (const item of catalogs.results) {
    const catalog = item.value as Catalog;
    catalog.requirements.forEach((root: Requirement) => updateChildrenCount(root));
    calculateAllRisks(catalog.requirements, sprintActual);
    await saveCatalog(catalog);
    results.push({ id: catalog.id, title: catalog.title });
  }
  return { success: true, updatedCatalogs: results };
});

resolver.define('selectRequirementsForAudit', async ({ payload }) => {
  const { catalogId, reqsToAvoid = [] } = payload;
  const catalog = await getCatalog(catalogId);
  const allRequirements: Requirement[] = [];
  const flatten = (req: Requirement) => {
    allRequirements.push(req);
    req.children?.forEach(flatten);
  };
  catalog.requirements.forEach(flatten);
  const auditables = allRequirements.filter(req => {
    if (req.isContainer) return false;
    if (!req.childrenIds || req.childrenIds.length === 0) return true;
    const parent = req.parentId ? allRequirements.find(r => r.id === req.parentId) : undefined;
    const parentAuditCount = parent?.nAudit ?? 0;
    let allChildrenAudited = req.childrenIds.every(childId => {
      const child = allRequirements.find(r => r.id === childId);
      // If child is missing, treat as not audited
      if (!child || typeof child.nAudit !== 'number') return false;
      return child.nAudit === parentAuditCount - 1;
    });
    if (req.dependencies && req.dependencies.length > 0) {
      // Si el requisito actual no ha sido auditado, no se pueden seleccionar sus dependencias
      if (!req.nAudit || req.nAudit === 0) {
        allChildrenAudited = false;
      } else {
        allChildrenAudited = allChildrenAudited && req.dependencies.every(depId => {
          const dep = allRequirements.find(r => r.id === depId);
          // Si la dependencia no existe o no ha sido auditada, este requisito no es auditable
          if (!dep || typeof dep.nAudit !== 'number' || dep.nAudit === 0) return false;
          return dep.nAudit === req.nAudit - 1;
        });
      }
    }
    return allChildrenAudited;
  });
  const sortedByRisk = [...auditables].sort((a, b) => (b.riesgo || 0) - (a.riesgo || 0));
  return {
    selectedRequirements: sortedByRisk.filter(req => !reqsToAvoid.includes(req.id)).slice(0, 10),
    totalRequirements: auditables.length
  };
});

resolver.define('getAllRequirementsByRisk', async ({ payload }) => {
  const catalogs = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: 'catalog-' })
    .getMany();
  const allRequirements: Requirement[] = [];
  for (const item of catalogs.results) {
    const catalog = item.value as Catalog;
    allRequirements.push(...catalog.requirements || []);
  }
  const filteredRequirements = allRequirements.filter(req => req.riesgo && req.riesgo > 0);
  const sortedRequirements = filteredRequirements.sort((a, b) => (b.riesgo || 0) - (a.riesgo || 0));
  return {
    selectedRequirements: sortedRequirements.filter(req => !payload.reqsToAvoid?.includes(req.id)).slice(0, 10)
  };
});

resolver.define('updateRequirementStoryPoints', async ({ payload }) => {
  const { requirementId, newStoryPoints } = payload;
  const catalogs = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: 'catalog-' })
    .getMany();
  for (const item of catalogs.results) {
    const catalog = item.value as Catalog;
    if (catalog && Array.isArray(catalog.requirements)) {
      catalog.requirements.forEach((req: Requirement) => {
        if (req.id === requirementId) req.effort = newStoryPoints;
        req.children?.forEach((child: Requirement) => {
          if (child.id === requirementId) child.effort = newStoryPoints;
        });
      });
      await saveCatalog(catalog);
    }
  }

  const sprints = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: 'sprint-' })
    .getMany();
  if (sprints.results.length > 0) {
    const lastSprintItem = sprints.results
      .map(item => ({
        ...item,
        sprintNumber: parseInt(item.key.replace('sprint-', ''), 10)
      }))
      .filter(item => !isNaN(item.sprintNumber))
      .sort((a, b) => b.sprintNumber - a.sprintNumber)[0];

    if (lastSprintItem && Array.isArray((lastSprintItem.value as { requirements: any[] }).requirements)) {
      let updated = false;
      ((lastSprintItem.value as { requirements: any[] }).requirements).forEach((req: any) => {
        if (req.id === requirementId) {
          req.effort = newStoryPoints;
          updated = true;
        }
      });
      if (updated) {
        (lastSprintItem.value as { dateUpdate: string }).dateUpdate = getFormattedDateTime();
        await storage.set(lastSprintItem.key, lastSprintItem.value);
      }
    }
  }

  return { success: true };
});

resolver.define('markAsAudited', async ({ payload }) => {
  const { requirementIds, sprintNumber } = payload;
  const catalogs = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: 'catalog-' })
    .getMany();
  let updatedCount = 0;
  for (const item of catalogs.results) {
    const catalog = item.value as Catalog;
    let modified = false;
    const markRequirement = (req: Requirement) => {
      if (requirementIds.includes(req.id)) {
        req.nAudit = (req.nAudit || 0) + 1;
        req.lastAuditSprint = sprintNumber;
        modified = true;
        updatedCount++;
      }
      req.children?.forEach(markRequirement);
    };
    if (catalog && Array.isArray(catalog.requirements)) {
      catalog.requirements.forEach(markRequirement);
      if (modified) await saveCatalog(catalog);
    }
  }
  const sprintKey = `sprint-${sprintNumber}`;
  const sprint = await storage.get(sprintKey);
  if (sprint && Array.isArray(sprint.requirements)) {
    let sprintModified = false;
    sprint.requirements.forEach((req: any) => {
      if (requirementIds.includes(req.id)) {
        req.nAudit = (req.nAudit || 0) + 1;
        req.lastAuditSprint = sprintNumber;
        sprintModified = true;
      }
    });
    if (sprintModified) {
      sprint.dateUpdate = getFormattedDateTime();
      await storage.set(sprintKey, sprint);
    }
  }
  return { success: true, updatedCount };
});

resolver.define('saveSprintConfig', async ({ payload }) => {
  await storage.set('config-sprint', payload.config);
  return { success: true };
});

resolver.define('getSprintConfig', async () => {
  const config = await storage.get('config-sprint');
  if (config) {
    config.isDefault = false;
    return config;
  }
  return {
    sprintNumber: 0,
    sprintCapacity: 0,
    puntosHistoriaPorReq: 0,
    teamSize: 0,
    sprintDuration: 0,
    requirements: [],
    isDefault: true
  };
});

resolver.define('getSprintByNumber', async ({ payload }) => {
  const sprint = await storage.get(`sprint-${payload.sprintNumber}`);
  if (!sprint) throw new Error(`Sprint ${payload.sprintNumber} no encontrado`);
  return sprint;
});

resolver.define('saveSprint', async ({ payload }) => {
  const originalSprint = await storage.get(`sprint-${payload.sprintNumber}`);
  let sprint: any = {};
  if (originalSprint) {
    payload.requirements = originalSprint.requirements?.concat(payload.requirements || []) || [];
    sprint = {
      ...originalSprint,
      projectName: '',
      sprintCapacity: payload.sprintCapacity || originalSprint.sprintCapacity,
      puntosHistoriaPorReq: payload.puntosHistoriaPorReq || originalSprint.puntosHistoriaPorReq,
      isActive: true,
      requirements: payload.requirements || [],
      dateUpdate: getFormattedDateTime(),
    };
  } else {
    sprint = {
      projectName: '',
      sprintNumber: payload.sprintNumber,
      sprintCapacity: payload.sprintCapacity,
      puntosHistoriaPorReq: payload.puntosHistoriaPorReq,
      isActive: true,
      requirements: payload.requirements || [],
      teamSize: payload.teamSize,
      sprintDuration: payload.sprintDuration,
      dateCreation: getFormattedDateTime(),
      dateUpdate: getFormattedDateTime(),
    };
  }
  await storage.set(`sprint-${payload.sprintNumber}`, sprint);
  return { success: true, sprint };
});

resolver.define('endActualSprint', async ({ payload }) => {
  const currentSprint = await storage.get(`sprint-${payload.sprintNumber}`);
  if (!currentSprint) throw new Error(`Sprint ${payload.sprintNumber} no encontrado`);
  currentSprint.isActive = false;
  currentSprint.dateUpdate = getFormattedDateTime();
  await storage.set(`sprint-${payload.sprintNumber}`, currentSprint);
});

resolver.define('getActiveSprint', async () => {
  const result = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: 'sprint-' })
    .getMany();
  if (result.results.length === 0) return false;
  return result.results[result.results.length - 1].value;
});

resolver.define('getAllSprints', async () => {
  const result = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: 'sprint-' })
    .getMany();
  if (result.results.length === 0) return false;
  return result.results.map(item => item.value);
});

resolver.define('cleanDatabase', async () => {
  const result = await storage.query().getMany();
  await Promise.all(result.results.map(item => storage.delete(item.key)));
  return { success: true };
});

resolver.define('deleteAllSprints', async () => {
  const result = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: 'sprint-' })
    .getMany();
  await Promise.all(result.results.map(item => storage.delete(item.key)));
  return { success: true };
});

resolver.define('modifySprint', async ({ payload }) => {
  const sprint = await storage.get(`sprint-${payload.sprintNumber}`);
  if (!sprint) throw new Error(`Sprint ${payload.sprintNumber} no encontrado`);
  const updatedSprint = {
    ...sprint,
    ...payload.updates,
    dateUpdate: getFormattedDateTime()
  };
  await storage.set(`sprint-${payload.sprintNumber}`, updatedSprint);
  return { success: true, sprint: updatedSprint };
});

resolver.define('removeRequirementFromSprint', async ({ payload }) => {
  const { sprintNumber, requirementId } = payload;
  const sprintKey = `sprint-${sprintNumber}`;
  const sprint = await storage.get(sprintKey);
  if (!sprint) throw new Error(`Sprint ${sprintNumber} no encontrado`);
  const initialCount = sprint.requirements.length;
  sprint.requirements = sprint.requirements.filter((req: any) => req.id !== requirementId);
  if (sprint.requirements.length === initialCount) {
    throw new Error(`Requisito ${requirementId} no encontrado en el sprint`);
  }
  sprint.dateUpdate = getFormattedDateTime();
  await storage.set(sprintKey, sprint);
  return { success: true, sprintNumber, removedId: requirementId };
});

resolver.define('getRequirementsByIds', async ({ payload }) => {
  const { requirementIds } = payload;
  if (!Array.isArray(requirementIds) || requirementIds.length === 0) return [];
  const ids = requirementIds.map((item: { id: string }) => item.id);
  const catalogs = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: 'catalog-' })
    .getMany();
  const allRequirements: Requirement[] = [];
  const flatten = (req: Requirement) => {
    allRequirements.push(req);
    req.children?.forEach(flatten);
  };
  catalogs.results.forEach(item => {
    const catalog = item.value as Catalog;
    if (catalog?.requirements) catalog.requirements.forEach(flatten);
  });
  return allRequirements.filter(req => ids.includes(req.id));
});

resolver.define('updateRequirement', async ({ payload }) => {
  const { id, heading, text, important } = payload;
  const catalogs = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: 'catalog-' })
    .getMany();
  let updated = false;
  for (const item of catalogs.results) {
    const catalog = item.value as Catalog;
    if (catalog && Array.isArray(catalog.requirements)) {
      catalog.requirements.forEach((req: Requirement) => {
        if (req.id === id) {
          req.heading = heading;
          req.text = text;
          req.important = important;
          updated = true;
        }
        req.children?.forEach((child: Requirement) => {
          if (child.id === id) {
            child.heading = heading;
            child.text = text;
            child.important = important;
            updated = true;
          }
        });
      });
      if (updated) {
        await saveCatalog(catalog);
        break;
      }
    }
  }
  if (!updated) throw new Error(`Requisito con ID ${id} no encontrado`);
  return { success: true, updatedRequirementId: id };
});

resolver.define('deleteRequirement', async ({ payload }) => {
  const { requirementId, catalogId } = payload;
  const catalogsResult = await storage.query()
    .where('key', { condition: 'STARTS_WITH', value: catalogId })
    .getMany();
  const catalog = catalogsResult.results.find((item: any) => item.key === catalogId)?.value;
  let deleted = false;
  if (catalog && Array.isArray((catalog as Catalog).requirements)) {
    (catalog as Catalog).requirements = (catalog as Catalog).requirements.filter((req: Requirement) => {
      if (req.id === requirementId) {
        deleted = true;
        return false;
      }
      req.children = req.children.filter((child: Requirement) => child.id !== requirementId);
      if (Array.isArray(req.childrenIds)) {
        req.childrenIds = req.childrenIds.filter((id: string) => id !== requirementId);
      }
      return true;
    });
    if (deleted) {
      (catalog as Catalog).dateUpdate = getFormattedDateTime();
      await storage.set((catalog as Catalog).id, catalog);
    }
  }
  if (!deleted) throw new Error(`Requisito con ID ${requirementId} no encontrado`);
  return { success: true, deletedRequirementId: requirementId };
});

export const handler = resolver.getDefinitions();
