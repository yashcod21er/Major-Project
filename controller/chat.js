const ChatThread = require("../models/chatThread");
const Listing = require("../models/listing");
const { createNotification } = require("../utils/notifications");

const threadSubscribers = new Map();

const ensureParticipant = (thread, userId) =>
    (thread.participants || []).some((participantId) => String(participantId) === String(userId));

const getParticipantId = (value) => String(value?._id || value);

const getUnreadCount = (thread, userId) => {
    const readState = (thread.readStates || []).find((entry) => getParticipantId(entry.user) === String(userId));
    const lastReadAt = readState?.lastReadAt ? new Date(readState.lastReadAt) : new Date(0);

    return (thread.messages || []).filter((message) =>
        getParticipantId(message.sender) !== String(userId) &&
        new Date(message.createdAt) > lastReadAt
    ).length;
};

const markThreadRead = async (thread, userId) => {
    const existingState = (thread.readStates || []).find((entry) => getParticipantId(entry.user) === String(userId));
    if (existingState) {
        existingState.lastReadAt = new Date();
    } else {
        thread.readStates.push({ user: userId, lastReadAt: new Date() });
    }

    await thread.save();
};

const addSubscriber = (threadId, res) => {
    const key = String(threadId);
    if (!threadSubscribers.has(key)) {
        threadSubscribers.set(key, new Set());
    }

    threadSubscribers.get(key).add(res);
};

const removeSubscriber = (threadId, res) => {
    const key = String(threadId);
    const subscribers = threadSubscribers.get(key);
    if (!subscribers) return;
    subscribers.delete(res);
    if (!subscribers.size) {
        threadSubscribers.delete(key);
    }
};

const serializeThreadMessages = (thread) => (thread.messages || []).map((message) => ({
    _id: message._id,
    sender: {
        _id: message.sender?._id || message.sender,
        username: message.sender?.username || "User",
    },
    body: message.body,
    createdAt: message.createdAt,
}));

const broadcastThread = (thread) => {
    const subscribers = threadSubscribers.get(String(thread._id));
    if (!subscribers || !subscribers.size) {
        return;
    }

    const payload = JSON.stringify({
        messages: serializeThreadMessages(thread),
    });

    subscribers.forEach((res) => {
        res.write(`data: ${payload}\n\n`);
    });
};

module.exports.index = async (req, res) => {
    const threads = await ChatThread.find({ participants: req.user._id })
        .populate("listing")
        .populate("host")
        .populate("guest")
        .populate("messages.sender")
        .sort({ lastMessageAt: -1 });

    const normalizedThreads = threads.map((thread) => ({
        ...thread.toObject(),
        unreadCount: getUnreadCount(thread, req.user._id),
    }));

    res.render("./chat/index.ejs", { threads: normalizedThreads });
};

module.exports.startThread = async (req, res) => {
    const listing = await Listing.findById(req.params.listingId).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    if (String(listing.owner?._id) === String(req.user._id)) {
        req.flash("error", "You cannot open a guest chat for your own listing.");
        return res.redirect(`/listings/${listing._id}`);
    }

    const thread = await ChatThread.findOneAndUpdate(
        {
            listing: listing._id,
            host: listing.owner._id,
            guest: req.user._id,
        },
        {
            $setOnInsert: {
                participants: [listing.owner._id, req.user._id],
                messages: [],
                readStates: [
                    { user: listing.owner._id, lastReadAt: new Date() },
                    { user: req.user._id, lastReadAt: new Date() },
                ],
                lastMessageAt: new Date(),
            },
        },
        {
            new: true,
            upsert: true,
        }
    );

    res.redirect(`/chat/threads/${thread._id}`);
};

module.exports.showThread = async (req, res) => {
    const thread = await ChatThread.findById(req.params.threadId)
        .populate("listing")
        .populate("host")
        .populate("guest")
        .populate("messages.sender");

    if (!thread || !ensureParticipant(thread, req.user._id)) {
        req.flash("error", "Chat thread not found.");
        return res.redirect("/chat");
    }

    await markThreadRead(thread, req.user._id);
    res.render("./chat/thread.ejs", { thread });
};

module.exports.streamThread = async (req, res) => {
    const thread = await ChatThread.findById(req.params.threadId);

    if (!thread || !ensureParticipant(thread, req.user._id)) {
        return res.status(404).end();
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    addSubscriber(thread._id, res);

    res.write(`data: ${JSON.stringify({ messages: [] })}\n\n`);

    req.on("close", () => {
        removeSubscriber(thread._id, res);
    });
};

module.exports.sendMessage = async (req, res) => {
    const thread = await ChatThread.findById(req.params.threadId)
        .populate("listing")
        .populate("host")
        .populate("guest");

    if (!thread || !ensureParticipant(thread, req.user._id)) {
        req.flash("error", "Chat thread not found.");
        return res.redirect("/chat");
    }

    const body = String(req.body.message?.body || "").trim();
    if (!body) {
        req.flash("error", "Message cannot be empty.");
        return res.redirect(`/chat/threads/${thread._id}`);
    }

    thread.messages.push({
        sender: req.user._id,
        body,
    });
    thread.lastMessageAt = new Date();
    const senderReadState = (thread.readStates || []).find((entry) => getParticipantId(entry.user) === String(req.user._id));
    if (senderReadState) {
        senderReadState.lastReadAt = new Date();
    } else {
        thread.readStates.push({ user: req.user._id, lastReadAt: new Date() });
    }
    await thread.save();

    const recipientId = String(thread.host?._id) === String(req.user._id) ? thread.guest?._id : thread.host?._id;
    await createNotification({
        user: recipientId,
        title: "New chat message",
        body: `New message about ${thread.listing?.title || "your stay"}.`,
        type: "chat",
        link: `/chat/threads/${thread._id}`,
    });

    const populatedThread = await ChatThread.findById(thread._id)
        .populate("messages.sender");
    broadcastThread(populatedThread);

    const acceptsJson = String(req.headers.accept || "").includes("application/json");
    if (acceptsJson) {
        return res.json({
            message: serializeThreadMessages(populatedThread).slice(-1)[0],
        });
    }

    res.redirect(`/chat/threads/${thread._id}`);
};

module.exports.markRead = async (req, res) => {
    const thread = await ChatThread.findById(req.params.threadId);

    if (!thread || !ensureParticipant(thread, req.user._id)) {
        return res.status(404).json({ message: "Thread not found." });
    }

    await markThreadRead(thread, req.user._id);
    res.json({ ok: true });
};
