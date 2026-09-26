from pathlib import Path

# diagnostics collapse
p = Path('src/app/diagnostics/page.tsx')
t = p.read_text()
t = t.replace('const open = expanded[group.patient.id] ?? true;', 'const open = expanded[group.patient.id] ?? false;')
p.write_text(t)
print('diagnostics ok')

# labs
p = Path('src/app/labs/page.tsx')
t = p.read_text()
t = t.replace('const open = expanded[groupKey] ?? (careSetting === "OPD");', 'const open = expanded[groupKey] ?? false;')
old = """                          <div className=\"flex shrink-0 flex-col gap-1\">
                            <Link href={`/patients/${o.patientId}`} className=\"text-center text-[11px] font-medium text-[#c2183a]\">
                              Chart
                            </Link>
                            <Link href={`/labs/print?id=${encodeURIComponent(o.id)}`} className=\"text-center text-[11px] font-medium text-gray-600\">
                              Print
                            </Link>
                            <button
                              type=\"button\"
                              onClick={() => setDocumentOrder(o)}
                              className=\"rounded-lg border border-[#c2183a]/30 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#c2183a]\"
                            >
                              Upload report
                            </button>
                            {isActiveStatus(o.status) && (
                              <button
                                type=\"button\"
                                onClick={() => void openResultEntry(o)}
                                className=\"rounded-lg bg-[#c2183a] px-2.5 py-1.5 text-[11px] font-semibold text-white\"
                              >
                                Enter result
                              </button>
                            )}
                            {o.status === \"Ordered\" && (
                              <button
                                type=\"button\"
                                onClick={async () => {
                                  await apiUpdateLabOrder({ id: o.id, status: \"Collected\" });
                                  await load();
                                }}
                                className=\"rounded-lg border bg-white px-2.5 py-1.5 text-[11px] font-medium\"
                              >
                                Mark collected
                              </button>
                            )}
                          </div>"""
new = """                          <div className=\"flex shrink-0 flex-wrap items-center justify-end gap-1\">
                            <Link href={`/patients/${o.patientId}`} className=\"rounded-md px-2 py-1 text-[11px] font-medium text-[#c2183a]\">Chart</Link>
                            <Link href={`/labs/print?id=${encodeURIComponent(o.id)}`} className=\"rounded-md px-2 py-1 text-[11px] font-medium text-gray-600\">Print</Link>
                            <button type=\"button\" onClick={() => setDocumentOrder(o)} className=\"rounded-md border border-[#c2183a]/30 bg-white px-2 py-1 text-[11px] font-semibold text-[#c2183a]\">Upload</button>
                            {isActiveStatus(o.status) && (
                              <button type=\"button\" onClick={() => void openResultEntry(o)} className=\"rounded-md bg-[#c2183a] px-2 py-1 text-[11px] font-semibold text-white\">Result</button>
                            )}
                            {o.status === \"Ordered\" && (
                              <button type=\"button\" onClick={async () => { await apiUpdateLabOrder({ id: o.id, status: \"Collected\" }); await load(); }} className=\"rounded-md border bg-white px-2 py-1 text-[11px] font-medium\">Collected</button>
                            )}
                          </div>"""
if old not in t:
    raise SystemExit('labs actions block missing')
t = t.replace(old, new)
t = t.replace(
    'className="flex items-start justify-between gap-2 rounded-lg bg-gray-50/80 px-2 py-1.5"',
    'className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-gray-50/80 px-2 py-1"'
)
p.write_text(t)
print('labs ok')

# OCR
p = Path('src/components/LabResultDocumentPanel.tsx')
t = p.read_text()
t = t.replace('OCR could not safely structure this report', 'Automatic OCR could not structure this report')
t = t.replace(
    'The original report is stored and the extracted text is retained as diagnostic evidence. Nothing has been written as a clinical result yet.',
    'The uploaded file is saved. Review any extracted text below, correct it, then verify to write the clinical lab result. Nothing is clinical until you verify.'
)
t = t.replace(
    'Review the original report and enter/correct the laboratory findings here. Nothing is saved as a clinical result until you verify it.',
    'Type or paste the laboratory findings from the report. Verify to save as the clinical result.'
)
p.write_text(t)
print('ocr ok')

# discharge
p = Path('src/app/ipd/[id]/page.tsx')
t = p.read_text()
old = 'setMsg(selected.name+" discharged successfully. The active IPD admission is closed; UHID/history is retained.");await load();};'
new = 'setMsg(selected.name+" discharged successfully. Opening discharge summary print…");await load();try{window.open("/ipd-summaries/"+selected.id+"/print","_blank","noopener,noreferrer");}catch(_){};'
if old not in t:
    raise SystemExit('discharge msg missing')
t = t.replace(old, new)
oldb = '{coverNoteType==="Discharge Summary"&&<button type="button" onClick={finalizeDischarge} disabled={saving} className="h-9 px-4 rounded-lg border border-red-300 text-red-700 text-xs font-semibold">{saving?"Finalizing…":"Discharge Patient"}</button>}'
newb = '{coverNoteType==="Discharge Summary"&&selected.status!=="DISCHARGED"&&<button type="button" onClick={finalizeDischarge} disabled={saving} className="h-9 px-4 rounded-lg border border-red-300 text-red-700 text-xs font-semibold">{saving?"Finalizing…":"Discharge Patient"}</button>}{coverNoteType==="Discharge Summary"&&<a href={"/ipd-summaries/"+selected.id+"/print"} target="_blank" rel="noopener noreferrer" className="h-9 px-4 rounded-lg border text-xs font-semibold inline-flex items-center text-[#c2183a]">Print / Save PDF</a>}'
if oldb not in t:
    raise SystemExit('discharge button missing')
t = t.replace(oldb, newb)
p.write_text(t)
print('discharge ok')

# workforce page
p = Path('src/app/workforce/page.tsx')
t = p.read_text()
if 'Clinic → Hospital staff' not in t:
    t = t.replace(
        'if(!wr.ok) throw new Error(wj.error||"Could not load workforce hub");\n      setRecords(wj.records||[]);setMembers(sj.members||[]);',
        'setMembers(Array.isArray(sj.members)?sj.members:[]);\n      if(!wr.ok){\n        setRecords([]);\n        setError(wj.error||"Could not load workforce hub. Staff can still be managed from Clinic → Hospital staff.");\n      } else {\n        setRecords(wj.records||[]);\n        if(wj.warning) setError(String(wj.warning));\n      }'
    )
    t = t.replace(
        '<div><h1 className="text-xl font-bold">People & Workforce</h1><p className="text-sm text-gray-500">Hospital HRIS + workforce management from hire to exit, with employee self-service and manager approvals.</p></div>',
        '<div><h1 className="text-xl font-bold">People & Workforce</h1><p className="text-sm text-gray-500">Hospital HRIS + workforce management from hire to exit, with employee self-service and manager approvals.</p><p className="mt-2 text-xs text-gray-600">To add doctors/nurses/staff accounts: open <a href="/clinic" className="font-semibold text-[#c2183a] underline">Clinic → Hospital staff</a>, create the person, then return here for HR workflows (leave, attendance, payroll notes).</p></div>'
    )
    p.write_text(t)
    print('workforce page ok')
else:
    print('workforce page already patched')

print('ALL_OK')
