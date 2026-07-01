import { Service } from "@workspace/shared/services/service.base";
import { UseClassMiddleware } from "@workspace/shared/decorators/useClassMiddleware";
import { loggerMiddleware } from "@workspace/shared/middlewares/logger.middleware";
import { ApiError } from "@workspace/shared/utils/ApiError";
import {
	JvzooServerService,
	type JvzooIpnPayload,
	type JvzooTransactionType,
} from "@workspace/shared/services/jvzoo.service";

@UseClassMiddleware(loggerMiddleware)
export class PaymentService extends Service {
	async handleJvzooIpn(payload: JvzooIpnPayload): Promise<{ success: boolean; error?: string }> {
		const jvzooSvc = new JvzooServerService();

		if (!jvzooSvc.verifyIpnSignature(payload)) {
			console.error("[JVZIPN] Invalid signature");
			return { success: false, error: "Invalid IPN signature" };
		}

		const transactionType = payload.ctransaction as JvzooTransactionType | undefined;
		const bookingRef = jvzooSvc.getBookingRefFromIpn(payload);
		const receiptId = payload.ctransreceipt?.trim();

		if (!bookingRef) {
			console.error("[JVZIPN] Missing bookingRef in payload", payload);
			return { success: false, error: "Missing booking reference" };
		}

		const { data: booking, error: fetchErr } = await this.supabase
			.from(this.BOOKINGS_TABLE)
			.select(
				`
				id,
				total,
				payment_id,
				booking_ref,
				booking_status,
				payment:${this.PAYMENTS_TABLE}!inner (
					id,
					payment_status,
					payment_intent_id
				)
			`,
			)
			.eq("booking_ref", bookingRef)
			.single();

		if (fetchErr || !booking) {
			console.error("[JVZIPN] Booking not found:", bookingRef);
			return { success: false, error: "Booking not found" };
		}

		switch (transactionType) {
			case "SALE":
			case "BILL":
				return this.handleSuccessfulPayment(booking, payload, receiptId, jvzooSvc);
			case "RFND":
			case "CGBK":
			case "INSF":
				return this.handleRefund(booking, receiptId);
			default:
				console.log("[JVZIPN] Ignoring transaction type:", transactionType);
				return { success: true };
		}
	}

	private async handleSuccessfulPayment(
		booking: {
			id: string;
			total: number;
			payment_id: string | null;
			booking_status: string;
			payment: { id: string; payment_status: string; payment_intent_id: string | null };
		},
		payload: JvzooIpnPayload,
		receiptId: string | undefined,
		jvzooSvc: JvzooServerService,
	): Promise<{ success: boolean; error?: string }> {
		if (booking.payment.payment_status === "PAID") {
			return { success: true };
		}

		const paidAmount = jvzooSvc.parseTransactionAmount(payload.ctransamount);
		if (paidAmount != null && Math.abs(paidAmount - booking.total) > 0.02) {
			console.warn(
				`[JVZIPN] Amount mismatch for ${booking.id}: expected ${booking.total}, got ${paidAmount}`,
			);
		}

		const { error: paymentErr } = await this.supabase
			.from(this.PAYMENTS_TABLE)
			.update({
				payment_status: "PAID",
				paid_amount: paidAmount ?? booking.total,
				paid_at: new Date().toISOString(),
				payment_intent_id: receiptId ?? booking.payment.payment_intent_id,
			})
			.eq("id", booking.payment.id);

		if (paymentErr) {
			throw new ApiError("Failed to update payment", 500, [paymentErr]);
		}

		if (booking.booking_status === "PENDING") {
			await this.supabase
				.from(this.BOOKINGS_TABLE)
				.update({ booking_status: "CONFIRMED" })
				.eq("id", booking.id);
		}

		return { success: true };
	}

	private async handleRefund(
		booking: {
			id: string;
			payment_id: string | null;
			payment: { id: string };
		},
		receiptId: string | undefined,
	): Promise<{ success: boolean; error?: string }> {
		const { error: paymentErr } = await this.supabase
			.from(this.PAYMENTS_TABLE)
			.update({
				payment_status: "REFUNDED",
				...(receiptId && { payment_intent_id: receiptId }),
			})
			.eq("id", booking.payment.id);

		if (paymentErr) {
			throw new ApiError("Failed to update refund status", 500, [paymentErr]);
		}

		await this.supabase
			.from(this.BOOKINGS_TABLE)
			.update({
				booking_status: "CANCELLED",
				cancelled_at: new Date().toISOString(),
			})
			.eq("id", booking.id);

		return { success: true };
	}
}
