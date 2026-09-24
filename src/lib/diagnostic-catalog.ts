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


/**
 * Specialty-level hospital ordering catalog.
 * These are individual orderable studies rather than broad "panels", so clinicians
 * can search the exact investigation from the patient consultation screen.
 * Catalog scope is based on major clinical laboratory and imaging categories used
 * by large reference laboratories and radiology terminology resources.
 */
const SPECIALTY_LABS: DiagnosticCatalogItem[] = [
  // Gastroenterology / hepatology
  ["cdiff-gdh-toxin","C. difficile GDH Antigen + Toxin A/B","Gastroenterology / Stool",["GDH antigen","Toxin A","Toxin B"]],
  ["cdiff-toxin-ab","C. difficile Toxin A/B","Gastroenterology / Stool"],
  ["h-pylori-stool","H. pylori Stool Antigen","Gastroenterology / Stool"],
  ["h-pylori-urea","H. pylori Urea Breath Test","Gastroenterology"],
  ["fecal-lactoferrin","Stool Fecal Lactoferrin","Gastroenterology / Stool"],
  ["fecal-elastase","Stool Pancreatic Elastase","Gastroenterology / Stool"],
  ["stool-fat","Stool Fat / Fecal Fat","Gastroenterology / Stool"],
  ["stool-electrolytes","Stool Electrolytes / Osmotic Gap","Gastroenterology / Stool"],
  ["stool-pcr-panel","GI Pathogen PCR Panel","Gastroenterology / Microbiology"],
  ["stool-parasite-antigen","Stool Parasite Antigen Panel","Gastroenterology / Stool"],
  ["giardia-antigen","Giardia Stool Antigen","Gastroenterology / Stool"],
  ["cryptosporidium-antigen","Cryptosporidium Stool Antigen","Gastroenterology / Stool"],
  ["entamoeba-antigen","Entamoeba histolytica Stool Antigen","Gastroenterology / Stool"],
  ["celiac-screen","Celiac Disease Screen","Gastroenterology / Immunology",["tTG-IgA","Total IgA"]],
  ["ttg-iga","Tissue Transglutaminase IgA","Gastroenterology / Immunology"],
  ["ttg-igg","Tissue Transglutaminase IgG","Gastroenterology / Immunology"],
  ["endomysial","Endomysial Antibody IgA","Gastroenterology / Immunology"],
  ["total-iga","Total IgA","Immunology"],
  ["alpha-1-antitrypsin-stool","Stool Alpha-1 Antitrypsin","Gastroenterology / Stool"],
  ["alpha-1-antitrypsin-serum","Serum Alpha-1 Antitrypsin","Gastroenterology"],
  ["ceruloplasmin","Ceruloplasmin","Hepatology"],
  ["serum-copper","Serum Copper","Hepatology"],
  ["urine-copper","24-Hour Urine Copper","Hepatology"],
  ["anti-mitochondrial","Anti-Mitochondrial Antibody (AMA)","Hepatology / Autoimmune"],
  ["anti-smooth-muscle","Anti-Smooth Muscle Antibody (ASMA)","Hepatology / Autoimmune"],
  ["anti-lkm","Anti-Liver Kidney Microsomal (LKM-1)","Hepatology / Autoimmune"],
  ["anti-sla","Soluble Liver Antigen Antibody (SLA)","Hepatology / Autoimmune"],
  ["ig-g4","IgG4","Immunology"],
  ["ammonia","Plasma Ammonia","Hepatology"],
  ["bile-acids","Serum Bile Acids","Hepatology"],
  ["fibrotest","FibroTest / FibroSure","Hepatology"],
  ["peth","Phosphatidylethanol (PEth)","Hepatology / Toxicology"],

  // Neurology / neuroimmunology
  ["csf-cell-count","CSF Cell Count & Differential","Neurology / CSF"],
  ["csf-protein","CSF Protein","Neurology / CSF"],
  ["csf-glucose","CSF Glucose","Neurology / CSF"],
  ["csf-lactate","CSF Lactate","Neurology / CSF"],
  ["csf-oligoclonal","CSF Oligoclonal Bands + Serum","Neurology / CSF"],
  ["csf-igg-index","CSF IgG Index","Neurology / CSF"],
  ["csf-albumin-index","CSF Albumin Quotient / Index","Neurology / CSF"],
  ["autoimmune-encephalitis","Autoimmune Encephalitis Antibody Panel","Neurology / Neuroimmunology"],
  ["paraneoplastic-neuro","Paraneoplastic Neurologic Antibody Panel","Neurology / Neuroimmunology"],
  ["aquaporin4","Aquaporin-4 IgG","Neurology / Neuroimmunology"],
  ["mogg","MOG-IgG","Neurology / Neuroimmunology"],
  ["nmda-r","NMDA Receptor Antibody","Neurology / Neuroimmunology"],
  ["lg1","LGI1 Antibody","Neurology / Neuroimmunology"],
  ["caspr2","CASPR2 Antibody","Neurology / Neuroimmunology"],
  ["gaba-b","GABA-B Receptor Antibody","Neurology / Neuroimmunology"],
  ["amphiphysin","Amphiphysin Antibody","Neurology / Neuroimmunology"],
  ["ganglioside","Ganglioside Antibody Panel","Neurology / Neuroimmunology"],
  ["anti-gq1b","Anti-GQ1b Antibody","Neurology / Neuroimmunology"],
  ["myelin-basic-protein","CSF Myelin Basic Protein","Neurology / CSF"],
  ["prion-rtquic","CSF RT-QuIC Prion Assay","Neurology / CSF"],
  ["tau-csf","CSF Tau / Phospho-Tau","Neurology / Neurodegeneration"],
  ["amyloid-csf","CSF Amyloid Beta","Neurology / Neurodegeneration"],
  ["achr","Acetylcholine Receptor Antibody","Neurology / Neuromuscular"],
  ["musk","MuSK Antibody","Neurology / Neuromuscular"],
  ["vgcc","Voltage-Gated Calcium Channel Antibody","Neurology / Neuromuscular"],
  ["vgkc","Voltage-Gated Potassium Channel Antibody","Neurology / Neuroimmunology"],
  ["ck-neuromuscular","Creatine Kinase (CK)","Neurology / Neuromuscular"],

  // Rheumatology / autoimmune
  ["crp","C-Reactive Protein (CRP)","Rheumatology / Inflammation"],
  ["hscrp","High-Sensitivity CRP","Rheumatology / Inflammation"],
  ["ferritin-rheum","Ferritin","Rheumatology / Inflammation"],
  ["uric-acid","Serum Uric Acid","Rheumatology"],
  ["anti-rna-pol3","RNA Polymerase III Antibody","Rheumatology / Autoimmune"],
  ["centromere","Centromere B Antibody","Rheumatology / Autoimmune"],
  ["scl70","Scl-70 Antibody","Rheumatology / Autoimmune"],
  ["jo1","Jo-1 Antibody","Rheumatology / Autoimmune"],
  ["myositis-panel","Myositis Antibody Panel","Rheumatology / Autoimmune"],
  ["dsdna-quant","Anti-dsDNA Quantitative","Rheumatology / Autoimmune"],
  ["rnp","RNP Antibody","Rheumatology / Autoimmune"],
  ["smith","Smith (Sm) Antibody","Rheumatology / Autoimmune"],
  ["ssa","SSA/Ro Antibody","Rheumatology / Autoimmune"],
  ["ssb","SSB/La Antibody","Rheumatology / Autoimmune"],
  ["cryoglobulin","Cryoglobulins","Rheumatology / Immunology"],
  ["immunoglobulin-free-light","Serum Free Light Chains","Rheumatology / Hematology"],
  ["haptoglobin","Haptoglobin","Rheumatology / Hematology"],
  ["aldolase","Aldolase","Rheumatology / Neuromuscular"],

  // Cardiology
  ["troponin-i-hs","High-Sensitivity Troponin I","Cardiology"],
  ["troponin-t-hs","High-Sensitivity Troponin T","Cardiology"],
  ["ntprobnp","NT-proBNP","Cardiology"],
  ["bnp","BNP","Cardiology"],
  ["lipoprotein-a","Lipoprotein(a)","Cardiology / Lipids"],
  ["apob","Apolipoprotein B","Cardiology / Lipids"],
  ["apoa1","Apolipoprotein A1","Cardiology / Lipids"],
  ["homocysteine","Homocysteine","Cardiology / Vascular"],
  ["hscrp-cardiac","hs-CRP Cardiovascular Risk","Cardiology / Inflammation"],
  ["ckmb","CK-MB","Cardiology"],
  ["myoglobin","Myoglobin","Cardiology"],
  ["d-dimer-cardiac","D-Dimer","Cardiology / Coagulation"],
  ["lupus-cardiac","Thrombophilia / Cardiac APS Workup","Cardiology / Coagulation"],

  // General medicine / endocrine / renal
  ["pth","Parathyroid Hormone (PTH)","Endocrinology"],
  ["ionized-calcium","Ionized Calcium","Biochemistry"],
  ["renin","Plasma Renin","Endocrinology"],
  ["aldosterone","Aldosterone","Endocrinology"],
  ["metanephrines","Plasma Free Metanephrines","Endocrinology"],
  ["urine-metanephrines","24-Hour Urine Metanephrines","Endocrinology"],
  ["dexamethasone-suppression","Overnight Dexamethasone Suppression Test","Endocrinology"],
  ["acth-stimulation","ACTH Stimulation / Synacthen Test","Endocrinology"],
  ["igf1","IGF-1","Endocrinology"],
  ["growth-hormone","Growth Hormone","Endocrinology"],
  ["calcitonin","Calcitonin","Endocrinology"],
  ["thyroglobulin","Thyroglobulin","Endocrinology"],
  ["tsh-receptor","TSH Receptor Antibody (TRAb)","Endocrinology"],
  ["17ohp","17-Hydroxyprogesterone","Endocrinology"],
  ["dhea-s","DHEA-S","Endocrinology"],
  ["androstenedione","Androstenedione","Endocrinology"],
  ["aldosterone-renin","Aldosterone / Renin Ratio","Endocrinology"],
  ["urine-protein-electro","Urine Protein Electrophoresis","Nephrology"],
  ["urine-immunofixation","Urine Immunofixation","Nephrology"],
  ["cystatin-c","Cystatin C","Nephrology"],
  ["urine-sodium","Urine Sodium","Nephrology"],
  ["urine-potassium","Urine Potassium","Nephrology"],
  ["urine-osmolality","Urine Osmolality","Nephrology"],
  ["urine-calcium","Urine Calcium","Nephrology"],
  ["urine-phosphate","Urine Phosphate","Nephrology"],

  // Infectious disease / microbiology
  ["blood-culture-aerobic","Blood Culture - Aerobic","Microbiology"],
  ["blood-culture-anaerobic","Blood Culture - Anaerobic","Microbiology"],
  ["respiratory-pcr","Respiratory Viral PCR Panel","Microbiology"],
  ["meningitis-pcr","Meningitis / Encephalitis PCR Panel","Microbiology"],
  ["giardia","Giardia Antigen","Microbiology"],
  ["cryptosporidium","Cryptosporidium Antigen","Microbiology"],
  ["hiv-viral-load","HIV-1 Viral Load","Virology"],
  ["cd4","CD4 Count / CD4 Percentage","Immunology"],
  ["hbv-dna","HBV DNA Viral Load","Virology"],
  ["hcv-rna","HCV RNA Viral Load","Virology"],
  ["hcv-genotype","HCV Genotype","Virology"],
  ["cmv-pcr","CMV PCR / Viral Load","Virology"],
  ["ebv-pcr","EBV PCR","Virology"],
  ["herpes-pcr","HSV-1/2 PCR","Virology"],
  ["vzpcr","Varicella-Zoster Virus PCR","Virology"],
  ["rsv-pcr","RSV PCR","Virology"],
  ["mpox-pcr","Mpox PCR","Virology"],
  ["blood-parasite-smear","Peripheral Blood Parasite Smear","Microbiology"],
  ["malaria-pcr","Malaria PCR","Microbiology"],
  ["dengue-pcr","Dengue PCR","Microbiology"],
  ["brucella","Brucella Serology","Microbiology"],
  ["rickettsial","Rickettsial Serology","Microbiology"],
  ["scrub-typhus","Scrub Typhus IgM","Microbiology"],
  ["leptospira-pcr","Leptospira PCR","Microbiology"],

  // Hematology / oncology
  ["retic-absolute","Absolute Reticulocyte Count","Hematology"],
  ["hbf","Hemoglobin Electrophoresis / HPLC","Hematology"],
  ["sickle-screen","Sickle Cell Screen","Hematology"],
  ["sickle-genotype","Sickle Cell Genotyping","Molecular / Genetics"],
  ["g6pd","G6PD Quantitative","Hematology"],
  ["coombs","Direct Antiglobulin Test (DAT)","Hematology / Immunohematology"],
  ["pt-mixing","PT Mixing Study","Coagulation"],
  ["aptt-mixing","aPTT Mixing Study","Coagulation"],
  ["factor-viii","Factor VIII Activity","Coagulation"],
  ["factor-ix","Factor IX Activity","Coagulation"],
  ["von-willebrand","von Willebrand Factor Panel","Coagulation"],
  ["platelet-function","Platelet Function Testing","Coagulation"],
  ["jak2-v617f","JAK2 V617F Mutation","Hematology / Molecular"],
  ["calr","CALR Mutation","Hematology / Molecular"],
  ["mpl","MPL Mutation","Hematology / Molecular"],
  ["pml-rara","PML-RARA","Hematology / Molecular"],
  ["flow-leukemia","Leukemia / Lymphoma Flow Cytometry","Hematology / Molecular"],
  ["myeloma-panel","Multiple Myeloma Workup","Hematology / Oncology",["SPEP","Immunofixation","Free Light Chains"]],
  ["ldh","LDH","Biochemistry"],
  ["beta2-microglobulin","Beta-2 Microglobulin","Hematology / Oncology"],

  // Pediatrics / neonatology
  ["newborn-screen","Newborn Screening Panel","Pediatrics / Neonatology"],
  ["cord-blood-gas","Cord Blood Gas","Pediatrics / Neonatology"],
  ["bilirubin-neonatal","Neonatal Bilirubin","Pediatrics / Neonatology"],
  ["retic-neonatal","Neonatal Reticulocyte Count","Pediatrics / Neonatology"],
  ["procalcitonin-neonatal","Procalcitonin","Pediatrics / Neonatology"],
  ["sweat-chloride","Sweat Chloride Test","Pediatrics"],
  ["cystic-fibrosis","Cystic Fibrosis Molecular Panel","Pediatrics / Molecular"],
  ["fragile-x","Fragile X Testing","Pediatrics / Genetics"],
  ["inborn-metabolic","Inborn Errors of Metabolism Screen","Pediatrics / Metabolic"],
  ["amino-acids","Plasma Amino Acids","Metabolic / Genetics"],
  ["organic-acids","Urine Organic Acids","Metabolic / Genetics"],
  ["acylcarnitine","Acylcarnitine Profile","Metabolic / Genetics"],
  ["lactate-pediatric","Lactate","Pediatrics / Metabolic"],

  // Gynecology / obstetrics / fertility
  ["amh-fertility","Anti-Müllerian Hormone (AMH)","Gynecology / Fertility"],
  ["ovarian-reserve","Ovarian Reserve Profile","Gynecology / Fertility",["AMH","FSH","Estradiol"]],
  ["prenatal-screen","Prenatal Screening Profile","Obstetrics"],
  ["double-marker","First Trimester Combined / Double Marker","Obstetrics"],
  ["quad-screen","Second Trimester Quadruple Screen","Obstetrics"],
  ["nipt","Non-Invasive Prenatal Testing (NIPT)","Obstetrics / Genetics"],
  ["rubella","Rubella IgG / IgM","Obstetrics"],
  ["toxoplasma-ob","Toxoplasma IgG / IgM","Obstetrics"],
  ["cmv-ob","CMV IgG / IgM","Obstetrics"],
  ["group-b-strep","Group B Streptococcus Screen","Obstetrics / Microbiology"],
  ["vaginal-swab-culture","Vaginal / Cervical Swab Culture","Gynecology / Microbiology"],
  ["hpv-high-risk","High-Risk HPV DNA Test","Gynecology / Molecular"],
  ["chlamydia-gonorrhea","Chlamydia / Gonorrhea NAAT","Gynecology / Microbiology"],
  ["prolactin-fertility","Prolactin","Gynecology / Fertility"],
  ["semen-complete","Semen Analysis with Motility / Morphology","Andrology / Fertility"],

  // Allergy / immunology
  ["ige-total","Total IgE","Allergy / Immunology"],
  ["ige-food","Food Specific IgE Panel","Allergy / Immunology"],
  ["ige-inhalant","Inhalant / Respiratory Allergy Panel","Allergy / Immunology"],
  ["complement-ch50","Total Complement (CH50)","Immunology"],
  ["tryptase","Serum Tryptase","Allergy / Immunology"],
  ["immunodeficiency","Primary Immunodeficiency Screen","Immunology"],

  // Transplant / critical care
  ["hla-typing","HLA Typing","Transplant / Immunology"],
  ["hla-crossmatch","HLA Crossmatch","Transplant / Immunology"],
  ["tacrolimus","Tacrolimus Level","Therapeutic Drug Monitoring"],
  ["cyclosporine","Cyclosporine Level","Therapeutic Drug Monitoring"],
  ["vancomycin-level","Vancomycin Level","Therapeutic Drug Monitoring"],
  ["gentamicin-level","Gentamicin Level","Therapeutic Drug Monitoring"],
  ["digoxin-level","Digoxin Level","Therapeutic Drug Monitoring"],
  ["lithium-level","Lithium Level","Therapeutic Drug Monitoring"],
  ["salicylate","Salicylate Level","Toxicology"],
  ["acetaminophen","Acetaminophen Level","Toxicology"],
  ["ethanol","Blood Ethanol","Toxicology"]
].map(([id,name,category,components=[]])=>lab(String(id),String(name),String(category),components as string[]));

const SPECIALTY_IMAGING: DiagnosticCatalogItem[] = [
  // GI / hepatobiliary
  ["usg-liver","USG Liver / Hepatobiliary System","Gastrointestinal Imaging","Ultrasound"],
  ["usg-pancreas","USG Pancreas","Gastrointestinal Imaging","Ultrasound"],
  ["usg-spleen","USG Spleen","Abdominal Imaging","Ultrasound"],
  ["usg-portal","Portal Vein Doppler","Vascular Imaging","Ultrasound"],
  ["ct-liver-triphasic","Triphasic CT Liver","Abdominal CT","CT"],
  ["ct-pancreas-protocol","Pancreas Protocol CT","Abdominal CT","CT"],
  ["ct-enterography-gi","CT Enterography","Gastrointestinal Imaging","CT"],
  ["mr-enterography","MR Enterography","Gastrointestinal Imaging","MRI"],
  ["mrcp-detailed","MRCP / MR Cholangiopancreatography","Hepatobiliary Imaging","MRI"],
  ["fibroscan","Transient Elastography / FibroScan","Hepatobiliary Imaging","Ultrasound"],
  ["barium-followthrough","Small Bowel Follow-Through","Fluoroscopy","Fluoroscopy"],
  ["esophagram","Contrast Esophagram","Fluoroscopy","Fluoroscopy"],
  ["upper-gi-series","Upper GI Contrast Series","Fluoroscopy","Fluoroscopy"],

  // Neuro
  ["ct-perfusion-brain","CT Brain Perfusion","Neuroimaging","CT",true],
  ["cta-head-neck","CT Angiography Head & Neck","Neurovascular Imaging","CT",true],
  ["ct-venogram-brain","CT Cerebral Venography","Neurovascular Imaging","CT",true],
  ["mri-epilepsy","MRI Brain Epilepsy Protocol","Neuro MRI","MRI"],
  ["mri-ms","MRI Brain / Spine Multiple Sclerosis Protocol","Neuro MRI","MRI"],
  ["mri-iac","MRI Internal Auditory Canals","Neuro MRI","MRI"],
  ["mri-sella","MRI Sella / Pituitary","Neuro MRI","MRI"],
  ["mra-neck","MRA Neck","Neurovascular Imaging","MRI"],
  ["mr-perfusion","MR Brain Perfusion","Neuro MRI","MRI"],
  ["mr-spectroscopy","MR Brain Spectroscopy","Neuro MRI","MRI"],
  ["mri-tractography","MR Diffusion Tensor / Tractography","Neuro MRI","MRI"],
  ["carotid-duplex","Carotid Duplex Ultrasound","Neurovascular Imaging","Ultrasound"],
  ["transcranial-doppler","Transcranial Doppler","Neurovascular Imaging","Ultrasound"],

  // Cardiac
  ["echo-contrast","Contrast Echocardiography","Cardiac Imaging","Echo",true],
  ["tee-3d","3D Transesophageal Echocardiography","Cardiac Imaging","Echo",true],
  ["stress-mri","Stress Cardiac MRI","Cardiac Imaging","MRI",true],
  ["cardiac-ct","CT Coronary / Cardiac CT","Cardiac Imaging","CT",true],
  ["ct-aortic","CT Aortography","Vascular Imaging","CT",true],
  ["ct-pulmonary-angiogram","CT Pulmonary Angiogram","Vascular Imaging","CT",true],
  ["coronary-calcium","CT Coronary Calcium Score","Cardiac Imaging","CT"],
  ["nuclear-myocardial-perfusion","Myocardial Perfusion SPECT","Nuclear Cardiology","SPECT",true],
  ["cardiac-pet","Cardiac FDG PET","Nuclear Cardiology","PET",true],

  // Pulmonary / thoracic
  ["ct-highres-chest","High-Resolution CT Chest","Thoracic Imaging","CT"],
  ["ct-pe","CT Pulmonary Angiography","Thoracic Imaging","CT",true],
  ["ct-lowdose-chest","Low-Dose CT Chest","Thoracic Imaging","CT"],
  ["ct-virtual-bronchoscopy","CT Virtual Bronchoscopy","Thoracic Imaging","CT"],
  ["usg-pleura","Pleural / Thoracic Ultrasound","Thoracic Imaging","Ultrasound"],
  ["vqa-scan","Ventilation / Perfusion (V/Q) Scan","Nuclear Medicine","Nuclear Medicine",true],

  // MSK / sports
  ["mri-knee","MRI Knee","Musculoskeletal MRI","MRI"],
  ["mri-shoulder","MRI Shoulder","Musculoskeletal MRI","MRI"],
  ["mri-hip","MRI Hip","Musculoskeletal MRI","MRI"],
  ["mri-ankle","MRI Ankle / Foot","Musculoskeletal MRI","MRI"],
  ["mri-wrist","MRI Wrist / Hand","Musculoskeletal MRI","MRI"],
  ["mri-elbow","MRI Elbow","Musculoskeletal MRI","MRI"],
  ["mri-sacroiliac","MRI Sacroiliac Joints","Musculoskeletal MRI","MRI"],
  ["ct-extremity","CT Extremity / Joint","Musculoskeletal CT","CT"],
  ["usg-msk","Musculoskeletal Ultrasound","Musculoskeletal Imaging","Ultrasound"],

  // Breast / women
  ["breast-usg-targeted","Targeted Breast Ultrasound","Breast Imaging","Ultrasound"],
  ["breast-mri-contrast","Contrast Breast MRI","Breast Imaging","MRI",true],
  ["stereotactic-biopsy","Stereotactic Breast Biopsy","Breast Interventional","Mammography",true],
  ["wire-localization","Image-Guided Breast Localization","Breast Interventional","Mammography",true],

  // Pediatric / emergency
  ["peds-usg-head","Pediatric / Neonatal Cranial Ultrasound","Pediatric Imaging","Ultrasound"],
  ["peds-usg-pylorus","Pediatric Pyloric Ultrasound","Pediatric Imaging","Ultrasound"],
  ["peds-usg-appendix","Pediatric Appendix Ultrasound","Pediatric Imaging","Ultrasound"],
  ["peds-barium","Pediatric Upper GI / Contrast Study","Pediatric Imaging","Fluoroscopy"],
  ["peds-mcu","Pediatric MCU / VCUG","Pediatric Imaging","Fluoroscopy"],
  ["trauma-pan-scan","Trauma CT / Whole-Body CT","Emergency Imaging","CT",true],

  // Nuclear medicine / oncology
  ["pet-fdg-wholebody","FDG PET/CT Whole Body","Nuclear Oncology","PET-CT",true],
  ["pet-fdg-brain","FDG PET Brain","Nuclear Neurology","PET",true],
  ["pet-psma","PSMA PET/CT","Nuclear Oncology","PET-CT",true],
  ["pet-dotatate","DOTATATE PET/CT","Nuclear Oncology","PET-CT",true],
  ["pet-fluoride","Fluoride PET/CT Bone Imaging","Nuclear Oncology","PET-CT",true],
  ["pet-amyloid","Amyloid PET/CT Brain","Nuclear Neurology","PET-CT",true],
  ["spect-ct-parathyroid","Parathyroid SPECT/CT","Nuclear Medicine","SPECT-CT",true],
  ["spect-ct-lung","V/Q SPECT/CT","Nuclear Medicine","SPECT-CT",true],
  ["thyroid-uptake","Thyroid Uptake / Scan","Nuclear Medicine","Nuclear Medicine",true],
  ["mibg-scan","MIBG Scan","Nuclear Medicine","Nuclear Medicine",true],
  ["hida-scan","Hepatobiliary / HIDA Scan","Nuclear Medicine","Nuclear Medicine",true],
  ["gastric-emptying","Gastric Emptying Study","Nuclear Medicine","Nuclear Medicine",true],
  ["renal-dmsa","DMSA Renal Scan","Nuclear Medicine","Nuclear Medicine",true],

  // Interventional / image-guided
  ["usg-guided-biopsy","Ultrasound-Guided Biopsy / Aspiration","Interventional Imaging","Ultrasound",true],
  ["ct-guided-drain","CT-Guided Drainage","Interventional Imaging","CT",true],
  ["usg-guided-drain","Ultrasound-Guided Drainage","Interventional Imaging","Ultrasound",true],
  ["image-guided-liver-biopsy","Image-Guided Liver Biopsy","Interventional Imaging","Ultrasound",true],
  ["image-guided-thyroid-biopsy","Image-Guided Thyroid FNAC / Biopsy","Interventional Imaging","Ultrasound",true]
].map(([id,name,category,modality,contrast=false])=>imaging(String(id),String(name),String(category),String(modality),{isOutsourced:Boolean(contrast),requiresContrastConsent:Boolean(contrast)}));

export const EXPANDED_LAB_CATALOG = Array.from(new Map([...LAB_CATALOG, ...ADDITIONAL_LABS, ...SPECIALTY_LABS].map((item) => [item.id, item])).values());
export const EXPANDED_RADIOLOGY_CATALOG = Array.from(new Map([...RADIOLOGY_CATALOG, ...ADDITIONAL_IMAGING, ...SPECIALTY_IMAGING].map((item) => [item.id, item])).values());

export const DIAGNOSTIC_CATALOG = [...EXPANDED_LAB_CATALOG, ...EXPANDED_RADIOLOGY_CATALOG];
export const DIAGNOSTIC_CATEGORIES = [...new Set(DIAGNOSTIC_CATALOG.map((item) => item.category))].sort();
export const DIAGNOSTIC_MODALITIES = [...new Set(DIAGNOSTIC_CATALOG.map((item) => item.modality))].sort();
