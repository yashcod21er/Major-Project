const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = new Schema(
    {
        sender: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        body: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: true }
);

const readStateSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        lastReadAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

const chatThreadSchema = new Schema(
    {
        listing: {
            type: Schema.Types.ObjectId,
            ref: "Listing",
            required: true,
        },
        host: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        guest: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        participants: {
            type: [
                {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                },
            ],
            default: [],
        },
        messages: {
            type: [messageSchema],
            default: [],
        },
        readStates: {
            type: [readStateSchema],
            default: [],
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

chatThreadSchema.index({ listing: 1, host: 1, guest: 1 }, { unique: true });

module.exports = mongoose.model("ChatThread", chatThreadSchema);
