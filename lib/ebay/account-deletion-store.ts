import type { SupabaseClient } from "@supabase/supabase-js";
import type { EbayDeletionIdentifiers, EbayDeletionStore } from "@/lib/ebay/account-deletion";

type AdminClient = SupabaseClient;

export class SupabaseEbayDeletionStore implements EbayDeletionStore {
  constructor(private readonly admin: AdminClient) {}

  async recordReceived(input: EbayDeletionIdentifiers) {
    const { error } = await this.admin.from("ebay_account_deletion_events").insert({
      notification_id: input.notificationId,
      ebay_user_id: input.ebayUserId,
      event_date: input.eventDate,
      status: "received"
    });

    if (!error) return { duplicate: false };
    if (error.code !== "23505") throw error;

    const { data, error: selectError } = await this.admin
      .from("ebay_account_deletion_events")
      .select("status")
      .eq("notification_id", input.notificationId)
      .maybeSingle<{ status: string | null }>();

    if (selectError) throw selectError;
    return { duplicate: true, status: data?.status ?? null };
  }

  async findMatchingConnection(input: EbayDeletionIdentifiers) {
    const lookups: Array<{ column: "ebay_user_id" | "ebay_username"; value: string }> = [];
    if (input.ebayUserId) lookups.push({ column: "ebay_user_id", value: input.ebayUserId });
    if (input.username) lookups.push({ column: "ebay_username", value: input.username });

    // Some older eBay integrations stored EIAS-like identifiers in the user id column.
    // Keep this as a narrow fallback without adding a new personal-data column.
    if (input.eiasToken) lookups.push({ column: "ebay_user_id", value: input.eiasToken });

    for (const lookup of lookups) {
      const { data, error } = await this.admin
        .from("ebay_connections")
        .select("user_id")
        .eq(lookup.column, lookup.value)
        .maybeSingle<{ user_id: string }>();

      if (error) throw error;
      if (data?.user_id) return { userId: data.user_id };
    }

    return null;
  }

  async deleteConnection(userId: string) {
    const { error } = await this.admin.from("ebay_connections").delete().eq("user_id", userId);
    if (error) throw error;
  }

  async deleteListingDefaults(userId: string) {
    const { error } = await this.admin.from("ebay_listing_defaults").delete().eq("user_id", userId);
    if (error) throw error;
  }

  async scrubListings(userId: string) {
    const { error } = await this.admin
      .from("ebay_listings")
      .update({
        sku: "ebay-account-deleted",
        offer_id: null,
        listing_id: null,
        listing_url: null,
        status: "account_deleted",
        payload: {
          ebayAccountDeletionProcessed: true,
          ebayPersonalDataRemoved: true
        },
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId);

    if (error) throw error;
  }

  async markProcessed(notificationId: string, status: "processed" | "processed_no_match" | "duplicate") {
    const { error } = await this.admin
      .from("ebay_account_deletion_events")
      .update({
        status,
        processed_at: new Date().toISOString(),
        error_message: null
      })
      .eq("notification_id", notificationId);

    if (error) throw error;
  }

  async markFailed(notificationId: string, errorMessage: string) {
    const { error } = await this.admin
      .from("ebay_account_deletion_events")
      .update({
        status: "failed",
        processed_at: new Date().toISOString(),
        error_message: errorMessage.slice(0, 1000)
      })
      .eq("notification_id", notificationId);

    if (error) throw error;
  }
}
