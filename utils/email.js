const canUseResend = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);

const sendWithResend = async ({ to, subject, html, text }) => {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
            from: process.env.RESEND_FROM,
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
            text,
        }),
    });

    if (!response.ok) {
        const payload = await response.text();
        throw new Error(`Email delivery failed: ${payload}`);
    }
};

module.exports.sendEmail = async ({ to, subject, html, text }) => {
    if (!to || !subject) {
        return;
    }

    if (!canUseResend()) {
        console.log(`[email-preview] to=${to} subject="${subject}"`);
        return;
    }

    await sendWithResend({ to, subject, html, text });
};
