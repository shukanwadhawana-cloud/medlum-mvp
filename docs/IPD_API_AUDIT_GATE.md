# IPD API audit gate

This change keeps the existing IPD UI/schema and hardens the IPD API boundary. Patient reads and clinical writes are clinic-scoped when a clinic membership exists. Investigation indents use the existing LabOrder model and also create an Investigation Indent audit record. Emergency contacts remain in existing patient metadata; no schema migration or EKA credential dependency is introduced.
