import { BookingService } from "@workspace/shared/services/booking.service";
import { JvzooServerService } from "@workspace/shared/services/jvzoo.service";
import { ApiError } from "@workspace/shared/utils/ApiError";
import { Service } from "@workspace/shared/services/service.base";
import { UseClassMiddleware } from "@workspace/shared/decorators/useClassMiddleware";
import { loggerMiddleware } from "@workspace/shared/middlewares/logger.middleware";
import { type CreateBookingFromCartInput } from "@workspace/shared/schemas/booking.schema";

@UseClassMiddleware(loggerMiddleware)
export class CheckoutService extends Service {
	/** Function to be used in the confirm checkout action function */
	async confirmCheckout(input: CreateBookingFromCartInput) {
		if (!input.added_by) {
			return { success: false, clientSecret: null, bookingRef: null, error: "User not found" };
		}

		let bookingRef: string | null = null;
		let clientSecret: string | null = null;

		try {
			const bookingSvc = await this.createSubService(BookingService);
			try {
				bookingRef = await bookingSvc.createBookingFromCart(input);
			} catch (error: any) {
				return {
					success: false,
					clientSecret: null,
					bookingRef,
					error:
						error instanceof ApiError
							? error.message
							: error.message || "Failed to create booking",
				};
			}

			if (bookingRef == null) {
				return {
					success: false,
					clientSecret: null,
					bookingRef,
					error: new ApiError("Failed to create booking", 500, []),
				};
			}

			return { success: true, clientSecret, bookingRef, error: null };
		} catch (error: any) {
			return {
				success: false,
				clientSecret,
				bookingRef,
				error:
					error instanceof ApiError ? error.message : error.message || "Failed to create booking",
			};
		}
	}

	/** Resume payment by redirecting to JVZoo checkout */
	async resumePayment(bookingRef: string) {
		try {
			const { data: booking, error: fetchErr } = await this.supabase
				.from(this.BOOKINGS_TABLE)
				.select(
					`
					id,
					total,
					payment_id,
					booking_ref,
					customer_email,
					booking_status,
					payment:${this.PAYMENTS_TABLE}!inner (
						payment_status,
						checkout_session_id
					)
				`,
				)
				.eq("booking_ref", bookingRef)
				.single();

			if (fetchErr || !booking) {
				return { error: "Booking not found" };
			}

			if (
				booking.booking_status === "CONFIRMED" ||
				booking.booking_status === "CANCELLED" ||
				booking.payment.payment_status === "PAID" ||
				booking.payment.payment_status === "REFUNDED"
			) {
				return {
					error: "Cannot retry payment. Payment already completed or booking cancelled/refunded.",
				};
			}

			const jvzooSvc = new JvzooServerService();
			const { url, error } = jvzooSvc.createCheckoutUrl({
				bookingRef: booking.booking_ref,
				customer_email: booking.customer_email ?? undefined,
			});

			if (error || !url) {
				return { error: error?.message || "Failed to create payment URL" };
			}

			if (booking.payment_id) {
				const { error: updateErr } = await this.supabase
					.from(this.PAYMENTS_TABLE)
					.update({ checkout_session_id: url })
					.eq("id", booking.payment_id);

				if (updateErr) {
					console.error("Failed to update checkout URL:", updateErr);
				}
			}

			return {
				success: true,
				url,
				sessionId: url,
			};
		} catch (err: any) {
			console.error("Resume payment error:", err);
			return { error: err.message || "Failed to resume payment" };
		}
	}

	/** Create JVZoo checkout URL for a new booking */
	async createCheckoutUrl({
		bookingRef,
		customer_email,
	}: {
		bookingRef: string;
		customer_email?: string;
	}): Promise<{ url: string | null; error: ApiError | null }> {
		const jvzooSvc = new JvzooServerService();
		const { url, error } = jvzooSvc.createCheckoutUrl({ bookingRef, customer_email });

		if (url) {
			const bookingSvc = await this.createSubService(BookingService);
			await bookingSvc.updateBookingCheckoutSessionId(bookingRef, url);
		}

		return { url: url || null, error };
	}

	/** Mark booking as refunded locally — actual refund must be processed in JVZoo dashboard */
	async refundPayment({
		booking_id,
		amount,
		reason,
		note,
	}: {
		booking_id: string;
		amount: number;
		reason: string;
		note: string;
	}) {
		try {
			const { data: booking, error: fetchErr } = await this.supabase
				.from(this.BOOKINGS_TABLE)
				.select(`total, payment:${this.PAYMENTS_TABLE}!inner(payment_status, id, payment_intent_id)`)
				.eq("id", booking_id)
				.single();

			if (fetchErr || !booking) {
				return {
					success: false,
					error: "Booking not found",
					status: 404,
				};
			}

			if (booking.payment.payment_status !== "PAID") {
				return {
					success: false,
					error: "Only paid bookings can be refunded",
					status: 400,
				};
			}

			if (amount > booking.total) {
				return {
					success: false,
					error: `Refund amount cannot exceed paid amount (${booking.total.toFixed(2)} AED)`,
					status: 400,
				};
			}

			const isFullRefund = amount === booking.total;

			const { error: updateErr } = await this.supabase
				.from(this.BOOKINGS_TABLE)
				.update({
					...(isFullRefund && { booking_status: "CANCELLED" }),
					...(isFullRefund && { cancelled_at: new Date().toISOString() }),
				})
				.eq("id", booking_id);

			const { error: updatePaymentErr } = await this.supabase
				.from(this.PAYMENTS_TABLE)
				.update({
					payment_status: isFullRefund ? "REFUNDED" : "PARTIAL",
				})
				.eq("id", booking.payment.id);

			if (updateErr || updatePaymentErr) {
				console.error("Failed to update booking after refund:", updateErr, updatePaymentErr);
				return {
					success: false,
					error: "Failed to update booking after refund. Please update booking manually.",
					status: 500,
				};
			}

			console.log(
				`[Refund] Local status updated for booking ${booking_id}. Process refund in JVZoo dashboard. Reason: ${reason}, Note: ${note}`,
			);

			return {
				success: true,
				refundId: booking.payment.payment_intent_id,
				message:
					"Booking marked as refunded locally. Please also process the refund in your JVZoo seller dashboard.",
			};
		} catch (error: any) {
			return {
				success: false,
				error: error instanceof ApiError ? error.message : "Failed to process refund",
				status: 500,
			};
		}
	}
}
