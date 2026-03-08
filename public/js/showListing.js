(() => {
    initializeGallery();
    initializeBookingForm();

    function initializeGallery() {
        const galleryRoot = document.querySelector("[data-gallery-root]");
        const activeImage = document.querySelector("[data-gallery-active]");
        const previousButton = document.querySelector("[data-gallery-prev]");
        const nextButton = document.querySelector("[data-gallery-next]");
        const thumbButtons = Array.from(document.querySelectorAll("[data-gallery-thumb]"));

        if (!galleryRoot || !activeImage || !thumbButtons.length) {
            return;
        }

        let activeIndex = thumbButtons.findIndex((button) => button.classList.contains("active"));
        if (activeIndex < 0) {
            activeIndex = 0;
        }

        const updateGallery = (nextIndex) => {
            const normalizedIndex = (nextIndex + thumbButtons.length) % thumbButtons.length;
            const activeThumb = thumbButtons[normalizedIndex];
            if (!activeThumb) {
                return;
            }

            activeImage.src = activeThumb.dataset.imageUrl;
            activeImage.alt = activeThumb.dataset.imageAlt;
            activeIndex = normalizedIndex;

            thumbButtons.forEach((button, index) => {
                button.classList.toggle("active", index === activeIndex);
            });
        };

        thumbButtons.forEach((button, index) => {
            button.addEventListener("click", () => updateGallery(index));
        });

        if (previousButton) {
            previousButton.addEventListener("click", () => updateGallery(activeIndex - 1));
        }

        if (nextButton) {
            nextButton.addEventListener("click", () => updateGallery(activeIndex + 1));
        }
    }

    function initializeBookingForm() {
        const bookingCard = document.getElementById("booking-card");
        const bookingForm = document.getElementById("booking-form");
        const startInput = document.getElementById("startDate");
        const endInput = document.getElementById("endDate");
        const couponInput = document.getElementById("couponCode");
        const validationNode = document.getElementById("booking-validation-message");
        const submitButton = document.getElementById("booking-submit-btn");
        const totalNode = document.getElementById("booking-total");

        if (!bookingCard || !bookingForm || !startInput || !endInput || !validationNode || !submitButton || !totalNode) {
            return;
        }

        const razorpayEnabled = bookingCard.dataset.razorpayEnabled === "true";
        const pricePerNight = Number(bookingCard.dataset.pricePerNight || "0");
        const orderEndpoint = bookingCard.dataset.orderEndpoint;
        const verifyEndpoint = bookingCard.dataset.verifyEndpoint;
        const keyId = bookingCard.dataset.razorpayKeyId;
        const listingTitle = bookingCard.dataset.listingTitle || "UrbanStay booking";
        const userName = bookingCard.dataset.userName || "";
        const userEmail = bookingCard.dataset.userEmail || "";
        const defaultButtonLabel = submitButton.textContent;

        let blockedRanges = [];

        try {
            blockedRanges = JSON.parse(bookingCard.dataset.bookings || "[]");
        } catch (error) {
            blockedRanges = [];
        }

        const hasOverlap = (startDate, endDate) => blockedRanges.some((range) => {
            const rangeStart = new Date(range.start);
            const rangeEnd = new Date(range.end);
            return startDate <= rangeEnd && endDate >= rangeStart;
        });

        const getNightCount = (startDate, endDate) => Math.round((endDate - startDate) / (24 * 60 * 60 * 1000));

        const setSubmitting = (isSubmitting, label = defaultButtonLabel) => {
            submitButton.disabled = isSubmitting;
            submitButton.textContent = label;
        };

        const updateCheckoutMin = () => {
            if (startInput.value) {
                endInput.min = startInput.value;
            }
        };

        const showValidation = (message) => {
            validationNode.textContent = message;
            validationNode.classList.remove("d-none");
        };

        const clearValidation = () => {
            validationNode.textContent = "";
            validationNode.classList.add("d-none");
        };

        const updateTotal = () => {
            if (!startInput.value || !endInput.value) {
                totalNode.textContent = "Select dates to calculate your total.";
                return null;
            }

            const startDate = new Date(startInput.value);
            const endDate = new Date(endInput.value);
            const nights = getNightCount(startDate, endDate);

            if (!Number.isInteger(nights) || nights <= 0) {
                totalNode.textContent = "Choose at least one night.";
                return null;
            }

            const total = nights * pricePerNight;
            totalNode.textContent = `${nights} night${nights > 1 ? "s" : ""} x Rs. ${pricePerNight.toLocaleString("en-IN")} = Rs. ${total.toLocaleString("en-IN")}`;
            return { nights, total };
        };

        const validateBookingSelection = () => {
            clearValidation();

            if (!startInput.value || !endInput.value) {
                return { valid: false, message: "Select both check-in and check-out dates." };
            }

            const startDate = new Date(startInput.value);
            const endDate = new Date(endInput.value);

            if (startDate >= endDate) {
                return { valid: false, message: "Check-out must be after check-in." };
            }

            if (hasOverlap(startDate, endDate)) {
                return { valid: false, message: "Selected dates overlap with a blocked range." };
            }

            return { valid: true };
        };

        const createOrder = async () => {
            const response = await fetch(orderEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    booking: {
                        startDate: startInput.value,
                        endDate: endInput.value,
                        couponCode: couponInput?.value?.trim() || "",
                    },
                }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.message || "Unable to create Razorpay order.");
            }

            return payload;
        };

        const verifyPayment = async (paymentPayload) => {
            const response = await fetch(verifyEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(paymentPayload),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.message || "Unable to verify Razorpay payment.");
            }

            return payload;
        };

        startInput.addEventListener("change", () => {
            updateCheckoutMin();
            clearValidation();
            updateTotal();
        });

        endInput.addEventListener("change", () => {
            clearValidation();
            updateTotal();
        });

        bookingForm.addEventListener("submit", async (event) => {
            const validation = validateBookingSelection();
            if (!validation.valid) {
                event.preventDefault();
                showValidation(validation.message);
                return;
            }

            if (!razorpayEnabled) {
                return;
            }

            event.preventDefault();

            if (typeof window.Razorpay === "undefined") {
                showValidation("Razorpay Checkout failed to load. Refresh the page and try again.");
                return;
            }

            try {
                setSubmitting(true, "Creating secure checkout...");
                const order = await createOrder();
                const quote = updateTotal();
                if (Number(order.discountAmount || 0) > 0) {
                    totalNode.textContent = `Base Rs. ${Number(order.totalPrice || 0).toLocaleString("en-IN")} - Discount Rs. ${Number(order.discountAmount || 0).toLocaleString("en-IN")} = Rs. ${Number(order.payableTotal || 0).toLocaleString("en-IN")}`;
                }

                const checkout = new window.Razorpay({
                    key: keyId || order.keyId,
                    amount: order.amount,
                    currency: order.currency,
                    name: "UrbanStay",
                    description: `${listingTitle} booking`,
                    order_id: order.orderId,
                    prefill: {
                        name: userName || order.user?.name || "",
                        email: userEmail || order.user?.email || "",
                    },
                    notes: {
                        listing: listingTitle,
                        nights: quote ? String(quote.nights) : String(order.nights || ""),
                    },
                    theme: {
                        color: "#ff385c",
                    },
                    modal: {
                        ondismiss() {
                            setSubmitting(false);
                        },
                    },
                    handler: async (response) => {
                        try {
                            setSubmitting(true, "Verifying payment...");
                            const verification = await verifyPayment(response);
                            window.location.assign(verification.redirectUrl);
                        } catch (error) {
                            showValidation(error.message);
                            setSubmitting(false);
                        }
                    },
                });

                checkout.on("payment.failed", (response) => {
                    const message = response.error?.description || "Payment failed. Please try again.";
                    showValidation(message);
                    setSubmitting(false);
                });

                checkout.open();
                setSubmitting(false);
            } catch (error) {
                showValidation(error.message);
                setSubmitting(false);
            }
        });

        updateCheckoutMin();
        updateTotal();
    }
})();
