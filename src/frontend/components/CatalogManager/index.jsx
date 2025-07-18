import React, { useState } from 'react';
import { Box, Stack, Text, Button } from '@forge/react';
import CSVRequirementsLoader from '../RequirementLoader';

const CatalogManager = () => {
  const [catalogId] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [showImporter, setShowImporter] = useState(true);

  const handleImportSuccess = () => {
    setImportResult({ success: true, message: 'Requirements imported with success' });
    setTimeout(() => {
      setImportResult(prev => prev ? { ...prev, message: '' } : prev);
    }, 5000);

    setShowImporter(false);
  };

  return (

          <CSVRequirementsLoader 
            catalogId={catalogId} 
            onSuccess={handleImportSuccess} 
          />
        )
};

export default CatalogManager;