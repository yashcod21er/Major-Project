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
