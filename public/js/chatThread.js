(() => {
    const streamRoot = document.getElementById("message-stream");
    const form = document.getElementById("message-form");

    if (!streamRoot || !form) {
        return;
    }

    const currentUserId = streamRoot.dataset.currentUserId || "";
    const streamUrl = streamRoot.dataset.streamUrl;
    const readUrl = streamRoot.dataset.readUrl;
    const textarea = form.querySelector("textarea[name='message[body]']");

    const renderMessages = (messages) => {
        if (!Array.isArray(messages) || !messages.length) {
            return;
        }

        streamRoot.innerHTML = messages.map((message) => {
            const isMine = String(message.sender?._id || "") === String(currentUserId);
            const dateLabel = new Date(message.createdAt).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
            });

            return `
                <article class="message-card ${isMine ? "mine" : ""}">
                    <strong>${escapeHtml(message.sender?.username || "User")}</strong>
                    <p>${escapeHtml(message.body || "")}</p>
                    <span>${escapeHtml(dateLabel)}</span>
                </article>
            `;
        }).join("");

        streamRoot.scrollTop = streamRoot.scrollHeight;
        if (readUrl) {
            fetch(readUrl, { method: "POST", headers: { Accept: "application/json" } }).catch(() => {});
        }
    };

    if (streamUrl && typeof window.EventSource !== "undefined") {
        const eventSource = new window.EventSource(streamUrl);
        eventSource.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data || "{}");
                if (Array.isArray(payload.messages) && payload.messages.length) {
                    renderMessages(payload.messages);
                }
            } catch (error) {
                // Ignore malformed stream events
            }
        };
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const body = String(textarea?.value || "").trim();
        if (!body) {
            return;
        }

        const response = await fetch(form.action, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                Accept: "application/json",
            },
            body: new URLSearchParams({
                "message[body]": body,
            }),
        });

        if (response.ok && textarea) {
            textarea.value = "";
        }
    });

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();
