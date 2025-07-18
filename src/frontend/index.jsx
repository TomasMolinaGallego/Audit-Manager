import React, { useState, useEffect, useRef, useCallback } from "react";
import ForgeReconciler, { Box, Button, Text } from "@forge/react";
import CatalogManager from './components/CatalogManager';
import StoredCSVRequirementsViewer from './components/Viewer';
import RiskBasedRequirementSelector from "./components/RiskBasedSelector";
import SprintConfigViewer from './components/SprintConfigViewer';
import AuditRequirementsList from './components/AuditRequirementsList';
import SprintHistory from './components/SprintHistory';
import { invoke, view } from "@forge/bridge";

const ROUTES = {
  MANAGE_SPRINT: "manage-sprint",
  REQUIREMENTS: "requirements",
  IMPORT_CATALOGUE: "import-catalogue",
  CONSULT_SPRINT: "consult-sprint",
  HISTORY: "history",
  HOME: "home",
};

function HomeContent() {
  return (
    <Box>
      <Text>Welcome to Requirements Support Util</Text>
      <Text>
        This application helps you manage non-functional requirements (NFR) for audits and their traceability in Jira.
        You can import requirements catalogs, select requirements based on risks, configure and consult sprints, and audit the compliance of the requirements.
      </Text>
      <Box>
        <Text weight="bold">How to use the application?</Text>
        <Text>• Import Catalog: Upload and manage requirements catalogs from CSV files.</Text>
        <Text>• Select Requirements: Choose relevant requirements according to the risk for your project.</Text>
        <Text weight="semibold">Start the sprint if this is your first time.</Text>
        <Text weight="medium">Always remember to calculate the risks before selecting requirements.</Text>
        <Text>• Configure Sprint: Associate requirements to active sprints and check their status.</Text>
        <Text>• Audit: Review the compliance of requirements in the sprints.</Text>
        <Text>• History: Check the history of changes and previous sprints.</Text>
      </Box>
      <Box>
        <Text>Use the navigation menu to access each section.</Text>
      </Box>
    </Box>
  );
}

function ResetButton() {
  const handleReset = useCallback(async () => {
    try {
      const result = await invoke('deleteAllCatalogs');
    } catch (error) {
      console.error('Error deleting all catalogs:', error);
    }
  }, []);
  return <Button onClick={handleReset}>Reset</Button>;
}

const PAGE_COMPONENTS = {
  [ROUTES.MANAGE_SPRINT]: <SprintConfigViewer />,
  [ROUTES.REQUIREMENTS]: <RiskBasedRequirementSelector />,
  [ROUTES.IMPORT_CATALOGUE]: (
    <>
      <CatalogManager />
      <StoredCSVRequirementsViewer />
      <ResetButton />
    </>
  ),
  [ROUTES.CONSULT_SPRINT]: <AuditRequirementsList />,
  [ROUTES.HISTORY]: <SprintHistory />,
  [ROUTES.HOME]: <HomeContent />,
};

function App() {
  const [selectedPage, setSelectedPage] = useState(ROUTES.HOME);
  const historyRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        const [history] = await Promise.all([
          view.createHistory(),
          view.getContext(),
        ]);
        if (!isMounted) return;

        const handleHistoryChange = (location) => {
          const newPath = location.pathname.replace(/^\//, '') || ROUTES.HOME;
          setSelectedPage(newPath);
        };

        historyRef.current = history;
        history.listen(handleHistoryChange);
        handleHistoryChange(history.location);
      } catch (error) {
        console.error('Initialization error:', error);
      }
    }

    initialize();
    return () => { isMounted = false; };
  }, []);

  return PAGE_COMPONENTS[selectedPage] || <HomeContent />;
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
