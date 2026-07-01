import { createHash } from "node:crypto";
import { ApiError } from "@workspace/shared/utils/ApiError";
import { PAYMENT_CURRENCY } from "@workspace/shared/constants/constants";

export type JvzooTransactionType =
	| "SALE"
	| "BILL"
	| "RFND"
	| "CGBK"
	| "INSF"
	| "CANCEL-REBILL"
	| "UNCANCEL-REBILL";

export type JvzooIpnPayload = Record<string, string>;

class JvzooService {
	protected payment_currency: string;

	constructor() {
		this.payment_currency = PAYMENT_CURRENCY;
	}

	public getPaymentCurrency(): string {
		return this.payment_currency;
	}
}

export class JvzooServerService extends JvzooService {
	private secretKey: string;
	private checkoutBaseUrl: string;

	constructor() {
		super();
		if (!process.env.JVZOO_SECRET_KEY) {
			throw new ApiError("JVZoo service not configured: missing JVZOO_SECRET_KEY", 500, []);
		}
		if (!process.env.JVZOO_CHECKOUT_URL) {
			throw new ApiError("JVZoo service not configured: missing JVZOO_CHECKOUT_URL", 500, []);
		}
		this.secretKey = process.env.JVZOO_SECRET_KEY;
		this.checkoutBaseUrl = process.env.JVZOO_CHECKOUT_URL.replace(/\/$/, "");
	}

	/** Verify JVZIPN signature (cverify field) */
	verifyIpnSignature(payload: JvzooIpnPayload): boolean {
		const receivedVerify = payload.cverify;
		if (!receivedVerify) return false;

		const ipnFields = Object.keys(payload)
			.filter((key) => key !== "cverify")
			.sort();

		let pop = "";
		for (const field of ipnFields) {
			pop += (payload[field] ?? "") + "|";
		}
		pop += this.secretKey;

		const calcedVerify = createHash("sha1").update(pop, "utf8").digest("hex").toUpperCase().slice(0, 8);
		return calcedVerify === receivedVerify.toUpperCase();
	}

	/** Parse cvendthru into key-value pairs (e.g. "bookingRef=ABC&foo=bar") */
	parseCvendthru(cvendthru: string | undefined): Record<string, string> {
		if (!cvendthru) return {};
		const result: Record<string, string> = {};
		for (const part of cvendthru.split("&")) {
			const [key, ...rest] = part.split("=");
			if (key) result[decodeURIComponent(key)] = decodeURIComponent(rest.join("=") || "");
		}
		return result;
	}

	/** Extract booking reference from IPN payload */
	getBookingRefFromIpn(payload: JvzooIpnPayload): string | null {
		const fromCvendthru = this.parseCvendthru(payload.cvendthru).bookingRef;
		if (fromCvendthru) return fromCvendthru;
		return payload.bookingRef?.trim() || null;
	}

	/** Parse JVZoo amount — may be dollars ("10.00") or pennies depending on notification version */
	parseTransactionAmount(raw: string | undefined): number | null {
		if (!raw) return null;
		const value = parseFloat(raw);
		if (Number.isNaN(value)) return null;
		// Values over 1000 without decimal are likely pennies (JVZoo docs: 1000 = $10.00)
		if (!raw.includes(".") && value >= 100) {
			return value / 100;
		}
		return value;
	}

	/** Build JVZoo checkout URL with booking reference passed through to IPN via cvendthru */
	createCheckoutUrl({
		bookingRef,
		customer_email,
	}: {
		bookingRef: string;
		customer_email?: string;
	}): { url: string; error: ApiError | null } {
		try {
			const url = new URL(this.checkoutBaseUrl);
			url.searchParams.set("bookingRef", bookingRef);
			if (customer_email) {
				url.searchParams.set("email", customer_email);
			}
			return { url: url.toString(), error: null };
		} catch (err: any) {
			return {
				url: "",
				error: new ApiError(err.message || "Failed to create JVZoo checkout URL", 500),
			};
		}
	}
}
