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


// Expanded hospital laboratory and diagnostic catalog. Names are intentionally orderable clinical studies;
// individual laboratories/facilities can still use "Other / Custom" for local panels.
const ADDITIONAL_LABS: DiagnosticCatalogItem[] = [
  ["retic","Reticulocyte Count","Hematology"],["smear","Peripheral Blood Smear","Hematology"],["esr","ESR","Hematology"],["iron","Iron Studies","Biochemistry",["Serum Iron","TIBC","Transferrin Saturation","Ferritin"]],["ferritin","Serum Ferritin","Biochemistry"],["b12","Vitamin B12","Biochemistry"],["folate","Folate","Biochemistry"],["vitd","25-OH Vitamin D","Biochemistry"],["calcium","Serum Calcium","Biochemistry"],["magnesium","Serum Magnesium","Biochemistry"],["phosphate","Serum Phosphate","Biochemistry"],["amylase","Serum Amylase","Biochemistry"],["lipase","Serum Lipase","Biochemistry"],["lactate","Serum Lactate","Biochemistry"],["osmolality","Serum Osmolality","Biochemistry"],["hft","Hepatic Function Panel","Biochemistry"],["gtt","Glucose Tolerance Test (OGTT)","Endocrinology"],["insulin","Fasting Insulin","Endocrinology"],["cpeptide","C-Peptide","Endocrinology"],["fructosamine","Fructosamine","Endocrinology"],["t3t4","T3 / T4","Endocrinology"],["ft3ft4","Free T3 / Free T4","Endocrinology"],["ft4","Free T4","Endocrinology"],["anti-tpo","Anti-TPO Antibody","Endocrinology"],["anti-tg","Anti-Thyroglobulin Antibody","Endocrinology"],["cortisol","Serum Cortisol","Endocrinology"],["acth","ACTH","Endocrinology"],["prolactin","Prolactin","Endocrinology"],["lh","LH","Endocrinology"],["fsh","FSH","Endocrinology"],["estradiol","Estradiol","Endocrinology"],["progesterone","Progesterone","Endocrinology"],["testosterone","Total Testosterone","Endocrinology"],["amh","AMH","Fertility"],["beta-hcg","Serum Beta-hCG","Fertility"],["semen","Semen Analysis","Fertility"],["psa","PSA / Total PSA","Oncology"],["free-psa","Free PSA","Oncology"],["ca125","CA-125","Oncology"],["ca153","CA 15-3","Oncology"],["ca199","CA 19-9","Oncology"],["cea","CEA","Oncology"],["afp","AFP","Oncology"],["hiv","HIV 1 & 2 Ag/Ab","Serology"],["hbsag","HBsAg","Serology"],["anti-hcv","Anti-HCV","Serology"],["anti-hbs","Anti-HBs","Serology"],["anti-hbc","Anti-HBc Total / IgM","Serology"],["vdrl","VDRL / RPR","Serology"],["toxoplasma","Toxoplasma IgG / IgM","Serology"],["cmv","CMV IgG / IgM","Serology"],["ebv","EBV Serology","Serology"],["dengue","Dengue NS1 / IgM / IgG","Serology"],["malaria","Malaria Antigen / Peripheral Smear","Microbiology"],["typhoid","Typhoid Serology","Microbiology"],["chikungunya","Chikungunya IgM / IgG","Microbiology"],["lepto","Leptospira IgM","Microbiology"],["covid-pcr","SARS-CoV-2 RT-PCR","Microbiology"],["flu-pcr","Influenza A/B PCR","Microbiology"],["rsv","RSV Antigen / PCR","Microbiology"],["tb-pcr","Mycobacterium tuberculosis PCR","Microbiology"],["afb","AFB Smear","Microbiology"],["afb-culture","Mycobacterial Culture","Microbiology"],["fungal","Fungal KOH / Culture","Microbiology"],["gram","Gram Stain","Microbiology"],["wound-cs","Wound / Pus Culture & Sensitivity","Microbiology"],["csf","CSF Routine & Biochemistry","Body Fluids"],["csf-culture","CSF Culture & Sensitivity","Microbiology"],["pleural","Pleural Fluid Analysis","Body Fluids"],["ascitic","Ascitic Fluid Analysis","Body Fluids"],["synovial","Synovial Fluid Analysis","Body Fluids"],["ana","ANA","Autoimmune"],["dsdna","Anti-dsDNA","Autoimmune"],["ena","ENA Profile","Autoimmune"],["anca-full","ANCA Profile","Autoimmune"],["complement-c3c4","Complement C3 / C4","Autoimmune"],["iga","IgA","Immunology"],["igg","IgG","Immunology"],["igm","IgM","Immunology"],["ige","Total IgE","Immunology"],["ige-allergen","Specific IgE / Allergy Panel","Allergy"],["flow","Flow Cytometry","Hematology"],["electrophoresis","Serum Protein Electrophoresis","Hematology"],["immunofixation","Immunofixation Electrophoresis","Hematology"],["bcr-abl","BCR-ABL1","Molecular / Genetics"],["jaks","JAK2 Mutation","Molecular / Genetics"],["factor-v","Factor V Leiden","Coagulation"],["protein-c","Protein C","Coagulation"],["protein-s","Protein S","Coagulation"],["at3","Antithrombin III","Coagulation"],["lupus-anticoag","Lupus Anticoagulant","Coagulation"],["fibrinogen","Fibrinogen","Coagulation"],["d-dimer","D-Dimer","Coagulation"],["aptt","aPTT","Coagulation"],["thrombin","Thrombin Time","Coagulation"],["blood-group","ABO & Rh Blood Grouping","Immunohematology"],["crossmatch","Crossmatch / Compatibility Testing","Immunohematology"],["coombs-direct","Direct Coombs Test (DAT)","Immunohematology"],["coombs-indirect","Indirect Coombs Test (IAT)","Immunohematology"],["karyotype","Karyotyping","Cytogenetics"],["pcr-panel","Multiplex PCR / Molecular Panel","Molecular / Genetics"],["hpv","HPV DNA PCR","Molecular / Genetics"],["pap","Pap Smear Cytology","Cytology"],["cytology","Body Fluid / FNAC Cytology","Cytology"],["biopsy","Histopathology / Biopsy","Histopathology"],["ihc","Immunohistochemistry (IHC) Panel","Histopathology"],["molecular-oncology","Molecular Oncology / NGS Panel","Molecular / Genetics"],["drug-level","Therapeutic Drug Monitoring","Therapeutic Drug Monitoring"],["toxicology","Drug / Poison Toxicology Screen","Toxicology"]
].map(([id,name,category,components=[]])=>lab(String(id),String(name),String(category),components as string[]));

const ADDITIONAL_IMAGING: DiagnosticCatalogItem[] = [
  ["skull-xray","Skull X-Ray","Radiography","X-ray"],["facial-xray","Facial Bones / PNS X-Ray","Radiography","X-ray"],["dental-xray","Dental / OPG X-Ray","Radiography","X-ray"],["pelvis-xray","Pelvis X-Ray","Radiography","X-ray"],["hip-xray","Hip X-Ray","Radiography","X-ray"],["knee-xray","Knee X-Ray","Radiography","X-ray"],["shoulder-xray","Shoulder X-Ray","Radiography","X-ray"],["hand-xray","Hand / Wrist X-Ray","Radiography","X-ray"],["foot-xray","Foot / Ankle X-Ray","Radiography","X-ray"],["whole-spine-xray","Whole Spine / Scoliosis X-Ray","Radiography","X-ray"],["usg-kub","USG KUB","Ultrasonography & Color Doppler","Ultrasound"],["usg-thyroid","USG Thyroid","Ultrasonography & Color Doppler","Ultrasound"],["usg-breast","USG Breast","Ultrasonography & Color Doppler","Ultrasound"],["usg-scrotum","USG Scrotum","Ultrasonography & Color Doppler","Ultrasound"],["usg-neck","USG Neck","Ultrasonography & Color Doppler","Ultrasound"],["usg-dvt","Venous Doppler / DVT Study","Vascular Imaging","Ultrasound"],["usg-carotid","Carotid Doppler","Vascular Imaging","Ultrasound"],["usg-arterial","Arterial Doppler","Vascular Imaging","Ultrasound"],["usg-fetal","Fetal Growth / Obstetric Ultrasound","Obstetric Imaging","Ultrasound"],["nt-scan","NT / First Trimester Scan","Obstetric Imaging","Ultrasound"],["anomaly-scan","Level-II / Anomaly Scan","Obstetric Imaging","Ultrasound"],["fetal-doppler","Fetal Doppler","Obstetric Imaging","Ultrasound"],["transvaginal","Transvaginal Ultrasound","Gynecologic Imaging","Ultrasound"],["hrct-chest","HRCT Chest","CT","CT"],["ct-abdomen","CT Abdomen & Pelvis","CT","CT"],["ct-neck","CT Neck","CT","CT"],["ct-spine","CT Spine","CT","CT"],["ct-pns","CT PNS","CT","CT"],["ct-temporal","HRCT Temporal Bone","CT","CT"],["ct-angiography","CT Angiography","CT Angiography","CT",true],["ct-enterography","CT Enterography","CT","CT"],["ct-colonography","CT Colonography","CT","CT"],["ct-guided-biopsy","CT-Guided Biopsy / Intervention","Interventional Radiology","CT",true],["mri-head-neck","MRI Head & Neck","MRI","MRI",true],["mri-orbit","MRI Orbits","MRI","MRI",true],["mri-pituitary","MRI Pituitary","Neuro MRI","MRI",true],["mri-angiography","MRA / MR Angiography","MRA & MRV","MRI",true],["mri-venography","MRV / MR Venography","MRA & MRV","MRI",true],["mri-whole-spine","MRI Whole Spine","MRI","MRI",true],["mri-abdomen","MRI Abdomen","MRI","MRI",true],["mri-liver","MRI Liver / MRCP","MRI","MRI",true],["mri-pelvis","MRI Pelvis","MRI","MRI",true],["mri-breast","MRI Breast","Breast Imaging","MRI",true],["mri-cardiac","Cardiac MRI","Cardiac Imaging","MRI",true],["mri-prostate","Multiparametric MRI Prostate","MRI","MRI",true],["pet-ct","PET-CT","Nuclear Medicine","PET-CT",true],["pet-mri","PET-MRI","Nuclear Medicine","PET-MRI",true],["fdg-pet","FDG PET Scan","Nuclear Medicine","PET",true],["spect-ct","SPECT-CT","Nuclear Medicine","SPECT-CT",true],["bone-scan","Whole Body Bone Scan","Nuclear Medicine","SPECT",true],["thyroid-scan","Thyroid Nuclear Scan","Nuclear Medicine","Nuclear Medicine",true],["renal-scan","Renal DTPA / EC Scan","Nuclear Medicine","Nuclear Medicine",true],["dexa-hip-spine","DEXA Hip & Spine","Bone Density","DEXA",true],["dexa-forearm","DEXA Forearm","Bone Density","DEXA",true],["barium-meal","Barium Meal / Follow Through","Fluoroscopy","Fluoroscopy",true],["barium-enema","Barium Enema","Fluoroscopy","Fluoroscopy",true],["hsg","Hysterosalpingography (HSG)","Fluoroscopy","Fluoroscopy",true],["mcu","Micturating Cystourethrogram (MCU)","Fluoroscopy","Fluoroscopy",true],["vcug","Voiding Cystourethrogram (VCUG)","Fluoroscopy","Fluoroscopy",true],["ercp","ERCP","Fluoroscopy / Endoscopy","Fluoroscopy",true],["mammo-screen","Screening Mammography","Breast Imaging","Mammography",true],["mammo-diagnostic","Diagnostic Mammography","Breast Imaging","Mammography",true],["tomosynthesis","Digital Breast Tomosynthesis","Breast Imaging","Mammography",true],["echo","2D / 3D Echocardiography","Cardiac Imaging","Echo"],["stress-echo","Stress Echocardiography","Cardiac Imaging","Echo"],["tee","Transesophageal Echocardiography (TEE)","Cardiac Imaging","Echo"],["ecg","ECG / EKG","Cardiac Diagnostics","ECG"],["holter","24/48/72-Hour Holter Monitoring","Cardiac Diagnostics","Holter"],["tmt","Treadmill Test (TMT)","Cardiac Diagnostics","TMT"],["event-monitor","Event / Loop Recorder","Cardiac Diagnostics","Cardiac Monitoring"]
].map(([id,name,category,modality,contrast=false])=>imaging(String(id),String(name),String(category),String(modality),{isOutsourced:Boolean(contrast),requiresContrastConsent:String(modality)==="CT"||String(modality)==="MRI"}));

export const EXPANDED_LAB_CATALOG = [...LAB_CATALOG, ...ADDITIONAL_LABS];
export const EXPANDED_RADIOLOGY_CATALOG = [...RADIOLOGY_CATALOG, ...ADDITIONAL_IMAGING];

export const DIAGNOSTIC_CATALOG = [...EXPANDED_LAB_CATALOG, ...EXPANDED_RADIOLOGY_CATALOG];
export const DIAGNOSTIC_CATEGORIES = [...new Set(DIAGNOSTIC_CATALOG.map((item) => item.category))].sort();
export const DIAGNOSTIC_MODALITIES = [...new Set(DIAGNOSTIC_CATALOG.map((item) => item.modality))].sort();
