export type DiagnosticCatalogItem = {
  id: string;
  name: string;
  category: string;
  modality: string;
  components?: string[];
  isInpatientRoutine: boolean;
  requiresFasting: boolean;
  isOutsourced: boolean;
  requiresContrastConsent: boolean;
};

const lab = (id: string, name: string, category: string, components: string[] = [], flags: Partial<DiagnosticCatalogItem> = {}): DiagnosticCatalogItem => ({ id, name, category, modality: "Laboratory", components, isInpatientRoutine: false, requiresFasting: false, isOutsourced: false, requiresContrastConsent: false, ...flags });
const imaging = (id: string, name: string, category: string, modality: string, flags: Partial<DiagnosticCatalogItem> = {}): DiagnosticCatalogItem => ({ id, name, category, modality, isInpatientRoutine: false, requiresFasting: false, isOutsourced: false, requiresContrastConsent: false, ...flags });

export const LAB_CATALOG: DiagnosticCatalogItem[] = [
  lab("cbc-diff", "Complete Blood Count (CBC) with Differential", "Hematology", ["Hb", "TLC", "DLC", "Platelets", "RBC indices"], { isInpatientRoutine: true }),
  lab("lft", "Liver Function Test (LFT)", "Biochemistry", ["Total/Direct Bilirubin", "SGOT/AST", "SGPT/ALT", "ALP", "Total Protein", "Albumin", "Globulin", "A/G Ratio"], { isInpatientRoutine: true }),
  lab("rft-kft", "Renal Function Test (RFT / KFT)", "Biochemistry", ["Serum Creatinine", "Blood Urea Nitrogen", "Uric Acid", "Serum Electrolytes"], { isInpatientRoutine: true }),
  lab("electrolytes", "Serum Electrolytes Panel", "Biochemistry", ["Sodium Na+", "Potassium K+", "Chloride Cl-", "Bicarbonate HCO3-"], { isInpatientRoutine: true }),
  lab("coagulation", "Coagulation Profile", "Hematology", ["PT/INR", "aPTT", "Bleeding Time", "Clotting Time", "Fibrinogen"], { isInpatientRoutine: true }),
  lab("inflammatory", "Inflammatory / Acute Phase Reactants", "Immunology", ["hs-CRP", "ESR", "Procalcitonin", "Serum Ferritin", "D-Dimer"], { isInpatientRoutine: true }),
  lab("diabetic-metabolic", "Diabetic / Metabolic Profile", "Biochemistry", ["Fasting Blood Sugar", "Postprandial Blood Sugar", "HbA1c", "Random Blood Sugar"], { isInpatientRoutine: true }),
  lab("abg-vbg", "Arterial Blood Gas (ABG) / Venous Blood Gas (VBG)", "Biochemistry", ["pH", "pCO2", "pO2", "HCO3-", "Lactate"], { isInpatientRoutine: true }),
  lab("lipid-profile", "Lipid Profile", "Biochemistry", ["Total Cholesterol", "Triglycerides", "HDL", "LDL", "VLDL"], { requiresFasting: true }),
  lab("cardiac-markers", "Cardiac Markers", "Biochemistry", ["Troponin-I / Troponin-T", "CK-MB", "NT-proBNP"], { isInpatientRoutine: true }),
  lab("urine-rm", "Urine Routine & Microscopy (Urine R/M)", "Urinalysis", ["pH", "Specific Gravity", "Protein", "Glucose", "Ketones", "Nitrites", "Leukocyte Esterase", "RBCs", "Pus cells", "Epithelial cells", "Casts", "Crystals"]),
  lab("urine-cs", "Urine Culture & Sensitivity (C/S)", "Microbiology"),
  lab("urine-24h-protein", "24-Hour Urine Protein / Creatinine Clearance", "Urinalysis"),
  lab("urine-acr", "Urine Spot Microalbumin / Creatinine Ratio", "Urinalysis"),
  lab("upt", "Urine Pregnancy Test (UPT)", "Urinalysis"),
  lab("urine-tox", "Urine Toxicology / Drug Screen", "Toxicology"),
  lab("bence-jones", "Urine Bence Jones Protein", "Hematology"),
  lab("stool-rm", "Stool Routine & Microscopy", "Stool", ["Color", "Consistency", "Mucus", "Pus cells", "RBCs", "Parasites", "Ova", "Cysts"]),
  lab("stool-occult", "Stool Occult Blood Test (FOBT / FIT)", "Stool"),
  lab("stool-cs", "Stool Culture & Sensitivity (C/S)", "Microbiology"),
  lab("stool-reducing", "Stool Reducing Substances", "Stool"),
  lab("fecal-calprotectin", "Stool Fecal Calprotectin", "Stool"),
  lab("stool-antigen", "Stool Antigen Panel", "Microbiology", ["C. difficile Toxins A & B", "H. pylori antigen", "Rotavirus", "Adenovirus"]),
  lab("rf", "Rheumatoid Factor (RF)", "Rheumatology & Autoimmune"),
  lab("anti-ccp", "Anti-Cyclic Citrullinated Peptide (Anti-CCP)", "Rheumatology & Autoimmune"),
  lab("ana-screen", "Antinuclear Antibodies (ANA) Screening", "Rheumatology & Autoimmune", ["Immunofluorescence / IFA"]),
  lab("ana-profile", "ANA Immunoblot / Profile", "Rheumatology & Autoimmune", ["17 or 23 Autoantibodies", "Anti-dsDNA", "Anti-Smith", "SSA/Ro", "SSB/La", "Scl-70", "Jo-1", "U1-snRNP", "Centromere B", "Histones"]),
  lab("anca", "Anti-Neutrophil Cytoplasmic Antibodies (ANCA Profile)", "Rheumatology & Autoimmune", ["c-ANCA / PR3", "p-ANCA / MPO"]),
  lab("complement", "Complement Levels", "Rheumatology & Autoimmune", ["C3", "C4"]),
  lab("hla-b27", "HLA-B27", "Rheumatology & Autoimmune", ["Flow Cytometry / PCR"]),
  lab("aps-panel", "Anti-Phospholipid Syndrome (APS) Panel", "Rheumatology & Autoimmune", ["Lupus Anticoagulants", "Anti-Cardiolipin IgG/IgM", "Anti-Beta-2 Glycoprotein I"]),
  lab("blood-culture", "Blood Culture & Sensitivity", "Microbiology", ["Aerobic", "Anaerobic"], { isInpatientRoutine: true }),
  lab("sputum-culture", "Sputum Culture & Microscopy", "Microbiology", ["Gram Stain", "AFB Stain", "KOH Mount"]),
  lab("genexpert", "GeneXpert / CBNAAT", "Microbiology", ["Tuberculosis detection", "Rifampicin resistance"]),
  lab("viral-serology", "Viral Serology Screen", "Serology", ["HIV I & II", "HBsAg", "Anti-HCV"]),
  lab("tropical-panel", "Tropical Disease Panel", "Serology", ["Dengue NS1/IgM/IgG", "Typhoid Widal/TyphiDot", "Malaria Antigen RDT / Peripheral Blood Smear", "Chikungunya IgM", "Leptospira IgM"]),
];

export const RADIOLOGY_CATALOG: DiagnosticCatalogItem[] = [
  imaging("cxr", "Chest X-Ray (PA / AP / Lateral)", "Radiography", "X-ray", { isInpatientRoutine: true }),
  imaging("abdomen-xray", "Abdomen X-Ray (Erect / Supine)", "Radiography", "X-ray", { isInpatientRoutine: true }),
  imaging("spine-xray", "Spine X-Ray (Cervical / Thoracic / Lumbar AP & Lateral)", "Radiography", "X-ray"),
  imaging("extremity-xray", "Extremity X-Rays (Long Bones / Joints)", "Radiography", "X-ray"),
  imaging("mobile-xray", "Bedside Mobile X-Ray (ICU / IPD Portable Imaging)", "Radiography", "X-ray", { isInpatientRoutine: true }),
  imaging("usg-abdomen-pelvis", "USG Abdomen & Pelvis (Complete)", "Ultrasonography & Color Doppler", "Ultrasound", { requiresFasting: true }),
  imaging("usg-kub-prostate", "USG KUB & Prostate", "Ultrasonography & Color Doppler", "Ultrasound"),
  imaging("usg-obgyn", "USG Obstetric / Gynecological", "Ultrasonography & Color Doppler", "Ultrasound"),
  imaging("usg-small-parts", "USG Small Parts (Thyroid / Scrotum / Breast / MSK)", "Ultrasonography & Color Doppler", "Ultrasound"),
  imaging("color-doppler", "Color Doppler Study", "Ultrasonography & Color Doppler", "Ultrasound"),
  imaging("fast-pocus", "Bedside FAST / POCUS", "Ultrasonography & Color Doppler", "Ultrasound", { isInpatientRoutine: true }),
  imaging("digital-mammography", "Digital Mammography (Bilateral Screening)", "Mammography", "Mammography", { isOutsourced: true }),
  imaging("3d-mammography", "3D Mammography / Breast Tomosynthesis", "Mammography", "Mammography", { isOutsourced: true }),
  imaging("sono-mammogram", "Ultrasound Mammography (Sono-Mammogram)", "Mammography", "Ultrasound", { isOutsourced: true }),
  imaging("ncct-brain", "NCCT Brain / Head", "CT", "CT", { isInpatientRoutine: true }),
  imaging("hrct-thorax", "NCCT Chest / HRCT Thorax", "CT", "CT"),
  imaging("ncct-abdomen", "NCCT Abdomen & Pelvis / KUB", "CT", "CT"),
  imaging("ncct-spine", "NCCT Spine (Cervical / Lumbar)", "CT", "CT"),
  imaging("cect-brain", "CECT Brain", "CT", "CT", { requiresContrastConsent: true }),
  imaging("cect-chest", "CECT Chest / Whole Abdomen / Neck", "CT", "CT", { requiresContrastConsent: true }),
  imaging("cta-coronary", "CT Coronary Angiography", "CT Angiography", "CT", { isOutsourced: true, requiresContrastConsent: true }),
  imaging("cta-pulmonary", "CT Pulmonary Angiography (PE Protocol)", "CT Angiography", "CT", { isOutsourced: true, requiresContrastConsent: true }),
  imaging("cta-brain-carotid", "CT Brain & Carotid Angiography", "CT Angiography", "CT", { isOutsourced: true, requiresContrastConsent: true }),
  imaging("cta-peripheral", "CT Peripheral Angiography (Aorta & Legs)", "CT Angiography", "CT", { isOutsourced: true, requiresContrastConsent: true }),
  imaging("mri-brain", "MRI Brain (Plain)", "MRI", "MRI", { isOutsourced: true }),
  imaging("mri-brain-contrast", "MRI Brain (Contrast-Enhanced)", "MRI", "MRI", { isOutsourced: true, requiresContrastConsent: true }),
  imaging("mri-brain-stroke", "MRI Brain Stroke Protocol (DWI / FLAIR)", "MRI", "MRI", { isOutsourced: true }),
  imaging("mri-spine", "MRI Spine (Cervical / Thoracic / Lumbo-Sacral)", "MRI", "MRI", { isOutsourced: true }),
  imaging("mri-joint", "MRI Joint (Knee / Shoulder / Hip / Ankle / Wrist)", "MSK MRI", "MRI", { isOutsourced: true }),
  imaging("mri-pelvis-prostate", "MRI Pelvis / Prostate (Multiparametric)", "Abdominal & Pelvic MRI", "MRI", { isOutsourced: true }),
  imaging("mrcp", "MRCP", "Abdominal & Pelvic MRI", "MRI", { isOutsourced: true }),
  imaging("mra-brain-tof", "MRA Brain (Non-Contrast / TOF)", "MRA & MRV", "MRI", { isOutsourced: true }),
  imaging("mra-brain-contrast", "MRA Brain (Contrast-Enhanced)", "MRA & MRV", "MRI", { isOutsourced: true, requiresContrastConsent: true }),
  imaging("mrv-brain", "MRV Brain (Venous Sinus Thrombosis Screen)", "MRA & MRV", "MRI", { isOutsourced: true }),
  imaging("mra-renal-peripheral", "MRA Renal Arteries / Peripheral Vessel", "MRA & MRV", "MRI", { isOutsourced: true }),
  imaging("pet-ct", "PET-CT Scan (Whole Body / Oncology / Cardiac)", "Nuclear Medicine", "PET-CT", { isOutsourced: true }),
  imaging("spect-bone", "SPECT Scan / Bone Scan", "Nuclear Medicine", "SPECT", { isOutsourced: true }),
  imaging("dexa", "Bone Mineral Density (BMD) / DEXA", "Advanced Diagnostics", "DEXA", { isOutsourced: true }),
  imaging("barium-swallow-meal", "Fluoroscopy: Barium Swallow / Meal", "Fluoroscopy", "Fluoroscopy", { isOutsourced: true }),
  imaging("mcu", "Fluoroscopy: Micturating Cystourethrogram (MCU)", "Fluoroscopy", "Fluoroscopy", { isOutsourced: true }),
  imaging("hsg", "Fluoroscopy: Hysterosalpingography (HSG)", "Fluoroscopy", "Fluoroscopy", { isOutsourced: true }),
];

export const DIAGNOSTIC_CATALOG = [...LAB_CATALOG, ...RADIOLOGY_CATALOG];
export const DIAGNOSTIC_CATEGORIES = [...new Set(DIAGNOSTIC_CATALOG.map((item) => item.category))];
export const DIAGNOSTIC_MODALITIES = [...new Set(DIAGNOSTIC_CATALOG.map((item) => item.modality))];
