const escapePdfText = (value) => String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

module.exports = function buildInvoicePdf(lines = []) {
    const textLines = lines.length ? lines : ["UrbanStay Invoice"];
    const content = [
        "BT",
        "/F1 12 Tf",
        "50 760 Td",
        ...textLines.map((line, index) => `${index === 0 ? "" : "0 -18 Td"} (${escapePdfText(line)}) Tj`),
        "ET",
    ].join("\n");

    const objects = [
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj",
        `4 0 obj << /Length ${Buffer.byteLength(content, "utf8")} >> stream\n${content}\nendstream endobj`,
        "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];

    objects.forEach((object) => {
        offsets.push(Buffer.byteLength(pdf, "utf8"));
        pdf += `${object}\n`;
    });

    const xrefStart = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    offsets.slice(1).forEach((offset) => {
        pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return Buffer.from(pdf, "utf8");
};
