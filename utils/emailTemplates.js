const wrapHtml = (title, body) => `
    <div style="font-family:Arial,sans-serif;background:#f7f7f7;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;padding:24px;border:1px solid #ececec;">
            <h1 style="margin:0 0 12px;color:#111;font-size:24px;">${title}</h1>
            ${body}
            <p style="margin:20px 0 0;color:#6b6b6b;font-size:13px;">UrbanStay</p>
        </div>
    </div>
`;

module.exports.buildSimpleEmail = ({ title, intro, lines = [] }) => {
    const htmlBody = `
        <p style="color:#444;font-size:15px;line-height:1.6;">${intro}</p>
        <ul style="padding-left:18px;color:#444;font-size:14px;line-height:1.7;">
            ${lines.map((line) => `<li>${line}</li>`).join("")}
        </ul>
    `;

    return {
        html: wrapHtml(title, htmlBody),
        text: [intro, ...lines].join("\n"),
    };
};

module.exports.buildActionEmail = ({ title, intro, actionLabel, actionUrl, outro = "" }) => {
    const htmlBody = `
        <p style="color:#444;font-size:15px;line-height:1.7;">${intro}</p>
        <p style="margin:20px 0;">
            <a
                href="${actionUrl}"
                style="display:inline-block;background:#ff385c;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:999px;">
                ${actionLabel}
            </a>
        </p>
        <p style="color:#6b6b6b;font-size:13px;line-height:1.6;word-break:break-word;">If the button does not work, open this link: ${actionUrl}</p>
        ${outro ? `<p style="color:#444;font-size:14px;line-height:1.7;">${outro}</p>` : ""}
    `;

    return {
        html: wrapHtml(title, htmlBody),
        text: [intro, `${actionLabel}: ${actionUrl}`, outro].filter(Boolean).join("\n\n"),
    };
};
