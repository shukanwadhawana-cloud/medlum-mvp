const view = readFileSync("src/app/api/labs/documents/[id]/view/route.ts", "utf8");
ok(view.includes("clinicId: membership.clinicId"), "view tenant-scoped");
ok(view.includes('searchParams.get("raw") === "1"'), "raw document bytes require authenticated tenant-scoped view endpoint");
ok(retryPanel.includes("Run Clinical Assist on saved report"), "lab panel first tries the saved report bytes");
ok(retryPanel.includes("Choose report file instead"), "lab panel offers a file-picker fallback if stored bytes are unavailable");